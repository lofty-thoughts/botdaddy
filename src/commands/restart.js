import { findBot, getContainerName } from '../lib/config.js';
import { containerRunning, stopContainer, startContainer } from '../lib/docker.js';
import { p } from '../lib/prompt.js';

export async function restart(name) {
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
}
