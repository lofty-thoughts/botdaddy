import chalk from 'chalk';
import { loadRegistry, getStack, getContainerName } from '../lib/config.js';
import { containerStatus } from '../lib/docker.js';

export async function ls() {
  const reg   = loadRegistry();
  const stack = getStack();
  const bots  = reg.bots || [];

  if (bots.length === 0) {
    console.log('\n  No bots registered. Create one with: botdaddy config <name>\n');
    return;
  }

  const NAME    = 14;
  const STATUS  = 22;
  const GATEWAY = 30;

  console.log('');
  console.log(
    '  ' +
    chalk.dim('NAME'.padEnd(NAME)) +
    chalk.dim('STATUS'.padEnd(STATUS)) +
    chalk.dim('GATEWAY'.padEnd(GATEWAY)) +
    chalk.dim('DEV PORTS')
  );
  console.log('  ' + chalk.dim('─'.repeat(NAME + STATUS + GATEWAY + 14)));

  for (const bot of bots) {
    const containerName = getContainerName(bot.name);
    const raw           = containerStatus(containerName) || 'no container';
    const orbDomain     = `${stack.namespace}-${bot.name}.orb.local`;
    const isUp          = raw.startsWith('Up');
    const gateway       = isUp
      ? `https://${orbDomain}`
      : `http://localhost:${bot.gatewayPort}`;
    const ports         = `${bot.devPortStart}-${bot.devPortEnd}`;

    const statusStr = raw.length > STATUS - 1 ? raw.slice(0, STATUS - 2) + '…' : raw;
    const coloredStatus = isUp
      ? chalk.green(statusStr.padEnd(STATUS))
      : raw === 'no container'
        ? chalk.dim(statusStr.padEnd(STATUS))
        : chalk.yellow(statusStr.padEnd(STATUS));

    console.log(
      '  ' +
      chalk.bold(bot.name.padEnd(NAME)) +
      coloredStatus +
      chalk.cyan(gateway.slice(0, GATEWAY - 1).padEnd(GATEWAY)) +
      chalk.dim(ports)
    );
  }

  console.log('');
}
