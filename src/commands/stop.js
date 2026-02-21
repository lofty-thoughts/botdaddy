import { findBot, getContainerName } from '../lib/config.js';
import { containerRunning, stopContainer } from '../lib/docker.js';
import { p } from '../lib/prompt.js';

export async function stop(name) {
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
}
