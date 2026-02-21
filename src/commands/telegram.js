import { findBot, getBotDir, loadRegistry, saveRegistry } from '../lib/config.js';
import { p, guard } from '../lib/prompt.js';
import { apply } from './apply.js';
import { writeChannelCredential } from '../lib/openclaw.js';

export async function telegram(name) {
  const bot = findBot(name);
  if (!bot) {
    p.log.error(`Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  p.intro(`Telegram: ${name}`);

  p.log.info('Create a bot via @BotFather on Telegram, then paste the token here.');
  const token = guard(await p.password({ message: 'Telegram bot token' }));

  if (!token) {
    p.cancel('Token is required.');
    process.exit(1);
  }

  const reg   = loadRegistry();
  const entry = reg.bots.find(b => b.name === name);
  if (entry) {
    entry.telegram = true;
    saveRegistry(reg);
  }

  writeChannelCredential(getBotDir(name), 'telegram', { botToken: token });

  const s = p.spinner();
  s.start('Applying config...');
  await apply(name, { quiet: true });
  s.stop('Config applied');

  p.outro(`Telegram configured for '${name}'.`);
}
