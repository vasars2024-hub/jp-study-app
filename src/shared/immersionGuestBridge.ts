// Immersion Browser — the guest⇄host study-lookup bridge (slice 70).
//
// The Immersion Browser renders arbitrary untrusted web content in a
// `<webview>` (`persist:immersion`). `src/main.ts:596` isolates that guest from
// `window.api`, and it stays isolated: this module is the *entire* surface the
// guest is given, and it is deliberately tiny.
//
// Shape of the thing:
//
//   guest page (main world)      — no access to any of this. contextIsolation
//                                  is on, so the page cannot see `require`,
//                                  `ipcRenderer`, or the listeners below.
//   guest preload (isolated)     — `immersionGuestBody`, materialised to disk
//                                  by main and attached in `will-attach-webview`.
//                                  Reads the DOM, sends ONE message kind out.
//   host renderer                — `validateGuestLookupMessage` +
//                                  `createGuestLookupGate`, then the existing
//                                  `wordLookup` path. Renders the popup itself.
//
// `ipcRenderer.sendToHost` reaches the embedder `<webview>` element and nothing
// else — it does not reach `ipcMain`. So no message defined here can touch the
// dictionary IPC, the library, Anki, or any other main-process handler. The
// host is what performs a lookup, using code it already had.
//
// Pure module on purpose: no `electron` import, no DOM access at module scope,
// so `src/shared/__tests__/immersionGuestBridge.test.ts` can exercise all of it
// under vitest's node environment.

/** Guest → host. The only channel the guest may send on. */
export const IMMERSION_LOOKUP_CHANNEL = 'jp-study:immersion-lookup';
/** Host → guest. Enable/disable; the guest may only listen. */
export const IMMERSION_CONFIG_CHANNEL = 'jp-study:immersion-config';

export const IMMERSION_GUEST_LIMITS = {
  /** Longest block-text window a guest may push across the boundary. */
  maxText: 400,
  /** Longest selection string (matches wordLookup's own 240-char sentence cap). */
  maxQuery: 240,
  /** Guest viewport coordinates cannot plausibly exceed this. */
  maxCoord: 20000,
  /** Rate-limit window. */
  windowMs: 1000,
  /** Messages accepted per window before the host starts dropping. */
  maxPerWindow: 8,
} as const;

/** The one message shape the guest may send. Every field is required. */
export interface GuestLookupRequest {
  v: 1;
  kind: 'hover' | 'selection';
  /** Block text around the point of interest, already windowed by the guest. */
  text: string;
  /** Index into `text` of the character under the pointer / selection start. */
  offset: number;
  /** Selection surface for `kind: 'selection'`; empty string for `'hover'`. */
  query: string;
  /** Guest-viewport coordinates, translated to host coordinates by the caller. */
  x: number;
  y: number;
}

export type GuestLookupRejection =
  | 'not-an-object'
  | 'bad-version'
  | 'unknown-field'
  | 'missing-field'
  | 'bad-kind'
  | 'bad-text'
  | 'text-too-long'
  | 'bad-offset'
  | 'bad-query'
  | 'query-too-long'
  | 'query-mismatch'
  | 'bad-coords';

export type GuestLookupValidation =
  | { ok: true; value: GuestLookupRequest }
  | { ok: false; reason: GuestLookupRejection };

/** Exactly the fields a `GuestLookupRequest` may carry — anything else is a reject. */
const ALLOWED_FIELDS = ['v', 'kind', 'text', 'offset', 'query', 'x', 'y'] as const;

function isFiniteCoord(n: unknown): n is number {
  return (
    typeof n === 'number' &&
    Number.isFinite(n) &&
    n >= -IMMERSION_GUEST_LIMITS.maxCoord &&
    n <= IMMERSION_GUEST_LIMITS.maxCoord
  );
}

/**
 * Validate one guest message. Strict, allow-list only: an unexpected field is a
 * rejection rather than something quietly ignored, so the contract cannot grow
 * by accident on the guest side without this function being updated too.
 *
 * Returns a **freshly built plain object** on success. Nothing from the guest's
 * object identity survives — no getters, no prototype, no extra properties —
 * so the value handed to the lookup path is inert data.
 */
export function validateGuestLookupMessage(raw: unknown): GuestLookupValidation {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'not-an-object' };
  }
  const src = raw as Record<string, unknown>;

  for (const key of Object.keys(src)) {
    if (!(ALLOWED_FIELDS as readonly string[]).includes(key)) {
      return { ok: false, reason: 'unknown-field' };
    }
  }
  for (const key of ALLOWED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) {
      return { ok: false, reason: 'missing-field' };
    }
  }

  if (src.v !== 1) return { ok: false, reason: 'bad-version' };
  if (src.kind !== 'hover' && src.kind !== 'selection') return { ok: false, reason: 'bad-kind' };

  if (typeof src.text !== 'string' || src.text.length === 0) {
    return { ok: false, reason: 'bad-text' };
  }
  if (src.text.length > IMMERSION_GUEST_LIMITS.maxText) {
    return { ok: false, reason: 'text-too-long' };
  }

  if (typeof src.offset !== 'number' || !Number.isInteger(src.offset)) {
    return { ok: false, reason: 'bad-offset' };
  }
  if (src.offset < 0 || src.offset >= src.text.length) {
    return { ok: false, reason: 'bad-offset' };
  }

  if (typeof src.query !== 'string') return { ok: false, reason: 'bad-query' };
  if (src.query.length > IMMERSION_GUEST_LIMITS.maxQuery) {
    return { ok: false, reason: 'query-too-long' };
  }
  // A hover carries no selection; a selection must carry one. Keeping the two
  // kinds from impersonating each other is what lets the host branch on `kind`
  // without re-deriving intent from the payload.
  if (src.kind === 'hover' && src.query.length > 0) return { ok: false, reason: 'query-mismatch' };
  if (src.kind === 'selection' && src.query.length === 0) {
    return { ok: false, reason: 'query-mismatch' };
  }

  if (!isFiniteCoord(src.x) || !isFiniteCoord(src.y)) return { ok: false, reason: 'bad-coords' };

  return {
    ok: true,
    value: {
      v: 1,
      kind: src.kind,
      text: src.text,
      offset: src.offset,
      query: src.query,
      x: src.x,
      y: src.y,
    },
  };
}

export interface GuestLookupGate {
  /** True if this message may proceed. Advances the window as a side effect. */
  accept(now: number): boolean;
  /** How many messages the gate has dropped since construction. */
  dropped(): number;
}

/**
 * Sliding-window rate limit, applied on the HOST side.
 *
 * The guest has its own limiter, but that one is advice: it lives in code the
 * guest process runs, and a compromised renderer is exactly the thing we are
 * defending against. This one is the enforcement.
 */
export function createGuestLookupGate(
  opts: { windowMs?: number; maxPerWindow?: number } = {},
): GuestLookupGate {
  const windowMs = opts.windowMs ?? IMMERSION_GUEST_LIMITS.windowMs;
  const maxPerWindow = opts.maxPerWindow ?? IMMERSION_GUEST_LIMITS.maxPerWindow;
  const stamps: number[] = [];
  let dropped = 0;
  return {
    accept(now: number): boolean {
      while (stamps.length > 0 && now - stamps[0]! >= windowMs) stamps.shift();
      if (stamps.length >= maxPerWindow) {
        dropped += 1;
        return false;
      }
      stamps.push(now);
      return true;
    },
    dropped: () => dropped,
  };
}

/** Minimal shape of the guest preload's `ipcRenderer`. Only two methods are used. */
export interface GuestIpc {
  sendToHost(channel: string, payload: unknown): void;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
}

/**
 * The guest preload body.
 *
 * **This function is serialized with `Function.prototype.toString()` and
 * evaluated inside the guest.** It therefore must be entirely self-contained:
 * every constant is re-declared inline, and it may not reference a single
 * module-scope binding — a reference would survive bundling as a renamed
 * identifier and throw `ReferenceError` in the guest. The duplicated literals
 * below are deliberate for that reason; `immersionGuestBridge.test.ts` asserts
 * they stay in step with `IMMERSION_GUEST_LIMITS`.
 *
 * It reads the DOM and sends `IMMERSION_LOOKUP_CHANNEL` messages. It renders
 * nothing, injects no stylesheet, and adds no node to the guest document.
 */
/* eslint-disable no-var -- serialized with toString() into the guest; kept in its original, self-contained form */
export function immersionGuestBody(ipc: GuestIpc, win: any): void {
  var CH_LOOKUP = 'jp-study:immersion-lookup';
  var CH_CONFIG = 'jp-study:immersion-config';
  var MAX_TEXT = 400;
  var MAX_QUERY = 240;
  var WINDOW_MS = 1000;
  var MAX_PER_WINDOW = 8;
  var HOVER_MIN_GAP_MS = 90;
  var SHOW_TEXT = 4;
  var TEXT_NODE = 3;
  var BLOCKS = 'p,li,blockquote,h1,h2,h3,h4,h5,h6,td,dd,dt,figcaption,article,section,main,div';

  var doc = win.document;
  if (!doc) return;

  var enabled = true;
  var stamps: number[] = [];
  var lastHoverAt = 0;
  var lastHoverKey = '';

  function allow(now: number): boolean {
    while (stamps.length > 0 && now - stamps[0] >= WINDOW_MS) stamps.shift();
    if (stamps.length >= MAX_PER_WINDOW) return false;
    stamps.push(now);
    return true;
  }

  function blockOf(node: any): any {
    var el = node && node.nodeType === TEXT_NODE ? node.parentElement : node;
    if (!el || !el.closest) return el || null;
    return el.closest(BLOCKS) || el;
  }

  function offsetIn(block: any, target: any, off: number): number {
    var walker = doc.createTreeWalker(block, SHOW_TEXT);
    var acc = 0;
    var n = walker.nextNode();
    while (n) {
      if (n === target) return acc + off;
      acc += (n.textContent || '').length;
      n = walker.nextNode();
    }
    return acc + off;
  }

  // Slice the block down to MAX_TEXT *around* the offset rather than truncating
  // from the front, so the word under the pointer survives on a long node — and
  // so a page with one enormous text node cannot push a megabyte at the host.
  // The offset is rebased onto the slice; it is never left pointing off the end.
  function windowText(text: string, offset: number): { text: string; offset: number } {
    var t = String(text || '');
    if (t.length === 0) return { text: '', offset: 0 };
    var at = offset < 0 ? 0 : offset >= t.length ? t.length - 1 : offset;
    if (t.length <= MAX_TEXT) return { text: t, offset: at };
    var half = Math.floor(MAX_TEXT / 2);
    var start = at - half;
    if (start < 0) start = 0;
    if (start > t.length - MAX_TEXT) start = t.length - MAX_TEXT;
    return { text: t.slice(start, start + MAX_TEXT), offset: at - start };
  }

  function send(kind: string, text: string, offset: number, query: string, x: number, y: number) {
    if (!enabled || !text) return;
    if (!allow(Date.now())) return;
    ipc.sendToHost(CH_LOOKUP, {
      v: 1,
      kind: kind,
      text: text,
      offset: offset,
      query: query,
      x: x,
      y: y,
    });
  }

  // `isTrusted` is the load-bearing check on both handlers: a hostile page can
  // call `document.dispatchEvent(new MouseEvent('mouseup', ...))` all day, but
  // it cannot forge `isTrusted: true` from page script. Everything below is
  // therefore driven by a real user gesture or it does not run.
  doc.addEventListener(
    'mouseup',
    function (e: any) {
      if (!enabled || !e.isTrusted) return;
      var sel = win.getSelection ? win.getSelection() : null;
      var picked = sel ? String(sel.toString()).trim() : '';
      if (!picked) return;
      if (picked.length > MAX_QUERY) picked = picked.slice(0, MAX_QUERY);
      var block = blockOf(sel && sel.anchorNode);
      var full = (block && block.textContent) || picked;
      var needle = picked.slice(0, 8);
      var at = full.indexOf(needle);
      var w = windowText(full, at < 0 ? 0 : at);
      send('selection', w.text, w.offset, picked, e.clientX, e.clientY);
    },
    true,
  );

  doc.addEventListener(
    'mousemove',
    function (e: any) {
      if (!enabled || !e.isTrusted || !e.shiftKey) return;
      var now = Date.now();
      if (now - lastHoverAt < HOVER_MIN_GAP_MS) return;
      lastHoverAt = now;

      var node = null;
      var nodeOffset = 0;
      if (doc.caretRangeFromPoint) {
        var r = doc.caretRangeFromPoint(e.clientX, e.clientY);
        if (r) {
          node = r.startContainer;
          nodeOffset = r.startOffset;
        }
      } else if (doc.caretPositionFromPoint) {
        var p = doc.caretPositionFromPoint(e.clientX, e.clientY);
        if (p) {
          node = p.offsetNode;
          nodeOffset = p.offset;
        }
      }
      if (!node || node.nodeType !== TEXT_NODE) return;
      var block = blockOf(node);
      if (!block) return;
      var full = block.textContent || '';
      if (!full) return;

      var g = offsetIn(block, node, nodeOffset);
      // Sitting still on one character must not re-fire; the gate would eat the
      // budget a real hover needs.
      var key = full.length + ':' + g;
      if (key === lastHoverKey) return;
      lastHoverKey = key;

      var w = windowText(full, g);
      send('hover', w.text, w.offset, '', e.clientX, e.clientY);
    },
    true,
  );

  ipc.on(CH_CONFIG, function (_event: unknown, cfg: any) {
    if (cfg && typeof cfg === 'object' && typeof cfg.enabled === 'boolean') {
      enabled = cfg.enabled;
      if (!enabled) lastHoverKey = '';
    }
  });
}
/* eslint-enable no-var */

/**
 * The full preload source, ready to write to disk. Built from
 * `immersionGuestBody.toString()` so the guest runs real, reviewable,
 * type-checked code rather than a hand-maintained string blob.
 *
 * Materialising at runtime (rather than adding a build entry) is a deliberate
 * constraint of this slice: `forge.config.ts` and the `vite.*.config.ts` files
 * are off-limits, and this repo already has script-as-source precedent in
 * `src/renderer/nhkWebviewScript.ts`.
 */
export function buildImmersionGuestPreload(): string {
  return [
    '// GENERATED AT RUNTIME from src/shared/immersionGuestBridge.ts — do not edit.',
    "'use strict';",
    "const { ipcRenderer } = require('electron');",
    'const body = ' + immersionGuestBody.toString() + ';',
    'try {',
    '  body(ipcRenderer, window);',
    '} catch (err) {',
    "  console.error('[jp-study] immersion study bridge failed to install', err);",
    '}',
    '',
  ].join('\n');
}
