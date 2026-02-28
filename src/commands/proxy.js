import {
  findBot, getStack, getContainerName,
  loadRegistry, saveRegistry,
} from '../lib/config.js';
import { containerRunning, stopContainer, startContainer } from '../lib/docker.js';
import { p, guard } from '../lib/prompt.js';
import { apply } from './apply.js';

export async function proxy(name) {
  const bot = findBot(name);
  if (!bot) {
    p.log.error(`Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  p.intro(`Proxy: ${name}`);

  const currentProxy = bot.proxy || '';

  // ── Already configured — update / disable / keep ───────
  if (currentProxy) {
    p.log.info(`Current proxy target: ${currentProxy}`);
    const action = guard(await p.select({
      message: 'What would you like to do?',
      options: [
        { value: 'update',  label: 'Update target' },
        { value: 'disable', label: 'Disable proxy' },
        { value: 'keep',    label: 'Keep current' },
      ],
    }));

    if (action === 'keep') {
      p.outro('No changes.');
      return;
    }

    if (action === 'disable') {
      const reg   = loadRegistry();
      const entry = reg.bots.find(b => b.name === name);
      if (entry) {
        entry.proxy = false;
        saveRegistry(reg);
      }

      const s = p.spinner();
      s.start('Applying config...');
      await apply(name, { quiet: true });
      s.stop('Config applied');

      const containerName = getContainerName(name);
      if (containerRunning(containerName)) {
        s.start('Restarting container...');
        stopContainer(containerName);
        startContainer(containerName);
        s.stop('Restarted');
      }

      p.outro(`Proxy disabled for '${name}'.`);
      return;
    }
  }

  // ── Target input ───────────────────────────────────────
  p.log.info(
    'Enter the upstream target (host:port) to proxy to port 80.\n' +
    '  Examples:\n' +
    '    my-laravel-app-1:80\n' +
    '    host.docker.internal:3000\n' +
    '    172.17.0.3:8080',
  );

  const target = guard(await p.text({
    message: 'Proxy target (host:port)',
    initialValue: currentProxy || '',
    validate: v => {
      if (!v.trim()) return 'Target is required';
      if (!v.includes(':')) return 'Target must include port (e.g. myservice:80)';
      return undefined;
    },
  }));

  // ── Update registry ────────────────────────────────────
  const reg   = loadRegistry();
  const entry = reg.bots.find(b => b.name === name);
  if (entry) {
    entry.proxy = target;
    saveRegistry(reg);
  }

  // ── Apply + restart ────────────────────────────────────
  const s = p.spinner();
  s.start('Applying config...');
  await apply(name, { quiet: true });
  s.stop('Config applied');

  const containerName = getContainerName(name);
  if (containerRunning(containerName)) {
    s.start('Restarting container...');
    stopContainer(containerName);
    startContainer(containerName);
    s.stop('Restarted');
  }

  const stack     = getStack();
  const outroLines = [`Proxying :80 -> ${target}`];
  if (bot.tailscale) {
    outroLines.push(`Tailscale: http://${stack.namespace}-${name}`);
  }
  if (!containerRunning(getContainerName(name))) {
    outroLines.push(`Start with: botdaddy start ${name}`);
  }

  p.outro(`Proxy configured for '${name}'.\n\n  ${outroLines.join('\n  ')}`);
}
