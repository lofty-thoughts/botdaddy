import { rmSync } from 'node:fs';
import { findBot, removeBot, getBotDir, getContainerName, loadHomeConfig } from '../lib/config.js';
import { containerExists, containerRunning, stopContainer, removeContainer } from '../lib/docker.js';
import { deleteMattermostBot } from '../lib/mattermost.js';
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

  // ── Delete Mattermost bot account via API ─────────────────
  if (bot.mattermost) {
    const homeConfig   = loadHomeConfig();
    const mattermostUrl = typeof bot.mattermost === 'string' ? bot.mattermost : homeConfig.mattermostUrl;
    const adminToken    = homeConfig.mattermostAdminToken;

    if (mattermostUrl && adminToken) {
      s.start('Deleting Mattermost bot account...');
      const result = await deleteMattermostBot({ botName: name, mattermostUrl, adminToken });
      if (result.success) {
        s.stop('Mattermost bot account deleted');
      } else {
        s.stop(`Could not delete Mattermost bot account: ${result.error}`);
        p.log.warn(`Delete it manually via the Mattermost API: DELETE /api/v4/users/<id>`);
      }
    } else {
      p.log.warn('Mattermost admin token not found — delete the bot account manually via the API.');
    }
  }

  removeBot(name);

  const notes = [];
  if (bot.telegram) notes.push('Telegram: delete the bot via @BotFather → /deletebot');

  p.outro(`Bot '${name}' destroyed.${notes.length ? '\n\n  ' + notes.join('\n  ') : ''}`);
}