/**
 * Broker for dragging a window, icon, widget or note from one monitor's
 * desktop to another's.
 *
 * HTML5 drag-and-drop does not cross BrowserWindow boundaries for app-internal
 * payloads, so this rides the pointer path the shell already uses:
 * `FloatingWindow.dragStart` takes a `setPointerCapture`, which means the
 * *origin* window keeps receiving `pointermove` while the button is held even
 * once the cursor has left its own bounds — and `screenX/screenY` on those
 * events are virtual-screen coordinates. Main turns that stream into
 * hover/adopt messages for the window under the cursor.
 *
 * The single-writer rule (B2) survives: main never edits a layout. It tells the
 * target to adopt and the origin to release, and each window then commits *its
 * own* desktop. Two windows never write the same desktop.
 */
import { ipcMain } from 'electron';
import type { DesktopIndex } from '../shared/desktop';
import { keyForPoint, onDisplaysChanged } from './displays';
import { desktopIndexForDisplayKey, windowForDisplayKey } from './desktopWindows';

export type DeskDragKind = 'window' | 'icon' | 'widget' | 'note';

interface LiveDrag {
  kind: DeskDragKind;
  /** The existing snapshot type for `kind`. Never copied or reshaped here. */
  payload: unknown;
  /** Stable id within its kind, so the origin knows what to release. */
  id: string;
  originDisplayKey: string;
  /** Display currently hovered, so `leave` fires exactly once per transition. */
  hoverDisplayKey: string | null;
}

let live: LiveDrag | null = null;
let lastMoveAt = 0;
/**
 * The display subscription lasts as long as the process — `registerDeskDragIpc`
 * runs once at app-ready and there is no teardown path — so the unsubscribe
 * handle is deliberately dropped and this is only a re-entry guard.
 */
let watchingDisplays = false;

/** ~60 Hz. A drag emits pointermove far faster than any desktop needs to repaint. */
const MOVE_THROTTLE_MS = 16;

function sendTo(displayKey: string | null, channel: string, payload?: unknown): void {
  if (!displayKey) return;
  const win = windowForDisplayKey(displayKey);
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function clearHover(): void {
  if (live?.hoverDisplayKey) {
    sendTo(live.hoverDisplayKey, 'deskdrag:leave', { kind: live.kind });
    live.hoverDisplayKey = null;
  }
}

/** End the drag with nothing adopted. The origin keeps the item. */
function cancelDrag(reason: string): void {
  if (!live) return;
  clearHover();
  const origin = live.originDisplayKey;
  const kind = live.kind;
  const id = live.id;
  live = null;
  sendTo(origin, 'deskdrag:cancelled', { kind, id, reason });
}

export function registerDeskDragIpc(): void {
  // A monitor vanishing mid-drag would otherwise leave a hover state on a
  // window that no longer exists, and an item owned by nobody.
  if (!watchingDisplays) {
    watchingDisplays = true;
    onDisplaysChanged(() => {
      if (!live) return;
      if (!windowForDisplayKey(live.originDisplayKey)) {
        // Origin itself is gone; there is nothing to hand the item back to.
        live = null;
        return;
      }
      if (live.hoverDisplayKey && !windowForDisplayKey(live.hoverDisplayKey)) {
        cancelDrag('display-removed');
      }
    });
  }

  ipcMain.on(
    'deskdrag:begin',
    (
      _e,
      payload: { kind?: unknown; id?: unknown; payload?: unknown; displayKey?: unknown },
    ) => {
      const kind = payload?.kind;
      if (kind !== 'window' && kind !== 'icon' && kind !== 'widget' && kind !== 'note') return;
      if (typeof payload.id !== 'string' || typeof payload.displayKey !== 'string') return;
      // A second begin without an end means the previous drag was abandoned
      // (window closed mid-gesture, renderer reloaded). Retire it cleanly.
      if (live) cancelDrag('superseded');
      live = {
        kind,
        payload: payload.payload,
        id: payload.id,
        originDisplayKey: payload.displayKey,
        hoverDisplayKey: null,
      };
      lastMoveAt = 0;
    },
  );

  ipcMain.on('deskdrag:move', (_e, payload: { screenX?: unknown; screenY?: unknown }) => {
    if (!live) return;
    const { screenX, screenY } = payload ?? {};
    if (typeof screenX !== 'number' || typeof screenY !== 'number') return;

    const targetKey = keyForPoint(screenX, screenY);
    const crossing = targetKey !== live.hoverDisplayKey;

    // Throttle only moves that stay on the same display. A transition must
    // never be dropped: swipe the cursor quickly across a monitor edge and the
    // two moves land inside one throttle window, so the `leave` would be lost
    // and a ghost stranded on the display the pointer already left.
    const now = Date.now();
    if (!crossing) {
      if (now - lastMoveAt < MOVE_THROTTLE_MS) return;
    }
    lastMoveAt = now;

    // Over its own display: the shell's local drag handles it, so retract any
    // cross-window hover and stay quiet.
    if (!targetKey || targetKey === live.originDisplayKey) {
      clearHover();
      return;
    }

    if (live.hoverDisplayKey && live.hoverDisplayKey !== targetKey) clearHover();
    live.hoverDisplayKey = targetKey;
    sendTo(targetKey, 'deskdrag:hover', {
      kind: live.kind,
      screenX,
      screenY,
      desktopIndex: desktopIndexForDisplayKey(targetKey),
    });
  });

  ipcMain.on('deskdrag:end', (_e, payload: { screenX?: unknown; screenY?: unknown }) => {
    if (!live) return;
    const { screenX, screenY } = payload ?? {};
    if (typeof screenX !== 'number' || typeof screenY !== 'number') {
      cancelDrag('bad-coordinates');
      return;
    }

    const targetKey = keyForPoint(screenX, screenY);
    if (!targetKey || targetKey === live.originDisplayKey) {
      cancelDrag('same-display');
      return;
    }

    const targetDesktop: DesktopIndex | null = desktopIndexForDisplayKey(targetKey);
    if (targetDesktop == null || !windowForDisplayKey(targetKey)) {
      cancelDrag('no-target');
      return;
    }

    clearHover();
    const { kind, id, payload: item, originDisplayKey } = live;
    live = null;

    // Target adopts first. If it never commits, the origin's release still
    // fires and the item is lost — so the adopt handler commits synchronously
    // in the renderer before anything can interleave.
    sendTo(targetKey, 'deskdrag:adopt', {
      kind,
      id,
      payload: item,
      screenX,
      screenY,
      desktopIndex: targetDesktop,
    });
    sendTo(originDisplayKey, 'deskdrag:release', { kind, id });
  });

  ipcMain.on('deskdrag:cancel', () => cancelDrag('cancelled'));
}

/**
 * Whether a drag is in flight. Exported rather than exposed over IPC: no
 * renderer needs to ask (each already knows, from its own `beginDeskDrag`), and
 * `tools/architecture-audit.cjs` correctly flags a handler with no caller.
 */
export function isDragActive(): boolean {
  return live != null;
}
