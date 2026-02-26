import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { findBot, getStack, getBotDir, getContainerName, loadRegistry } from '../lib/config.js';
import {
  checkDocker, containerExists, containerRunning,
  startContainer, runContainer, ensureNetwork,
} from '../lib/docker.js';
import { p } from '../lib/prompt.js';
import { isMac } from '../lib/platform.js';

/**
 * Start or create a single bot's container and wait for its gateway.
 * Returns { skipped, ready, orbDomain }.
 */
async function startBot(bot, name, stack, s) {
  const containerName = getContainerName(name);
  const botDir        = getBotDir(name);
  const networkName   = `${stack.namespace}-net`;
  const orbDomain     = isMac ? `${stack.namespace}-${name}.orb.local` : null;

  ensureNetwork(networkName);

  if (containerRunning(containerName)) {
    return { skipped: true, orbDomain };
  }

  if (containerExists(containerName)) {
    s.start(`Starting ${name}...`);
    startContainer(containerName);
    s.stop(`${name} started`);
  } else {
    s.start(`Creating ${name}...`);

    const extraVolumes = [
      `${join(botDir, '.vscode-server')}:/root/.vscode-server`,
      `${join(botDir, '.cursor-server')}:/root/.cursor-server`,
    ];

    if (bot.tailscale) {
      extraVolumes.push(`${join(botDir, '.tailscale')}:/var/lib/tailscale`);
    }

    const tailscaleOpts = bot.tailscale ? {
      capAdd:  ['NET_ADMIN', 'NET_RAW'],
      devices: ['/dev/net/tun:/dev/net/tun'],
    } : {};

    runContainer({
      containerName,
      imageName:    stack.imageName,
      botDir,
      envFile:      join(botDir, '.env'),
      gatewayPort:  bot.gatewayPort,
      devPortStart: bot.devPortStart,
      devPortEnd:   bot.devPortEnd,
      network:      networkName,
      orbDomain,
      extraVolumes,
      ...tailscaleOpts,
    });
    s.stop(`${name} created`);
  }

  // Wait for gateway
  const gwUrl    = `http://localhost:${bot.gatewayPort}`;
  const maxWait  = 60_000;
  const t0       = Date.now();
  let ready      = false;

  s.start(`Waiting for ${name} gateway...`);
  while (Date.now() - t0 < maxWait) {
    try {
      execSync(`curl -sfo /dev/null ${gwUrl}`, { stdio: 'pipe' });
      ready = true;
      break;
    } catch {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (ready) {
    s.stop(`${name} gateway ready`);
  } else {
    s.stop(`${name} gateway not responding — may still be starting`);
  }

  return { skipped: false, ready, orbDomain };
}

export async function start(name) {
  if (!checkDocker()) {
    p.log.error('Docker is not running.');
    process.exit(1);
  }

  const stack = getStack();

  if (!name) {
    // All bots
    const reg = loadRegistry();
    if (reg.bots.length === 0) {
      p.log.info('No bots registered.');
      return;
    }

    p.intro('Start all');
    const s = p.spinner();
    let started = 0;

    for (const bot of reg.bots) {
      const result = await startBot(bot, bot.name, stack, s);
      if (result.skipped) {
        p.log.info(`${bot.name} — already running`);
      } else {
        started++;
      }
    }

    p.outro(`Started ${started} bot(s).`);
    return;
  }

  // Single bot
  const bot = findBot(name);
  if (!bot) {
    p.log.error(`Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  p.intro(`Start: ${name}`);
  const s = p.spinner();
  const result = await startBot(bot, name, stack, s);

  if (result.skipped) {
    p.log.info(`Bot '${name}' is already running.`);
    const outroMsg = result.orbDomain
      ? `Gateway: http://localhost:${bot.gatewayPort}\n  OrbStack: https://${result.orbDomain}`
      : `Gateway: http://localhost:${bot.gatewayPort}`;
    p.outro(outroMsg);
    return;
  }

  const outroLines = [
    `Gateway:   http://localhost:${bot.gatewayPort}`,
  ];
  if (result.orbDomain) {
    outroLines.push(`OrbStack:  https://${result.orbDomain}`);
  }
  outroLines.push(`Dev ports: ${bot.devPortStart}-${bot.devPortEnd}`);
  if (bot.tailscale) {
    outroLines.push(`Tailscale: ${stack.namespace}-${name}`);
  }

  p.outro(`Bot '${name}' running.\n\n  ${outroLines.join('\n  ')}`);
}
