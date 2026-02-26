import { findBot, getStack, getBotDir } from '../lib/config.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { p } from '../lib/prompt.js';
import { isMac, openUrl } from '../lib/platform.js';

export async function dashboard(name) {
  const bot = findBot(name);
  if (!bot) {
    p.log.error(`Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  const stack      = getStack();
  const configPath = join(getBotDir(name), 'openclaw.json');
  let token = '';
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    token = config.gateway?.auth?.token || '';
  } catch {}

  let url;
  if (isMac) {
    const orbDomain = `${stack.namespace}-${name}.orb.local`;
    url = `https://${orbDomain}/#token=${token}`;
  } else {
    url = `http://localhost:${bot.gatewayPort}/#token=${token}`;
  }

  p.log.info(url);
  try {
    openUrl(url);
  } catch {
    p.log.warn('Could not open browser automatically.');
  }
}
