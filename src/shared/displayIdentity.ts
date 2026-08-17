/**
 * Stable identity for a physical display.
 *
 * Electron's `Display.id` is an opaque OS handle. On Windows it is *not* stable
 * across reboot or replug — unplugging a monitor and plugging it back into a
 * different port hands out a new id, which would orphan every per-display
 * setting the user configured. So the store keys assignments by a derived
 * fingerprint instead: label, resolution and scale factor, with position as a
 * tiebreak when two identical panels are attached.
 *
 * Pure module, no Electron import — the resolution rules are unit-testable
 * without a browser or an app instance.
 */

/** The subset of `Electron.Display` this module needs. Structural, so a test
 *  fixture or a synthetic display satisfies it without casting. */
export interface DisplayLike {
  id: number;
  label?: string;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  /** True for the OS primary display. */
  primary?: boolean;
  /** Set on displays injected by simulated-display mode. */
  virtual?: boolean;
}

/** Assignments for a display that could not be matched fall back to this. */
export const PRIMARY_DISPLAY_KEY = 'primary';

/**
 * Key prefix of a simulated display, derived from the `Simulated <n>` label that
 * `main/displays.ts setVirtualDisplayCount` gives them.
 *
 * Simulated displays are a development construct that only exists while the user
 * has simulation switched on, so — unlike a physical monitor, whose assignment
 * must survive being unplugged — their per-display configuration is deliberately
 * NOT persisted. Keeping it meant a stale `enabled: false` from a previous run
 * silently suppressed the second desktop, so turning simulation on appeared to
 * do nothing.
 */
export const SIMULATED_DISPLAY_KEY_PREFIX = 'simulated-';

export function isSimulatedDisplayKey(key: string): boolean {
  return key.startsWith(SIMULATED_DISPLAY_KEY_PREFIX);
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Fingerprint for one display, without the positional tiebreak.
 *
 * Deliberately excludes `bounds.x/y`: dragging a monitor to the other side of
 * the arrangement in Windows display settings must not orphan its assignment.
 * Two *identical* panels therefore collide here on purpose — `displayKeysFor`
 * resolves that collision, and only then, by position.
 */
export function baseDisplayKey(display: DisplayLike): string {
  const label = slug(display.label ?? '') || 'display';
  const w = Math.round(display.bounds.width);
  const h = Math.round(display.bounds.height);
  // One decimal: 1.25 and 1.5 are distinct, floating-point noise is not.
  const scale = Math.round((display.scaleFactor || 1) * 10) / 10;
  return `${label}|${w}x${h}|${scale}`;
}

/**
 * The label half of a display key — `dell|1920x1080|1#2` becomes `dell`.
 *
 * This is the part of the fingerprint that identifies the *panel* rather than
 * the mode it is currently running in, and it is what lets a caller recognise
 * that `vdd-by-mtt|800x600|1` and `vdd-by-mtt|1920x1080|1` are one monitor the
 * user changed the resolution of, not two monitors. It is deliberately weaker
 * than a key: two identical panels share a label, so a caller must handle that
 * ambiguity itself rather than treating a label match as identity.
 */
export function displayLabelOfKey(key: string): string {
  return key.split('|')[0] ?? '';
}

/**
 * Keys for a whole display set, collision-resolved.
 *
 * Returns a parallel array — index i is the key for displays[i]. When two or
 * more displays share a base key, each gets `#<n>` appended, ordered by
 * position (left-to-right, then top-to-bottom) so the suffix is a property of
 * the arrangement rather than of enumeration order, which Electron does not
 * guarantee to be stable.
 */
export function displayKeysFor(displays: readonly DisplayLike[]): string[] {
  const byBase = new Map<string, DisplayLike[]>();
  for (const d of displays) {
    const base = baseDisplayKey(d);
    const list = byBase.get(base);
    if (list) list.push(d);
    else byBase.set(base, [d]);
  }

  for (const list of byBase.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
  }

  return displays.map((d) => {
    const base = baseDisplayKey(d);
    const peers = byBase.get(base);
    if (!peers || peers.length < 2) return base;
    const rank = peers.indexOf(d);
    return `${base}#${rank + 1}`;
  });
}

/** Key for one display, resolved against the set it belongs to. */
export function displayKeyFor(display: DisplayLike, all: readonly DisplayLike[]): string {
  const index = all.indexOf(display);
  if (index >= 0) return displayKeysFor(all)[index];
  // Not a member of `all` (a stale handle, or a caller passing an unrelated
  // display) — the uncollided base key is the honest answer.
  return baseDisplayKey(display);
}

/**
 * Find the display a stored `displayKey` now refers to.
 *
 * Resolution order, most to least specific:
 *   1. exact key match
 *   2. base match ignoring the positional suffix — the monitor was moved, or
 *      its identical twin was unplugged
 *   3. `PRIMARY_DISPLAY_KEY` resolves to the primary display
 *
 * Returns null when nothing matches, which is the caller's signal that the
 * display is currently absent. An absent display must *keep* its assignment:
 * the user unplugged a monitor, they did not reset its configuration.
 */
export function resolveDisplayKey(
  key: string,
  displays: readonly DisplayLike[],
): DisplayLike | null {
  if (!displays.length) return null;

  const keys = displayKeysFor(displays);
  const exact = keys.indexOf(key);
  if (exact >= 0) return displays[exact];

  const wanted = key.split('#')[0];
  const baseHit = displays.findIndex((d) => baseDisplayKey(d) === wanted);
  if (baseHit >= 0) return displays[baseHit];

  if (key === PRIMARY_DISPLAY_KEY) {
    return displays.find((d) => d.primary) ?? displays[0];
  }

  return null;
}

/** True when this key currently maps to a connected display. */
export function isDisplayPresent(key: string, displays: readonly DisplayLike[]): boolean {
  return resolveDisplayKey(key, displays) != null;
}

/** Key of the primary display in a set, for seeding a fresh store. */
export function primaryDisplayKey(displays: readonly DisplayLike[]): string {
  if (!displays.length) return PRIMARY_DISPLAY_KEY;
  const keys = displayKeysFor(displays);
  const index = displays.findIndex((d) => d.primary);
  return keys[index >= 0 ? index : 0];
}
