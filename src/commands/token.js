import { findBot, getBotDir } from '../lib/config.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function token(name) {
  const bot = findBot(name);
  if (!bot) {
    console.error(`  Error: Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  const configPath = join(getBotDir(name), 'openclaw.json');
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    const t = config.gateway?.auth?.token;
    if (t) {
      console.log(t);
    } else {
      console.error('  Error: No gateway token found in openclaw.json');
      process.exit(1);
    }
  } catch (err) {
    console.error(`  Error: Could not read ${configPath}: ${err.message}`);
    process.exit(1);
  }
}
