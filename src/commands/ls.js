import { loadRegistry, getStack, getContainerName } from '../lib/config.js';
import { containerStatus } from '../lib/docker.js';

export async function ls() {
  const reg = loadRegistry();
  const stack = getStack();
  const bots = reg.bots || [];

  if (bots.length === 0) {
    console.log('\n  No bots registered. Create one with: botdaddy create <name>\n');
    return;
  }

  // Header
  const cols = {
    name: 12,
    status: 20,
    gateway: 28,
    ports: 14,
  };

  console.log('');
  console.log(
    '  ' +
    'NAME'.padEnd(cols.name) +
    'STATUS'.padEnd(cols.status) +
    'GATEWAY'.padEnd(cols.gateway) +
    'DEV PORTS'
  );
  console.log('  ' + '-'.repeat(cols.name + cols.status + cols.gateway + cols.ports));

  for (const bot of bots) {
    const containerName = getContainerName(bot.name);
    const status = containerStatus(containerName) || 'no container';
    const orbDomain = `${stack.namespace}-${bot.name}.orb.local`;
    const gateway = status.startsWith('Up')
      ? `https://${orbDomain}`
      : `http://localhost:${bot.gatewayPort}`;
    const ports = `${bot.devPortStart}-${bot.devPortEnd}`;

    console.log(
      '  ' +
      bot.name.padEnd(cols.name) +
      status.slice(0, cols.status - 1).padEnd(cols.status) +
      gateway.slice(0, cols.gateway - 1).padEnd(cols.gateway) +
      ports
    );
  }

  console.log('');
}
