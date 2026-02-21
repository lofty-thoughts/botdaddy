import { findBot, getBotDir } from '../lib/config.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { p } from '../lib/prompt.js';

export async function token(name) {
  const bot = findBot(name);
  if (!bot) {
    p.log.error(`Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  const configPath = join(getBotDir(name), 'openclaw.json');
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    const t = config.gateway?.auth?.token;
    if (t) {
      // Raw stdout — intentional so the token can be piped: botdaddy token mybot | pbcopy
      process.stdout.write(t + '\n');
    } else {
      p.log.error('No gateway token found in openclaw.json');
      process.exit(1);
    }
  } catch (err) {
    p.log.error(`Could not read ${configPath}: ${err.message}`);
    process.exit(1);
  }
}
