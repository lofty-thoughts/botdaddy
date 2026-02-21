import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

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
