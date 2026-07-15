/**
 * Noctis Simulation Engine — seeded deterministic selection.
 *
 * Implements the seeded-variation rule of SIMULATION_SYSTEMS.md Section 11:
 * variation is permitted, nondeterminism is not. Every helper here is a pure
 * function of the civilization seed and stable context strings already in the
 * committed record — no clock, no hardware randomness, ever. The same
 * complete history produces the same result on every machine, forever.
 */

/** FNV-1a 32-bit hash over a context string, mixed with the numeric seed. */
function hash32(seed: number, context: string): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < context.length; i++) {
    h ^= context.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Final avalanche (xorshift) so short contexts spread across the range.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/**
 * Deterministic unit-interval value in [0, 1) for a seed and context.
 * `select(seed, S, context)` in the blueprints' notation.
 */
export function selectUnit(seed: number, context: string): number {
  return hash32(seed, context) / 0x100000000;
}

/**
 * Deterministic index selection among `count` causally qualified candidates.
 * Never manufactures a candidate: callers pass only qualified options
 * (SIMULATION_SYSTEMS.md Section 11, constraints on variation).
 */
export function selectIndex(seed: number, context: string, count: number): number {
  if (count <= 0) return -1;
  return hash32(seed, context) % count;
}
