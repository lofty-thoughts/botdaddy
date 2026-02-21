import { findBot, getContainerName } from '../lib/config.js';
import { containerExists, followLogs } from '../lib/docker.js';

export async function logs(name) {
  const bot = findBot(name);
  if (!bot) {
    console.error(`  Error: Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  const containerName = getContainerName(name);

  if (!containerExists(containerName)) {
    console.error(`  Error: No container found for '${name}'. Start it first.`);
    process.exit(1);
  }

  followLogs(containerName);
}
