/**
 * Liquid Workplace — L3 per-window presentation state.
 *
 * `src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` §5.2 / L3. The window snapshot
 * already persists geometry, z-order, visibility, maximize and pin; this adds
 * ONE optional field beside them and the pure functions that move a window
 * between presentations. L3's gate is byte-for-byte reversibility, so the whole
 * module is written to make that provable rather than plausible.
 *
 * Four decisions, each of which is a way reversibility is normally lost:
 *
 * 1. CONVENTIONAL IS THE DEFAULT AND IT IS THE ABSENCE OF THIS FIELD, not a
 *    stored `mode: 'standard'`. Every layout saved before today parses
 *    unchanged and renders exactly as it did — the same reason
 *    `WindowSnapshot.pinned` is optional (`shared/desktop.ts:53`).
 * 2. GOING LIQUID TWICE MUST NOT CAPTURE THE LIQUID GEOMETRY. `makeLiquid` on a
 *    window that is already liquid returns it untouched. Without that guard the
 *    second call overwrites `standardRect` with the current, liquid rect and
 *    the way home is gone permanently — silently, and only discovered by a user
 *    who switches back.
 * 3. RETURNING DELETES THE FIELD. `returnToStandard(makeLiquid(w))` is deep-equal
 *    to `w`, key for key, not merely equivalent. A residual `{mode:'standard'}`
 *    would make the round trip *look* right while the persisted blob grew a key
 *    the original never had.
 * 4. A CORRUPT BLOB MEANS STANDARD, NEVER HALF-LIQUID. `parsePresentation` is
 *    total: it never throws and returns `undefined` for anything it cannot
 *    fully vouch for, including a liquid state with no geometry to come back
 *    to — which is a window that cannot be reversed and therefore must not be
 *    entered.
 */

export const LIQUID_PRESENTATION_VERSION = 1 as const;

export const LIQUID_PRESENTATION_MODES = ['standard', 'liquid'] as const;
export type LiquidPresentationMode = (typeof LIQUID_PRESENTATION_MODES)[number];

/** The geometry a window returns to. Same shape as `WindowSnapshot.restoreRect`. */
export interface LiquidRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LiquidPresentationState {
  v: typeof LIQUID_PRESENTATION_VERSION;
  mode: LiquidPresentationMode;
  /** Where the window sat before it went liquid. Required whenever `mode` is `liquid`. */
  standardRect?: LiquidRect;
  /** Whether it was maximized before it went liquid. */
  standardMaximized?: boolean;
}

/**
 * The subset of `WindowSnapshot` these functions touch. Declared structurally so
 * this module does not depend on the desktop store, and so a pop-out, a Blanc
 * window or a test fixture can use it without being a full snapshot.
 */
export interface LiquidPresentable {
  x: number;
  y: number;
  w: number;
  h: number;
  maximized: boolean;
  presentation?: LiquidPresentationState;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseRect(input: unknown): LiquidRect | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const raw = input as Record<string, unknown>;
  if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) return undefined;
  // A zero-or-negative size is not a geometry a window can be restored into; it
  // is the shape a half-written blob takes, and restoring it would leave the
  // user with an invisible window and no obvious way back.
  if (!isFiniteNumber(raw.w) || !isFiniteNumber(raw.h) || raw.w <= 0 || raw.h <= 0) return undefined;
  return { x: raw.x, y: raw.y, w: raw.w, h: raw.h };
}

/**
 * Validate a persisted presentation blob. Total — never throws, and returns
 * `undefined` for anything it cannot fully vouch for, which the caller renders
 * as a conventional window.
 */
export function parsePresentation(input: unknown): LiquidPresentationState | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const raw = input as Record<string, unknown>;
  const mode = raw.mode;
  if (typeof mode !== 'string') return undefined;
  if (!(LIQUID_PRESENTATION_MODES as readonly string[]).includes(mode)) return undefined;
  // A version from the future is not readable by this build. Downgrading to
  // standard is lossy but reversible; guessing at unknown fields is neither.
  if (raw.v !== undefined && raw.v !== LIQUID_PRESENTATION_VERSION) return undefined;

  if (mode === 'standard') {
    // Nothing to remember: standard IS the absence of this field, so a stored
    // standard blob is normalised away rather than round-tripped.
    return undefined;
  }

  const standardRect = parseRect(raw.standardRect);
  // Liquid with no geometry to come back to is a window that cannot be
  // reversed. §2.1 makes reversibility non-negotiable, so this is not enterable.
  if (!standardRect) return undefined;

  return {
    v: LIQUID_PRESENTATION_VERSION,
    mode: 'liquid',
    standardRect,
    standardMaximized: raw.standardMaximized === true,
  };
}

/** Whether this window is currently presented as Liquid. */
export function isLiquid(window: Pick<LiquidPresentable, 'presentation'>): boolean {
  return window.presentation?.mode === 'liquid';
}

/**
 * The "Make Liquid" command. Records where to come back to and changes nothing
 * else — geometry, z-order, pin and visibility are the shell's to move, and a
 * command that also moved them could not be proven reversible in one place.
 *
 * Already liquid: returned untouched. See decision (2).
 */
export function makeLiquid<T extends LiquidPresentable>(window: T): T {
  if (isLiquid(window)) return window;
  return {
    ...window,
    presentation: {
      v: LIQUID_PRESENTATION_VERSION,
      mode: 'liquid',
      standardRect: { x: window.x, y: window.y, w: window.w, h: window.h },
      standardMaximized: window.maximized,
    },
  };
}

/**
 * The "Return to standard" command. Restores the captured geometry and REMOVES
 * the field, so the result is key-for-key identical to the snapshot that was
 * made liquid.
 */
export function returnToStandard<T extends LiquidPresentable>(window: T): T {
  const state = window.presentation;
  if (!state || state.mode !== 'liquid') {
    if (!('presentation' in window)) return window;
    const { presentation: _dropped, ...rest } = window;
    return rest as T;
  }
  const rect = state.standardRect;
  const { presentation: _dropped, ...rest } = window;
  const restored = {
    ...rest,
    ...(rect ? { x: rect.x, y: rect.y, w: rect.w, h: rect.h } : {}),
    maximized: state.standardMaximized === true,
  };
  return restored as T;
}

/** Flip whichever way this window is currently presented. */
export function togglePresentation<T extends LiquidPresentable>(window: T): T {
  return isLiquid(window) ? returnToStandard(window) : makeLiquid(window);
}

/**
 * Normalise one persisted window on load: keep a presentation blob only if it
 * validates, and drop the key entirely otherwise. A stored `mode: 'standard'`
 * and a corrupt blob both come out as a plain conventional window, which is the
 * recovery behaviour L3's gate asks for.
 */
export function sanitizeWindowPresentation<T extends LiquidPresentable>(window: T): T {
  if (!('presentation' in window)) return window;
  const parsed = parsePresentation(window.presentation);
  if (parsed) return { ...window, presentation: parsed };
  const { presentation: _dropped, ...rest } = window;
  return rest as T;
}
