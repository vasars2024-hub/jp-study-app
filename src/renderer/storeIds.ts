/**
 * The two impure primitives every localStorage-backed store needs, in one place.
 *
 * The pure modules under `src/shared` take `now` and ids as arguments so they stay
 * deterministic and testable; that pushes the clock and the id counter into the store
 * layer, where each store was about to grow its own copy. `tools/architecture-audit.cjs`
 * flagged the second copy the moment it appeared (`duplicate-export: nowIso`), which is
 * exactly what that check is for.
 */

let counter = 0;

/**
 * Ids only need to be unique within one document. A counter keeps them so even when
 * two are minted inside the same millisecond, which `Date.now()` alone would not — and
 * unlike `Math.random()` it stays reproducible in a test that stubs the clock.
 */
export function nextLocalId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
