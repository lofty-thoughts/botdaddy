import { findBot, getBotDir, loadRegistry, saveRegistry } from '../lib/config.js';
import { makeRL, askSecret } from '../lib/prompt.js';
import { apply } from './apply.js';
import { writeChannelCredential } from '../lib/openclaw.js';

export async function telegram(name) {
  const bot = findBot(name);
  if (!bot) {
    console.error(`  Error: Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  const rl = makeRL();

  console.log('\n  Create a bot via @BotFather on Telegram, then paste the token here.');
  const token = await askSecret('  Telegram bot token');
  rl.close();

  if (!token) {
    console.error('  Error: Token is required.');
    process.exit(1);
  }

  // Update botdaddy.json
  const reg = loadRegistry();
  const entry = reg.bots.find(b => b.name === name);
  if (entry) {
    entry.telegram = true;
    saveRegistry(reg);
  }

  // Write botToken directly to openclaw.json channel config
  writeChannelCredential(getBotDir(name), 'telegram', { botToken: token });

  // Apply config (enables plugin, restarts if running)
  await apply(name);

  console.log(`\n  Telegram configured for '${name}'.`);
}
