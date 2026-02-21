import { findBot, getContainerName } from '../lib/config.js';
import { containerRunning, execInContainer } from '../lib/docker.js';

export async function approve(name, channel, code) {
  const bot = findBot(name);
  if (!bot) {
    console.error(`  Error: Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  const containerName = getContainerName(name);

  if (!containerRunning(containerName)) {
    console.error(`  Error: Bot '${name}' is not running.`);
    process.exit(1);
  }

  console.log(`  Approving ${channel} pairing for '${name}'...`);
  execInContainer(containerName, `openclaw pairing approve ${channel} ${code}`);
}
