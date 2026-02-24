import { findBot, getContainerName, loadRegistry } from '../lib/config.js';
import { containerRunning, stopContainer } from '../lib/docker.js';
import { p } from '../lib/prompt.js';

export async function stop(name) {
  if (name) {
    const bot = findBot(name);
    if (!bot) {
      p.log.error(`Bot '${name}' not found in botdaddy.json`);
      process.exit(1);
    }

    const containerName = getContainerName(name);

    if (!containerRunning(containerName)) {
      p.log.info(`Bot '${name}' is not running.`);
      return;
    }

    const s = p.spinner();
    s.start(`Stopping ${name}...`);
    stopContainer(containerName);
    s.stop(`Bot '${name}' stopped.`);
    return;
  }

  // All bots
  const reg = loadRegistry();
  if (reg.bots.length === 0) {
    p.log.info('No bots registered.');
    return;
  }

  p.intro('Stop all');
  const s = p.spinner();
  let stopped = 0;

  for (const bot of reg.bots) {
    const containerName = getContainerName(bot.name);
    if (!containerRunning(containerName)) {
      p.log.info(`${bot.name} — not running, skipped`);
      continue;
    }
    s.start(`Stopping ${bot.name}...`);
    stopContainer(containerName);
    s.stop(`${bot.name} stopped`);
    stopped++;
  }

  p.outro(`Stopped ${stopped} bot(s).`);
}
