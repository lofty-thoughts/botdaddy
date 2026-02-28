import { join } from 'node:path';
import { existsSync, cpSync } from 'node:fs';
import {
  getStack, getContainerName, getBotDir, loadRegistry, PROJECT_ROOT,
} from '../lib/config.js';
import {
  checkDocker, buildImage, containerExists, containerRunning,
  stopContainer, removeContainer,
} from '../lib/docker.js';
import { SEED_ROOT } from '../lib/scaffold.js';
import { p, guard } from '../lib/prompt.js';

export async function rebuild(name) {
  if (!checkDocker()) {
    p.log.error('Docker is not running.');
    process.exit(1);
  }

  const stack    = getStack();
  const dockerDir = join(PROJECT_ROOT, 'docker');

  p.intro('Rebuild');

  // ── Rebuild image ──────────────────────────────────────────
  const s = p.spinner();
  s.start(`Building image '${stack.imageName}'...`);
  await buildImage(stack.imageName, dockerDir);
  s.stop(`Image '${stack.imageName}' rebuilt`);

  // ── Determine which bots to recreate ───────────────────────
  const reg  = loadRegistry();
  const bots = name
    ? reg.bots.filter(b => b.name === name)
    : reg.bots;

  if (name && bots.length === 0) {
    p.log.error(`Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  // ── Sync seed skills into bot workspaces ──────────────────
  const seedSkillsDir = join(SEED_ROOT, 'skills');
  if (existsSync(seedSkillsDir) && bots.length > 0) {
    s.start('Syncing skills...');
    for (const bot of bots) {
      const skillsDest = join(getBotDir(bot.name), 'workspace', 'skills');
      cpSync(seedSkillsDir, skillsDest, { recursive: true });
    }
    s.stop(`Skills synced to ${bots.length} bot(s)`);
  }

  const recreated = [];

  for (const bot of bots) {
    const containerName = getContainerName(bot.name);
    if (!containerExists(containerName)) continue;

    s.start(`Recreating '${bot.name}'...`);
    if (containerRunning(containerName)) stopContainer(containerName);
    removeContainer(containerName);
    s.stop(`Removed '${bot.name}' container`);
    recreated.push(bot.name);
  }

  // ── Summary ────────────────────────────────────────────────
  if (recreated.length === 0) {
    p.outro('Image rebuilt. No running containers to recreate.');
  } else {
    const list = recreated.map(n => `  botdaddy start ${n}`).join('\n');
    p.outro(`Image rebuilt. Restart your bots:\n\n${list}`);
  }
}
