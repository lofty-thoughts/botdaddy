import { findBot, getContainerName } from '../lib/config.js';
import { containerRunning, execShell } from '../lib/docker.js';

export async function shell(name) {
  const bot = findBot(name);
  if (!bot) {
    console.error(`  Error: Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  const containerName = getContainerName(name);

  if (!containerRunning(containerName)) {
    console.error(`  Error: Bot '${name}' is not running. Start it first.`);
    process.exit(1);
  }

  execShell(containerName);
}
