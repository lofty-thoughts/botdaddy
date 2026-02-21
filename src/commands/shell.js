import { findBot, getContainerName } from '../lib/config.js';
import { containerRunning, execShell } from '../lib/docker.js';
import { p } from '../lib/prompt.js';

export async function shell(name) {
  const bot = findBot(name);
  if (!bot) {
    p.log.error(`Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  const containerName = getContainerName(name);

  if (!containerRunning(containerName)) {
    p.log.error(`Bot '${name}' is not running. Start it first.`);
    process.exit(1);
  }

  execShell(containerName);
}
