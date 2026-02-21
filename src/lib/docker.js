import { execSync, execFileSync, spawn } from 'node:child_process';

// ─── Docker CLI wrapper ──────────────────────────────────────

/** Check if Docker is available and running */
export function checkDocker() {
  try {
    execSync('docker info', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** Check if a Docker image exists locally */
export function imageExists(imageName) {
  try {
    const out = execSync(`docker images -q ${imageName}`, { encoding: 'utf8', stdio: 'pipe' });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

/** Build the base image from the docker/ directory */
export function buildImage(imageName, dockerDir) {
  try {
    execSync(`docker build -t ${imageName} ${dockerDir}`, { stdio: 'pipe' });
  } catch (err) {
    const detail = err.stderr?.toString().trim() || err.message;
    throw new Error(detail);
  }
}

/** Check if a container exists (running or stopped) */
export function containerExists(containerName) {
  try {
    const out = execSync(`docker ps -a --filter name=^/${containerName}$ --format '{{.Names}}'`, {
      encoding: 'utf8', stdio: 'pipe',
    });
    return out.trim() === containerName;
  } catch {
    return false;
  }
}

/** Check if a container is running */
export function containerRunning(containerName) {
  try {
    const out = execSync(`docker ps --filter name=^/${containerName}$ --format '{{.Names}}'`, {
      encoding: 'utf8', stdio: 'pipe',
    });
    return out.trim() === containerName;
  } catch {
    return false;
  }
}

/** Get container status info */
export function containerStatus(containerName) {
  try {
    const out = execSync(
      `docker ps -a --filter name=^/${containerName}$ --format '{{.Status}}'`,
      { encoding: 'utf8', stdio: 'pipe' },
    );
    return out.trim() || null;
  } catch {
    return null;
  }
}

/** Start an existing stopped container */
export function startContainer(containerName) {
  execSync(`docker start ${containerName}`, { stdio: 'pipe' });
}

/** Stop a running container */
export function stopContainer(containerName) {
  execSync(`docker stop ${containerName}`, { stdio: 'pipe' });
}

/** Remove a container */
export function removeContainer(containerName) {
  execSync(`docker rm ${containerName}`, { stdio: 'pipe' });
}

/**
 * Run a new container with full botdaddy config.
 * @param {object} opts
 */
export function runContainer({
  containerName,
  imageName,
  botDir,
  envFile,
  gatewayPort,
  devPortStart,
  devPortEnd,
  network,
  orbDomain,
  extraEnv = {},
}) {
  const args = [
    'run', '-d',
    '--name', containerName,
    '--restart', 'unless-stopped',
    '--env-file', envFile,
    // Volume mounts
    '-v', `${botDir}:/root/.openclaw`,
    '-v', '/var/run/docker.sock:/var/run/docker.sock',
    // Gateway port
    '-p', `${gatewayPort}:18789`,
  ];

  // Dev port range (pass through 1:1 so bot and host share the same port numbers)
  for (let p = devPortStart; p <= devPortEnd; p++) {
    args.push('-p', `${p}:${p}`);
  }

  // Extra env vars
  for (const [k, v] of Object.entries(extraEnv)) {
    args.push('-e', `${k}=${v}`);
  }

  // Network
  args.push('--network', network);

  // OrbStack domain label
  if (orbDomain) {
    args.push('--label', `dev.orbstack.domains=${orbDomain}`);
    args.push('--label', 'dev.orbstack.http-port=18789');
  }

  args.push(imageName);

  execSync(`docker ${args.join(' ')}`, { stdio: 'pipe' });
}

/** Run a one-shot container (for onboard) */
export function runOneShotContainer({ containerName, imageName, botDir, envFile, command }) {
  const args = [
    'run', '--rm',
    '--name', `${containerName}-onboard`,
    '--env-file', envFile,
    '-v', `${botDir}:/root/.openclaw`,
    imageName,
    ...command,
  ];
  try {
    execSync(`docker ${args.join(' ')}`, { stdio: 'pipe' });
  } catch (err) {
    const detail = err.stderr?.toString().trim() || err.message;
    throw new Error(detail);
  }
}

/** Follow container logs (interactive — spawns attached process) */
export function followLogs(containerName) {
  const child = spawn('docker', ['logs', '-f', containerName], { stdio: 'inherit' });
  child.on('error', (err) => {
    console.error(`Failed to follow logs: ${err.message}`);
    process.exit(1);
  });
  return child;
}

/** Exec into a container with interactive shell */
export function execShell(containerName) {
  try {
    execFileSync('docker', ['exec', '-it', containerName, 'bash'], { stdio: 'inherit' });
  } catch {
    // Normal exit from shell — ignore
  }
}

/** Exec a command in a container */
export function execInContainer(containerName, command) {
  execSync(`docker exec ${containerName} ${command}`, { stdio: 'inherit' });
}

/** Ensure a Docker network exists */
export function ensureNetwork(networkName) {
  try {
    execSync(`docker network inspect ${networkName}`, { stdio: 'pipe' });
  } catch {
    execSync(`docker network create ${networkName}`, { stdio: 'pipe' });
  }
}
