import { findBot, getContainerName } from '../lib/config.js';
import { containerRunning, execInContainer } from '../lib/docker.js';
import { p } from '../lib/prompt.js';

export async function approve(name, channel, code) {
  const bot = findBot(name);
  if (!bot) {
    p.log.error(`Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  const containerName = getContainerName(name);

  if (!containerRunning(containerName)) {
    p.log.error(`Bot '${name}' is not running.`);
    process.exit(1);
  }

  p.log.step(`Approving ${channel} pairing for '${name}'...`);
  // stdio:'inherit' intentional — openclaw pairing output is user-facing feedback
  execInContainer(containerName, `openclaw pairing approve ${channel} ${code}`);
}
