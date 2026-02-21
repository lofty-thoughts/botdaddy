import { rmSync } from 'node:fs';
import { findBot, removeBot, getBotDir, getContainerName } from '../lib/config.js';
import { containerExists, containerRunning, stopContainer, removeContainer } from '../lib/docker.js';
import { p, guard } from '../lib/prompt.js';

export async function destroy(name) {
  const bot = findBot(name);
  if (!bot) {
    p.log.error(`Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  p.intro(`Destroy bot: ${name}`);

  const confirm = guard(await p.text({
    message: `Type '${name}' to confirm destruction`,
    validate: v => v !== name ? `Type exactly '${name}' to confirm` : undefined,
  }));

  if (confirm !== name) {
    p.cancel('Aborted.');
    return;
  }

  const containerName = getContainerName(name);
  const s = p.spinner();

  if (containerRunning(containerName)) {
    s.start(`Stopping ${containerName}...`);
    stopContainer(containerName);
    s.stop('Stopped');
  }

  if (containerExists(containerName)) {
    s.start(`Removing container ${containerName}...`);
    removeContainer(containerName);
    s.stop('Container removed');
  }

  const botDir    = getBotDir(name);
  const deleteDir = guard(await p.confirm({
    message: `Delete ${botDir}?`,
    initialValue: false,
  }));

  if (deleteDir) {
    rmSync(botDir, { recursive: true, force: true });
    p.log.success('Files deleted');
  } else {
    p.log.info('Files kept');
  }

  removeBot(name);

  p.outro(`Bot '${name}' destroyed. Mattermost bot account (if any) must be deleted manually.`);
}
