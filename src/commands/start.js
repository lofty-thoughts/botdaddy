import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { findBot, getStack, getBotDir, getContainerName } from '../lib/config.js';
import {
  checkDocker, containerExists, containerRunning,
  startContainer, runContainer, ensureNetwork,
} from '../lib/docker.js';

export async function start(name) {
  const bot = findBot(name);
  if (!bot) {
    console.error(`  Error: Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  if (!checkDocker()) {
    console.error('  Error: Docker is not running.');
    process.exit(1);
  }

  const stack = getStack();
  const containerName = getContainerName(name);
  const botDir = getBotDir(name);
  const networkName = `${stack.namespace}-net`;
  const orbDomain = `${stack.namespace}-${name}.orb.local`;

  ensureNetwork(networkName);

  if (containerRunning(containerName)) {
    console.log(`  Bot '${name}' is already running.`);
    console.log(`  Gateway: http://localhost:${bot.gatewayPort}`);
    console.log(`  OrbStack: https://${orbDomain}`);
    return;
  }

  if (containerExists(containerName)) {
    // Container exists but stopped — restart it
    console.log(`  Starting stopped container '${containerName}'...`);
    startContainer(containerName);
  } else {
    // No container — create and run
    console.log(`  Creating and starting container '${containerName}'...`);
    runContainer({
      containerName,
      imageName: stack.imageName,
      botDir,
      envFile: join(botDir, '.env'),
      gatewayPort: bot.gatewayPort,
      devPortStart: bot.devPortStart,
      devPortEnd: bot.devPortEnd,
      network: networkName,
      orbDomain,
    });
  }

  // Wait for gateway to respond
  const gwUrl = `http://localhost:${bot.gatewayPort}`;
  const maxWait = 60_000;
  const startTime = Date.now();
  process.stdout.write('  Waiting for gateway');
  let ready = false;

  while (Date.now() - startTime < maxWait) {
    try {
      execSync(`curl -sfo /dev/null -w '%{http_code}' ${gwUrl} 2>/dev/null | grep -q 200`, {
        stdio: 'pipe',
      });
      ready = true;
      break;
    } catch {
      process.stdout.write('.');
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  console.log(ready ? ' ready' : '');

  if (!ready) {
    console.log('  Warning: Gateway not responding yet. It may still be starting.');
    console.log(`  Check logs: botdaddy logs ${name}`);
  }

  console.log(`\n  Bot '${name}' is running.`);
  console.log(`  Gateway: ${gwUrl}`);
  console.log(`  OrbStack: https://${orbDomain}`);
  console.log(`  Dev ports: ${bot.devPortStart}-${bot.devPortEnd}`);
}
