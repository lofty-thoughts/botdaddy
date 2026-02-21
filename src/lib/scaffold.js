import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SEED_ROOT = join(__dirname, '..', '..', 'seed');

export const today = new Date().toISOString().split('T')[0];

export function genToken() {
  return randomBytes(32).toString('hex');
}

/** Replace {{VAR}} placeholders in a file */
export function templateFile(src, dest, vars) {
  let content = readFileSync(src, 'utf8');
  for (const [key, val] of Object.entries(vars)) {
    content = content.replaceAll(`{{${key}}}`, val);
  }
  writeFileSync(dest, content);
}

/**
 * Scaffold the full bot directory structure.
 */
export function scaffoldBot({ botDir, botName, gatewayToken, anthropicKey, openaiKey, provider, portInfo }) {
  // Create directories
  mkdirSync(join(botDir, 'workspace', 'memory'), { recursive: true });

  // Copy base seed files to workspace
  const baseDir = join(SEED_ROOT, 'base');
  if (existsSync(baseDir)) {
    const files = readdirSync(baseDir);
    for (const f of files) {
      templateFile(join(baseDir, f), join(botDir, 'workspace', f), {
        AGENT_NAME: botName,
        DATE: today,
        BOTDADDY_DEV_PORT_START: String(portInfo.devPortStart),
        BOTDADDY_DEV_PORT_END: String(portInfo.devPortEnd),
        BOTDADDY_GATEWAY_PORT: String(portInfo.gatewayPort),
      });
    }
    console.log('  Copied seed workspace files');
  }

  // Generate .env
  writeEnvFile({ botDir, botName, gatewayToken, anthropicKey, openaiKey, provider, portInfo });

  // git init in workspace
  try {
    execSync('git init', { cwd: join(botDir, 'workspace'), stdio: 'pipe' });
    execSync('git add -A', { cwd: join(botDir, 'workspace'), stdio: 'pipe' });
    execSync('git commit -m "Initial workspace"', { cwd: join(botDir, 'workspace'), stdio: 'pipe' });
    console.log('  Initialized git in workspace');
  } catch {
    console.log('  Warning: git init in workspace failed (non-fatal)');
  }
}

function writeEnvFile({ botDir, botName, gatewayToken, anthropicKey, openaiKey, provider, portInfo }) {
  const seedEnv = join(SEED_ROOT, 'env.template');
  let envContent = readFileSync(seedEnv, 'utf8');

  envContent = envContent.replaceAll('{{AGENT_NAME}}', botName);
  envContent = envContent.replaceAll('{{DATE}}', today);
  envContent = envContent.replaceAll('{{GATEWAY_TOKEN}}', gatewayToken);
  envContent = envContent.replaceAll('{{BOTDADDY_DEV_PORT_START}}', String(portInfo.devPortStart));
  envContent = envContent.replaceAll('{{BOTDADDY_DEV_PORT_END}}', String(portInfo.devPortEnd));

  if (anthropicKey) {
    envContent = envContent.replace('ANTHROPIC_API_KEY=', `ANTHROPIC_API_KEY=${anthropicKey}`);
  }
  if (openaiKey) {
    envContent = envContent.replace('OPENAI_API_KEY=', `OPENAI_API_KEY=${openaiKey}`);
  }

  writeFileSync(join(botDir, '.env'), envContent);
  chmodSync(join(botDir, '.env'), 0o600);
  console.log('  Generated .env');
}
