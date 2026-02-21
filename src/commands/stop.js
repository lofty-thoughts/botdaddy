import { findBot, getContainerName } from '../lib/config.js';
import { containerRunning, stopContainer } from '../lib/docker.js';

export async function stop(name) {
  const bot = findBot(name);
  if (!bot) {
    console.error(`  Error: Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  const containerName = getContainerName(name);

  if (!containerRunning(containerName)) {
    console.log(`  Bot '${name}' is not running.`);
    return;
  }

  console.log(`  Stopping '${containerName}'...`);
  stopContainer(containerName);
  console.log(`  Bot '${name}' stopped.`);
}
