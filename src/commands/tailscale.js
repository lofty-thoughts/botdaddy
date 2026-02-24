import {
  findBot, getStack, getContainerName,
  loadRegistry, saveRegistry, loadHomeConfig, saveHomeConfig,
} from '../lib/config.js';
import { containerExists, containerRunning, stopContainer, removeContainer } from '../lib/docker.js';
import { p, guard } from '../lib/prompt.js';
import { apply } from './apply.js';

export async function tailscale(name) {
  const bot = findBot(name);
  if (!bot) {
    p.log.error(`Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  p.intro(`Tailscale: ${name}`);

  const homeConfig = loadHomeConfig();
  const savedKey   = homeConfig.tailscaleAuthKey || '';
  let authKey      = '';

  // ── Auth key ─────────────────────────────────────────────
  if (savedKey) {
    const useSaved = guard(await p.confirm({
      message: `Use saved auth key (${savedKey.slice(0, 8)}...)?`,
      initialValue: true,
    }));
    if (useSaved) {
      authKey = savedKey;
    } else {
      authKey = guard(await p.password({ message: 'Tailscale auth key or OAuth client secret' }));
      if (authKey && authKey !== savedKey) {
        const save = guard(await p.confirm({
          message: 'Save as new default for future bots?',
          initialValue: false,
        }));
        if (save) saveHomeConfig({ tailscaleAuthKey: authKey });
      }
    }
  } else {
    p.log.info('Generate an auth key at https://login.tailscale.com/admin/settings/keys');
    authKey = guard(await p.password({ message: 'Tailscale auth key or OAuth client secret' }));
    if (authKey) {
      const save = guard(await p.confirm({
        message: 'Save as default for future bots?',
        initialValue: true,
      }));
      if (save) saveHomeConfig({ tailscaleAuthKey: authKey });
    }
  }

  if (!authKey) {
    p.cancel('Auth key is required.');
    process.exit(1);
  }

  // ── Update registry ──────────────────────────────────────
  const reg   = loadRegistry();
  const entry = reg.bots.find(b => b.name === name);
  if (entry) {
    entry.tailscale = true;
    saveRegistry(reg);
  }

  // ── Remove container (capabilities change requires recreation)
  const stack         = getStack();
  const s             = p.spinner();
  const containerName = getContainerName(name);

  if (containerExists(containerName)) {
    s.start('Removing container (capabilities change requires recreation)...');
    if (containerRunning(containerName)) stopContainer(containerName);
    removeContainer(containerName);
    s.stop('Container removed');
  }

  // ── Apply config ─────────────────────────────────────────
  s.start('Applying config...');
  await apply(name, { quiet: true });
  s.stop('Config applied');

  const tsHost = `${stack.namespace}-${name}`;

  p.outro(
    `Tailscale configured for '${name}'.\n\n` +
    `  Hostname: ${tsHost}\n` +
    `  Start with: botdaddy start ${name}`
  );
}
