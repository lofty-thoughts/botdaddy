import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
  } catch {
    // Non-fatal — apply will still proceed
  }

  return actualToken;
}

/**
 * Merge credentials into a channel's config in openclaw.json.
 * Creates the channels section if needed; preserves existing fields.
 */
export function writeChannelCredential(botDir, channel, creds) {
  const configPath = join(botDir, 'openclaw.json');
  if (!existsSync(configPath)) return;

  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  if (!config.channels) config.channels = {};
  config.channels[channel] = { ...config.channels[channel], ...creds };
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}
