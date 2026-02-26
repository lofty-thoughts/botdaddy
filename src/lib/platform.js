import { execSync } from 'node:child_process';

export const isMac = process.platform === 'darwin';

/** Open a URL in the default browser (cross-platform). */
export function openUrl(url) {
  const cmd = isMac ? 'open' : 'xdg-open';
  execSync(`${cmd} "${url}"`, { stdio: 'pipe' });
}
