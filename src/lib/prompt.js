import * as p from '@clack/prompts';

export { p };

/**
 * Check if a clack prompt was cancelled (Ctrl+C) and exit cleanly if so.
 * Returns the value unchanged if not cancelled.
 */
export function guard(value, message = 'Cancelled.') {
  if (p.isCancel(value)) {
    p.cancel(message);
    process.exit(0);
  }
  return value;
}
