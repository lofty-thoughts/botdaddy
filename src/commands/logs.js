import { findBot, getContainerName } from '../lib/config.js';
import { containerExists, followLogs } from '../lib/docker.js';
import { p } from '../lib/prompt.js';

export async function logs(name) {
  const bot = findBot(name);
  if (!bot) {
    p.log.error(`Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  const containerName = getContainerName(name);

  if (!containerExists(containerName)) {
    p.log.error(`No container found for '${name}'. Start it first.`);
    process.exit(1);
  }

  followLogs(containerName);
}
