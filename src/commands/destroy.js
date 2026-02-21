import { rmSync } from 'node:fs';
import { findBot, removeBot, getBotDir, getContainerName } from '../lib/config.js';
import { containerExists, containerRunning, stopContainer, removeContainer } from '../lib/docker.js';
import { makeRL, ask } from '../lib/prompt.js';

export async function destroy(name) {
  const bot = findBot(name);
  if (!bot) {
    console.error(`  Error: Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  const rl = makeRL();

  // Confirm by typing bot name
  const confirm = await ask(rl, `  Type '${name}' to confirm destruction`);
  if (confirm !== name) {
    console.log('  Aborted.');
    rl.close();
    return;
  }

  const containerName = getContainerName(name);

  // Stop if running
  if (containerRunning(containerName)) {
    console.log(`  Stopping '${containerName}'...`);
    stopContainer(containerName);
  }

  // Remove container
  if (containerExists(containerName)) {
    console.log(`  Removing container '${containerName}'...`);
    removeContainer(containerName);
  }

  // Optionally delete files
  const botDir = getBotDir(name);
  const deleteFiles = await ask(rl, `  Delete ${botDir}?`, 'n');
  if (deleteFiles.toLowerCase() === 'y') {
    rmSync(botDir, { recursive: true, force: true });
    console.log('  Files deleted.');
  } else {
    console.log('  Files kept.');
  }

  rl.close();

  // Remove from registry
  removeBot(name);
  console.log(`  Bot '${name}' destroyed.`);
  console.log('  Note: Mattermost bot account (if any) must be deleted manually.');
}
