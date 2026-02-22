import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { findBot, getStack, getBotDir, getContainerName } from '../lib/config.js';
import {
  checkDocker, containerExists, containerRunning,
  startContainer, runContainer, ensureNetwork,
} from '../lib/docker.js';
import { p } from '../lib/prompt.js';

export async function start(name) {
  const bot = findBot(name);
  if (!bot) {
    p.log.error(`Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  if (!checkDocker()) {
    p.log.error('Docker is not running.');
    process.exit(1);
  }

  p.intro(`Start: ${name}`);

  const stack         = getStack();
  const containerName = getContainerName(name);
  const botDir        = getBotDir(name);
  const networkName   = `${stack.namespace}-net`;
  const orbDomain     = `${stack.namespace}-${name}.orb.local`;

  ensureNetwork(networkName);

  if (containerRunning(containerName)) {
    p.log.info(`Bot '${name}' is already running.`);
    p.outro(`Gateway: http://localhost:${bot.gatewayPort}\n  OrbStack: https://${orbDomain}`);
    return;
  }

  const s = p.spinner();

  if (containerExists(containerName)) {
    s.start(`Starting container...`);
    startContainer(containerName);
    s.stop('Container started');
  } else {
    s.start(`Creating container...`);

    const tailscaleOpts = bot.tailscale ? {
      capAdd:       ['NET_ADMIN', 'NET_RAW'],
      devices:      ['/dev/net/tun:/dev/net/tun'],
      extraVolumes: [`${join(botDir, '.tailscale')}:/var/lib/tailscale`],
    } : {};

    runContainer({
      containerName,
      imageName:    stack.imageName,
      botDir,
      envFile:      join(botDir, '.env'),
      gatewayPort:  bot.gatewayPort,
      devPortStart: bot.devPortStart,
      devPortEnd:   bot.devPortEnd,
      network:      networkName,
      orbDomain,
      ...tailscaleOpts,
    });
    s.stop('Container created');
  }

  // Wait for gateway
  const gwUrl    = `http://localhost:${bot.gatewayPort}`;
  const maxWait  = 60_000;
  const start    = Date.now();
  let ready      = false;

  s.start('Waiting for gateway...');
  while (Date.now() - start < maxWait) {
    try {
      execSync(`curl -sfo /dev/null ${gwUrl}`, { stdio: 'pipe' });
      ready = true;
      break;
    } catch {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (ready) {
    s.stop('Gateway ready');
  } else {
    s.stop('Gateway not responding — it may still be starting');
    p.log.warn(`Check logs: botdaddy logs ${name}`);
  }

  const outroLines = [
    `Gateway:   ${gwUrl}`,
    `OrbStack:  https://${orbDomain}`,
    `Dev ports: ${bot.devPortStart}-${bot.devPortEnd}`,
  ];
  if (bot.tailscale) {
    outroLines.push(`Tailscale: ${stack.namespace}-${name}`);
  }

  p.outro(`Bot '${name}' running.\n\n  ${outroLines.join('\n  ')}`);
}
