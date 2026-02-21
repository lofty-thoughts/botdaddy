import { loadRegistry, getStack } from './config.js';

const RANGE_SIZE = 10;

/**
 * Allocate the next available 10-port range for a new bot.
 * Returns { gatewayPort, devPortStart, devPortEnd, slotIndex }.
 */
export function allocatePortRange() {
  const stack = getStack();
  const reg = loadRegistry();
  const basePort = stack.basePort;

  // Collect all used slot indices
  const usedSlots = new Set((reg.bots || []).map(b => b.portSlot));

  // Find the lowest unused slot
  let slot = 0;
  while (usedSlots.has(slot)) slot++;

  const rangeStart = basePort + (slot * RANGE_SIZE);

  return {
    gatewayPort: rangeStart,
    devPortStart: rangeStart + 1,
    devPortEnd: rangeStart + RANGE_SIZE - 1,
    portSlot: slot,
  };
}
