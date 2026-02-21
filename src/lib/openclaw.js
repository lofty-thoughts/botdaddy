import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SEED_ROOT, templateFile } from './scaffold.js';

/**
 * Write openclaw.json from template.
 */
export function writeOpenClawConfig({ botDir, gatewayToken }) {
  const configPath = join(botDir, 'openclaw.json');
  templateFile(
    join(SEED_ROOT, 'openclaw.json.template'),
    configPath,
    { OPENCLAW_GATEWAY_TOKEN: gatewayToken },
  );

  // Add OrbStack trusted proxies
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    if (!config.gateway) config.gateway = {};
    config.gateway.trustedProxies = ['192.168.0.0/16'];
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (err) {
    console.log(`  Warning: Could not add trustedProxies: ${err.message}`);
  }

  console.log('  Wrote openclaw.json');
}

/**
 * Write auth-profiles.json with API key credentials.
 */
export function writeAuthProfiles({ botDir, anthropicKey, openaiKey, mattermostUrl, mattermostToken }) {
  const hasAny = anthropicKey || openaiKey || (mattermostUrl && mattermostToken);
  if (!hasAny) return;

  const authDir = join(botDir, 'agents', 'main', 'agent');
  mkdirSync(authDir, { recursive: true });

  const profiles = { version: 1, profiles: {} };

  if (anthropicKey) {
    profiles.profiles['anthropic:default'] = {
      type: 'token',
      provider: 'anthropic',
      token: anthropicKey,
    };
  }

  if (openaiKey) {
    profiles.profiles['openai:default'] = {
      type: 'token',
      provider: 'openai',
      token: openaiKey,
    };
  }

  if (mattermostUrl && mattermostToken) {
    profiles.profiles.mattermost = {
      url: mattermostUrl,
      token: mattermostToken,
    };
  }

  writeFileSync(join(authDir, 'auth-profiles.json'), JSON.stringify(profiles, null, 2));
  console.log('  Wrote auth-profiles.json');
}

/**
 * Add Mattermost channel config to openclaw.json.
 */
export function addMattermostToConfig({ botDir }) {
  const configPath = join(botDir, 'openclaw.json');
  if (!existsSync(configPath)) return;

  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    if (!config.channels) config.channels = {};
    config.channels.mattermost = { enabled: true, profile: 'mattermost' };
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('  Added Mattermost channel to openclaw.json');
  } catch (err) {
    console.log(`  Warning: Could not update openclaw.json for Mattermost: ${err.message}`);
  }
}

/**
 * Fix openclaw.json after onboard (it resets gateway.bind and regenerates token).
 * Returns the actual token (which may differ from the original if onboard regenerated it).
 */
export function fixConfigAfterOnboard({ botDir, originalToken }) {
  let actualToken = originalToken;
  const configPath = join(botDir, 'openclaw.json');

  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    if (config.gateway) {
      config.gateway.bind = 'lan';
      // Capture the token onboard generated
      if (config.gateway.auth?.token) {
        actualToken = config.gateway.auth.token;
      }
    }
    writeFileSync(configPath, JSON.stringify(config, null, 2));

    // Sync actual token back to .env if it changed
    if (actualToken !== originalToken) {
      const envPath = join(botDir, '.env');
      if (existsSync(envPath)) {
        let envContent = readFileSync(envPath, 'utf8');
        envContent = envContent.replace(
          /^OPENCLAW_GATEWAY_TOKEN=.*/m,
          `OPENCLAW_GATEWAY_TOKEN=${actualToken}`,
        );
        writeFileSync(envPath, envContent);
      }
    }
  } catch (err) {
    console.log(`  Warning: Could not fix config after onboard: ${err.message}`);
  }

  return actualToken;
}
