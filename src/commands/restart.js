import { findBot, getContainerName } from '../lib/config.js';
import { containerRunning, stopContainer, startContainer } from '../lib/docker.js';

export async function restart(name) {
  const bot = findBot(name);
  if (!bot) {
    console.error(`  Error: Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  const containerName = getContainerName(name);

  if (!containerRunning(containerName)) {
    console.error(`  Error: Bot '${name}' is not running. Use 'botdaddy start ${name}' instead.`);
    process.exit(1);
  }

  console.log(`  Restarting '${name}'...`);
  stopContainer(containerName);
  startContainer(containerName);
  console.log(`  Bot '${name}' restarted.`);
}
