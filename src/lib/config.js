import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Paths ───────────────────────────────────────────────────

/** Project root — where botdaddy.json lives (two levels up from src/lib/) */
export const PROJECT_ROOT = resolve(__dirname, '..', '..');

/** botdaddy.json path */
export const REGISTRY_PATH = join(PROJECT_ROOT, 'botdaddy.json');

/** User-level secrets dir (default ~/.botdaddy, override with BOTDADDY_HOME) */
export function getHomeDir() {
  return process.env.BOTDADDY_HOME || join(process.env.HOME, '.botdaddy');
}

/** User-level config file path */
export function getHomeConfigPath() {
  return join(getHomeDir(), 'config.json');
}

// ─── botdaddy.json (project registry) ────────────────────────

const DEFAULT_REGISTRY = {
  version: 1,
  stack: {
    namespace: 'botdaddy',
    basePort: 19000,
    dataRoot: './bots',
    imageName: 'botdaddy-base',
  },
  bots: [],
};

export function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) return { ...DEFAULT_REGISTRY, bots: [] };
  try {
    return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  } catch {
    return { ...DEFAULT_REGISTRY, bots: [] };
  }
}

export function saveRegistry(data) {
  writeFileSync(REGISTRY_PATH, JSON.stringify(data, null, 2) + '\n');
}

export function getStack() {
  const reg = loadRegistry();
  return { ...DEFAULT_REGISTRY.stack, ...reg.stack };
}

// ─── Bot lookup ──────────────────────────────────────────────

export function findBot(name) {
  const reg = loadRegistry();
  return reg.bots.find(b => b.name === name) || null;
}

export function addBot(entry) {
  const reg = loadRegistry();
  if (!Array.isArray(reg.bots)) reg.bots = [];
  if (reg.bots.some(b => b.name === entry.name)) return;
  reg.bots.push(entry);
  saveRegistry(reg);
}

export function removeBot(name) {
  const reg = loadRegistry();
  reg.bots = (reg.bots || []).filter(b => b.name !== name);
  saveRegistry(reg);
}

// ─── Paths for a specific bot ────────────────────────────────

export function getBotDir(name) {
  const stack = getStack();
  return resolve(PROJECT_ROOT, stack.dataRoot, name);
}

export function getContainerName(name) {
  const stack = getStack();
  return `${stack.namespace}-${name}`;
}

// ─── Validation ──────────────────────────────────────────────

export function validateName(name) {
  if (!name) return 'Bot name is required';
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
    return 'Name must start with a letter and contain only letters, numbers, hyphens, underscores';
  }
  if (findBot(name)) return `Bot '${name}' already exists in botdaddy.json`;
  const botDir = getBotDir(name);
  if (existsSync(botDir)) return `${botDir} already exists on disk`;
  return null;
}

// ─── User-level config ($BOTDADDY_HOME/config.json) ──────────

export function loadHomeConfig() {
  const configPath = getHomeConfigPath();
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    return {};
  }
}

export function saveHomeConfig(patch) {
  const homeDir = getHomeDir();
  mkdirSync(homeDir, { recursive: true });
  const configPath = getHomeConfigPath();
  let existing = {};
  if (existsSync(configPath)) {
    try { existing = JSON.parse(readFileSync(configPath, 'utf8')); } catch { /* ignore */ }
  }
  const updated = { ...existing, ...patch };
  writeFileSync(configPath, JSON.stringify(updated, null, 2) + '\n');
  chmodSync(configPath, 0o600);
}
