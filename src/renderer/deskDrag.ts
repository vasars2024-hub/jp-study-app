/**
 * Renderer half of the cross-monitor drag.
 *
 * The gesture never leaves the origin window's pointer capture, so this module
 * is driven entirely from the origin's existing `pointermove` handler. Once the
 * cursor crosses out of the local desk rect, each move is forwarded to main as
 * virtual-screen coordinates; main figures out which desktop window is under
 * the cursor and talks to it.
 *
 * Deliberately a module singleton with an explicitly registered context rather
 * than a React context: the drag handlers in `DesktopShell.tsx` are plain
 * closures inside `FloatingWindow`, and threading a provider through them would
 * have meant restructuring the component. Each BrowserWindow gets its own
 * module instance anyway (one renderer per window), so a singleton here is
 * per-window state, not global state.
 */
import type { IconSnapshot, NoteSnapshot, WidgetSnapshot, WindowSnapshot } from '../shared/desktop';

export type DeskDragKind = 'window' | 'icon' | 'widget' | 'note';

export type DeskDragPayload =
  | { kind: 'window'; snapshot: WindowSnapshot }
  | { kind: 'icon'; snapshot: IconSnapshot }
  | { kind: 'widget'; snapshot: WidgetSnapshot }
  | { kind: 'note'; snapshot: NoteSnapshot; icon?: IconSnapshot };

interface DeskContext {
  /** This window's display, as `shared/displayIdentity.ts` keys it. */
  displayKey: string;
  /** Live desk element, for the local-bounds test. */
  deskEl: () => HTMLElement | null;
}

let context: DeskContext | null = null;
/** Set between begin and end/cancel. Null when no drag is in flight. */
let active: { kind: DeskDragKind; id: string; escaped: boolean } | null = null;

/** Registered once per desktop shell. Secondary and main windows both do it. */
export function registerDeskContext(ctx: DeskContext): () => void {
  context = ctx;
  invalidateDeskRect();
  return () => {
    if (context === ctx) {
      context = null;
      invalidateDeskRect();
    }
  };
}

export function deskDisplayKey(): string | null {
  return context?.displayKey ?? null;
}

/**
 * Desk rect, cached for the duration of one drag.
 *
 * WHY THIS IS CACHED, measured 2026-08-24. `isOutsideLocalDesk` ran a
 * `getBoundingClientRect()` on the desk element from `moveDeskDrag`, which
 * `DesktopShell`'s drag handler calls on EVERY `pointermove` — *before* its rAF
 * throttle, so at a 500 Hz pointer that is 500 forced layout flushes a second,
 * interleaved with the `style.transform` write the rAF performs on the dragged
 * window. Read-after-write on each event is the textbook layout thrash, and it
 * showed as an occasional ~100 ms frame: dragging a window on a three-window
 * desktop missed rubric category 7's "0 frames over 100 ms" bar in 4 of 8 runs,
 * worst frame 100.3 ms, in BOTH presentations (so not a Liquid cost).
 *
 * The desk element is the full-bleed desktop layer; it does not move or resize
 * while a pointer drag is in flight. It CAN change if the OS window is resized
 * mid-drag, so the cache is dropped on `resize` as well as at begin/end — a
 * stale rect would hand the window to the wrong monitor, which is the one
 * failure worth guarding.
 */
let deskRectCache: DOMRect | null = null;

function invalidateDeskRect(): void {
  deskRectCache = null;
}

/** Drop the cache and stop listening. Every drag terminator calls this. */
function releaseDeskRect(): void {
  deskRectCache = null;
  window.removeEventListener('resize', invalidateDeskRect);
}

function deskRect(): DOMRect | null {
  if (deskRectCache) return deskRectCache;
  const el = context?.deskEl();
  if (!el) return null;
  deskRectCache = el.getBoundingClientRect();
  return deskRectCache;
}

/** True when a point in client coordinates is outside this window's desk. */
function isOutsideLocalDesk(clientX: number, clientY: number): boolean {
  const r = deskRect();
  if (!r) return false;
  return clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom;
}

/**
 * Start tracking a drag that *may* cross monitors.
 *
 * Cheap and always safe to call: nothing is sent to main until the pointer
 * actually leaves this window, so a normal same-desk drag costs one boolean.
 */
export function beginDeskDrag(kind: DeskDragKind, id: string, payload: DeskDragPayload): void {
  if (!context) return;
  active = { kind, id, escaped: false };
  // One rect read for the whole gesture, taken here rather than on the first
  // move so the flush lands on pointerdown where no frame is in flight.
  invalidateDeskRect();
  deskRect();
  window.addEventListener('resize', invalidateDeskRect);
  window.api.deskDragBegin({ kind, id, payload, displayKey: context.displayKey });
  installEscapeGuard();
}

/** Escape abandons the hand-off; the item stays where it started. */
let removeEscapeGuard: (() => void) | null = null;
function installEscapeGuard(): void {
  removeEscapeGuard?.();
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') cancelDeskDrag();
  };
  window.addEventListener('keydown', onKey, true);
  removeEscapeGuard = () => {
    window.removeEventListener('keydown', onKey, true);
    removeEscapeGuard = null;
  };
}

/**
 * Feed a pointermove. Returns true once the pointer is outside this desk, so
 * the caller can suppress its own local move handling.
 */
export function moveDeskDrag(ev: PointerEvent): boolean {
  if (!active || !context) return false;
  const outside = isOutsideLocalDesk(ev.clientX, ev.clientY);
  if (!outside) {
    if (active.escaped) {
      // Came back home — retract the hover on the other monitor.
      active.escaped = false;
      window.api.deskDragMove(Number.NaN, Number.NaN);
    }
    return false;
  }
  active.escaped = true;
  window.api.deskDragMove(ev.screenX, ev.screenY);
  return true;
}

/**
 * Finish. Returns true when the item was handed to another monitor, in which
 * case the caller must NOT commit it locally — the release message will remove
 * it, and the target commits its own desktop.
 */
export function endDeskDrag(ev: PointerEvent): boolean {
  if (!active) return false;
  // Read the rect one last time before dropping the cache — this decides which
  // monitor gets the window, so it is the one place a stale value would matter.
  const escaped = active.escaped && isOutsideLocalDesk(ev.clientX, ev.clientY);
  active = null;
  removeEscapeGuard?.();
  releaseDeskRect();
  if (escaped) {
    window.api.deskDragEnd(ev.screenX, ev.screenY);
    return true;
  }
  window.api.deskDragCancel();
  return false;
}

export function cancelDeskDrag(): void {
  if (!active) return;
  active = null;
  removeEscapeGuard?.();
  releaseDeskRect();
  window.api.deskDragCancel();
}

export function isDeskDragActive(): boolean {
  return active != null;
}

// ---------------------------------------------------------------------------
// Receiving side
// ---------------------------------------------------------------------------

export interface DeskDropHandlers {
  /** Cursor carrying an item is over this desktop. Coordinates are screen-space. */
  onHover: (p: { kind: DeskDragKind; screenX: number; screenY: number }) => void;
  onLeave: () => void;
  /** Take ownership and commit. Runs before the origin releases. */
  onAdopt: (p: {
    kind: DeskDragKind;
    id: string;
    payload: DeskDragPayload;
    screenX: number;
    screenY: number;
    desktopIndex: number;
  }) => void;
  /** The item now lives elsewhere — drop it from this desktop. */
  onRelease: (p: { kind: DeskDragKind; id: string }) => void;
  /** Nothing was handed over; keep the item. */
  onCancelled: (p: { kind: DeskDragKind; id: string; reason: string }) => void;
}

/** Subscribe this window to the broker. Returns an unsubscribe function. */
export function subscribeDeskDrag(handlers: DeskDropHandlers): () => void {
  const offHover = window.api.onDeskDragHover((p) =>
    handlers.onHover({ kind: p.kind, screenX: p.screenX, screenY: p.screenY }),
  );
  const offLeave = window.api.onDeskDragLeave(() => handlers.onLeave());
  const offAdopt = window.api.onDeskDragAdopt((p) =>
    handlers.onAdopt({
      kind: p.kind,
      id: p.id,
      payload: p.payload as DeskDragPayload,
      screenX: p.screenX,
      screenY: p.screenY,
      desktopIndex: p.desktopIndex,
    }),
  );
  const offRelease = window.api.onDeskDragRelease((p) => handlers.onRelease(p));
  const offCancelled = window.api.onDeskDragCancelled((p) => handlers.onCancelled(p));
  return () => {
    offHover();
    offLeave();
    offAdopt();
    offRelease();
    offCancelled();
  };
}

/**
 * Screen coordinates -> position inside this desk, in desk-local px.
 *
 * `window.screenX/screenY` is the window's origin on the virtual screen, so the
 * difference lands in client space; `scale` then undoes the Aero canvas
 * transform, exactly as `desktopPointerScale()` does for local pointers.
 */
export function screenToDeskPoint(
  screenX: number,
  screenY: number,
  deskEl: HTMLElement | null,
  scale: number,
): { x: number; y: number } {
  if (!deskEl) return { x: 40, y: 40 };
  const rect = deskEl.getBoundingClientRect();
  const clientX = screenX - window.screenX;
  const clientY = screenY - window.screenY;
  return {
    x: Math.max(0, (clientX - rect.left) / Math.max(0.05, scale)),
    y: Math.max(0, (clientY - rect.top) / Math.max(0.05, scale)),
  };
}
