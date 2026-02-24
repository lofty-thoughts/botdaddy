import { findBot, getContainerName, loadRegistry } from '../lib/config.js';
import { containerRunning, stopContainer, startContainer } from '../lib/docker.js';
import { p } from '../lib/prompt.js';

export async function restart(name) {
  if (name) {
    const bot = findBot(name);
    if (!bot) {
      p.log.error(`Bot '${name}' not found in botdaddy.json`);
      process.exit(1);
    }

    const containerName = getContainerName(name);

    if (!containerRunning(containerName)) {
      p.log.error(`Bot '${name}' is not running. Use: botdaddy start ${name}`);
      process.exit(1);
    }

    const s = p.spinner();
    s.start(`Restarting ${name}...`);
    stopContainer(containerName);
    startContainer(containerName);
    s.stop(`Bot '${name}' restarted.`);
    return;
  }

  // All bots
  const reg = loadRegistry();
  if (reg.bots.length === 0) {
    p.log.info('No bots registered.');
    return;
  }

  p.intro('Restart all');
  const s = p.spinner();
  let restarted = 0;

  for (const bot of reg.bots) {
    const containerName = getContainerName(bot.name);
    if (!containerRunning(containerName)) {
      p.log.info(`${bot.name} — not running, skipped`);
      continue;
    }
    s.start(`Restarting ${bot.name}...`);
    stopContainer(containerName);
    startContainer(containerName);
    s.stop(`${bot.name} restarted`);
    restarted++;
  }

  p.outro(`Restarted ${restarted} bot(s).`);
}
