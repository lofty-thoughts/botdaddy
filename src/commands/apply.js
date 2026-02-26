import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, chmodSync, cpSync } from 'node:fs';
import { execSync } from 'node:child_process';
import {
  findBot, getStack, getBotDir, getContainerName,
  loadHomeConfig, PROJECT_ROOT,
} from '../lib/config.js';
import {
  checkDocker, imageExists, buildImage,
  containerRunning, containerExists, ensureNetwork,
  runOneShotContainer, stopContainer, startContainer,
} from '../lib/docker.js';
import { SEED_ROOT, genToken, today, templateFile } from '../lib/scaffold.js';
import { fixConfigAfterOnboard } from '../lib/openclaw.js';
import { getProvider } from '../lib/providers.js';
import { p } from '../lib/prompt.js';

/**
 * Apply config from botdaddy.json to a bot's files and container.
 * Idempotent — safe to run repeatedly.
 *
 * @param {string} name
 * @param {{ quiet?: boolean, spinner?: object }} opts
 *   quiet   — suppress all output (used when called from config wizard)
 *   spinner — an already-running clack spinner to reuse for step labels
 */
export async function apply(name, { quiet = false, spinner = null } = {}) {
  const log  = quiet ? () => {} : (...a) => p.log.step(a.join(' '));
  const spin = quiet ? { start: () => {}, stop: () => {} }
    : spinner ?? { start: () => {}, stop: () => {} };

  const bot = findBot(name);
  if (!bot) {
    p.log.error(`Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  const stack         = getStack();
  const botDir        = getBotDir(name);
  const containerName = getContainerName(name);
  const homeConfig    = loadHomeConfig();

  // ── Prerequisites ──────────────────────────────────────────
  if (!checkDocker()) {
    p.log.error('Docker is not running.');
    process.exit(1);
  }

  const dockerDir = join(PROJECT_ROOT, 'docker');
  if (!imageExists(stack.imageName)) {
    const s = quiet ? null : p.spinner();
    s?.start(`Building image '${stack.imageName}'...`);
    buildImage(stack.imageName, dockerDir);
    s?.stop(`Built image '${stack.imageName}'`);
  }

  const networkName = `${stack.namespace}-net`;
  ensureNetwork(networkName);

  // ── Scaffold directories ───────────────────────────────────
  const workspaceDir = join(botDir, 'workspace');
  const memoryDir    = join(workspaceDir, 'memory');
  const isNew        = !existsSync(workspaceDir);

  mkdirSync(memoryDir, { recursive: true });
  mkdirSync(join(botDir, '.vscode-server'), { recursive: true });
  mkdirSync(join(botDir, '.cursor-server'), { recursive: true });

  if (bot.tailscale) {
    mkdirSync(join(botDir, '.tailscale'), { recursive: true });
  }

  if (isNew) {
    const baseDir = join(SEED_ROOT, 'base');
    if (existsSync(baseDir)) {
      const vars = {
        AGENT_NAME:              name,
        DATE:                    today,
        BOTDADDY_DEV_PORT_START: String(bot.devPortStart),
        BOTDADDY_DEV_PORT_END:   String(bot.devPortEnd),
        BOTDADDY_GATEWAY_PORT:   String(bot.gatewayPort),
      };
      for (const f of readdirSync(baseDir)) {
        templateFile(join(baseDir, f), join(workspaceDir, f), vars);
      }
      log('Scaffolded workspace seed files');
    }

    const seedSkillsDir = join(SEED_ROOT, 'skills');
    if (existsSync(seedSkillsDir)) {
      cpSync(seedSkillsDir, join(workspaceDir, 'skills'), { recursive: true });
      log('Seeded workspace skills');
    }

    try {
      execSync('git init', { cwd: workspaceDir, stdio: 'pipe' });
      execSync('git add -A', { cwd: workspaceDir, stdio: 'pipe' });
      execSync('git commit -m "Initial workspace"', { cwd: workspaceDir, stdio: 'pipe' });
      log('Initialized git in workspace');
    } catch { /* non-fatal */ }
  }

  // ── Resolve provider + secrets ─────────────────────────────
  const provider    = (bot.provider || 'anthropic').toLowerCase().replace(/\s*\(.*\)/, '');
  const providerDef = getProvider(provider);
  let apiKey        = '';

  if (providerDef.needsApiKey) {
    apiKey = process.env._BOTDADDY_API_KEY || homeConfig[providerDef.homeConfigKey] || '';
  }

  // ── Generate / update .env ─────────────────────────────────
  const envPath = join(botDir, '.env');
  let gatewayToken;

  if (existsSync(envPath)) {
    const env        = readFileSync(envPath, 'utf8');
    const tokenMatch = env.match(/^OPENCLAW_GATEWAY_TOKEN=(.+)$/m);
    gatewayToken     = tokenMatch?.[1] || genToken();

    let updated = env;
    if (apiKey && providerDef.apiKeyEnvVar) {
      const re = new RegExp(`^${providerDef.apiKeyEnvVar}=.*$`, 'm');
      if (re.test(updated)) {
        updated = updated.replace(re, `${providerDef.apiKeyEnvVar}=${apiKey}`);
      } else {
        updated += `${providerDef.apiKeyEnvVar}=${apiKey}\n`;
      }
    }
    updated = updated.replace(/^BOTDADDY_DEV_PORT_START=.*$/m, `BOTDADDY_DEV_PORT_START=${bot.devPortStart}`);
    updated = updated.replace(/^BOTDADDY_DEV_PORT_END=.*$/m,   `BOTDADDY_DEV_PORT_END=${bot.devPortEnd}`);

    // Tailscale
    if (bot.tailscale) {
      const tsKey      = homeConfig.tailscaleAuthKey || '';
      const tsHostname = `${stack.namespace}-${name}`;
      if (tsKey) {
        if (/^TS_AUTHKEY=.*$/m.test(updated)) {
          updated = updated.replace(/^TS_AUTHKEY=.*$/m, `TS_AUTHKEY=${tsKey}`);
          updated = updated.replace(/^TS_HOSTNAME=.*$/m, `TS_HOSTNAME=${tsHostname}`);
        } else {
          updated += `\n# Tailscale\nTS_AUTHKEY=${tsKey}\nTS_HOSTNAME=${tsHostname}\n`;
        }
      }
    } else {
      updated = updated.replace(/\n# Tailscale\nTS_AUTHKEY=.*\nTS_HOSTNAME=.*\n?/, '');
      updated = updated.replace(/^TS_AUTHKEY=.*\n?/m, '');
      updated = updated.replace(/^TS_HOSTNAME=.*\n?/m, '');
    }

    writeFileSync(envPath, updated);
  } else {
    gatewayToken     = genToken();
    const seedEnv    = join(SEED_ROOT, 'env.template');
    let envContent   = readFileSync(seedEnv, 'utf8');
    envContent = envContent.replaceAll('{{AGENT_NAME}}',              name);
    envContent = envContent.replaceAll('{{DATE}}',                    today);
    envContent = envContent.replaceAll('{{GATEWAY_TOKEN}}',           gatewayToken);
    envContent = envContent.replaceAll('{{BOTDADDY_DEV_PORT_START}}', String(bot.devPortStart));
    envContent = envContent.replaceAll('{{BOTDADDY_DEV_PORT_END}}',   String(bot.devPortEnd));
    if (apiKey && providerDef.apiKeyEnvVar) {
      envContent = envContent.replace(`${providerDef.apiKeyEnvVar}=`, `${providerDef.apiKeyEnvVar}=${apiKey}`);
    }

    if (bot.tailscale) {
      const tsKey = homeConfig.tailscaleAuthKey || '';
      if (tsKey) {
        const tsHostname = `${stack.namespace}-${name}`;
        envContent += `\n# Tailscale\nTS_AUTHKEY=${tsKey}\nTS_HOSTNAME=${tsHostname}\n`;
      }
    }

    writeFileSync(envPath, envContent);
    chmodSync(envPath, 0o600);
    log('Generated .env');
  }

  // ── Generate / update openclaw.json ────────────────────────
  const configPath = join(botDir, 'openclaw.json');
  let config;

  if (existsSync(configPath)) {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  } else {
    const tmpl = readFileSync(join(SEED_ROOT, 'openclaw.json.template'), 'utf8');
    config     = JSON.parse(tmpl.replaceAll('{{OPENCLAW_GATEWAY_TOKEN}}', gatewayToken));
    log('Created openclaw.json');
  }

  // Ensure gateway config
  if (!config.gateway) config.gateway = {};
  config.gateway.trustedProxies = config.gateway.trustedProxies || ['192.168.0.0/16'];
  if (!config.gateway.auth?.token) {
    if (!config.gateway.auth) config.gateway.auth = {};
    config.gateway.auth.mode  = 'token';
    config.gateway.auth.token = gatewayToken;
  }

  // Provider-specific model config
  const model          = bot.model || providerDef.defaultModel;
  const providerConfig = providerDef.buildConfig(model);

  config.agents.defaults.model   = providerConfig.agentModel;
  config.agents.defaults.models  = { ...config.agents.defaults.models, ...providerConfig.agentModels };
  config.agents.defaults.subagents = {
    ...config.agents.defaults.subagents,
    model: providerConfig.subagentsModel,
  };

  if (providerConfig.providerEndpoint) {
    if (!config.models) config.models = {};
    config.models.mode = 'merge';
    if (!config.models.providers) config.models.providers = {};
    config.models.providers[providerConfig.providerEndpoint.providerKey] =
      providerConfig.providerEndpoint.config;
  }

  // Channel configs
  if (!config.channels) config.channels = {};
  if (!config.plugins)  config.plugins  = {};
  if (!config.plugins.entries) config.plugins.entries = {};

  if (bot.mattermost) {
    config.channels.mattermost        = { ...config.channels.mattermost, enabled: true };
    config.plugins.entries.mattermost = { enabled: true };
  } else {
    if (config.channels.mattermost)        config.channels.mattermost.enabled        = false;
    if (config.plugins.entries.mattermost) config.plugins.entries.mattermost.enabled = false;
  }

  if (bot.telegram) {
    config.channels.telegram        = { ...config.channels.telegram, enabled: true };
    config.plugins.entries.telegram = { enabled: true };
  } else {
    if (config.channels.telegram)        config.channels.telegram.enabled        = false;
    if (config.plugins.entries.telegram) config.plugins.entries.telegram.enabled = false;
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2));
  log('Updated openclaw.json');

  // ── Onboard if needed ──────────────────────────────────────
  const identityExists = existsSync(join(botDir, 'identity'))
    || existsSync(join(botDir, 'agents', 'main', 'agent', 'device.json'));

  if (!identityExists) {
    const s = quiet ? null : p.spinner();
    s?.start('Running openclaw onboard...');
    try {
      runOneShotContainer({
        containerName,
        imageName: stack.imageName,
        botDir,
        envFile: envPath,
        command: ['openclaw', 'onboard', '--non-interactive', '--accept-risk', '--skip-daemon', '--skip-health'],
      });
      s?.stop('Identity created');
      fixConfigAfterOnboard({ botDir, originalToken: gatewayToken });
    } catch (err) {
      s?.stop(`Onboard failed: ${err.message}`);
    }
  }

  // ── Restart container if running ───────────────────────────
  if (containerRunning(containerName)) {
    const s = quiet ? null : p.spinner();
    s?.start(`Restarting ${containerName}...`);
    stopContainer(containerName);
    startContainer(containerName);
    s?.stop('Restarted');
  } else if (containerExists(containerName)) {
    log(`Container stopped. Start with: botdaddy start ${name}`);
  } else {
    log(`Start with: botdaddy start ${name}`);
  }
}
