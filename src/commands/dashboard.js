import { findBot, getStack, getBotDir } from '../lib/config.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

export async function dashboard(name) {
  const bot = findBot(name);
  if (!bot) {
    console.error(`  Error: Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  const stack = getStack();
  const configPath = join(getBotDir(name), 'openclaw.json');
  let token = '';
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    token = config.gateway?.auth?.token || '';
  } catch {}

  const orbDomain = `${stack.namespace}-${name}.orb.local`;
  const url = `https://${orbDomain}/#token=${token}`;

  console.log(`  ${url}`);
  try {
    execSync(`open "${url}"`, { stdio: 'ignore' });
  } catch {
    console.log('  Could not open browser automatically.');
  }
}
