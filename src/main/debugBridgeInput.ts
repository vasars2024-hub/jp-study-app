/**
 * Synthetic-input plumbing for the dev debug bridge, split out so the parts that
 * decide *what* to dispatch and *whether it arrived* can be tested without an
 * Electron window.
 *
 * Why this exists at all. Measured 2026-09-05 against the running dev app
 * (pid 36988, window 1, `document.hasFocus() === true`, `visibilityState`
 * "visible"): `POST /type {text:"abc"}` answered `{ok:true,typed:3}` and a
 * capture-phase listener on `document` recorded ZERO keydown/keypress/input
 * events; `POST /key {key:"a"}` and `POST /click {x,y}` behaved identically —
 * an `ok:true` receipt over nothing delivered. `webContents.sendInputEvent`
 * routes through the platform widget host, which drops input for a window that
 * is Electron-focused but is not the OS foreground window, and the route had no
 * way to tell that apart from success.
 *
 * Two consequences, and both are the point of this module:
 *  - Dispatch over the DevTools agent (`Input.*`) instead. It does not consult
 *    OS focus, which is why a headless driver can type into a background page.
 *  - NEVER report a send as a delivery. Every receipt carries what the renderer
 *    actually observed, and `ok` is false when that is nothing. A harness that
 *    cannot distinguish delivery from silence scores surfaces it never touched,
 *    which is exactly what happened to every `/click`-based rubric probe.
 */

/** What the renderer-side witness reports; a snapshot, differenced by the caller. */
export interface InputWitness {
  keydown: number;
  mousedown: number;
  /** Concatenated `beforeinput` data — empty when no editable target had focus. */
  textInput: string;
}

export interface InputReceipt {
  ok: boolean;
  /** How many events this call asked the transport for. */
  sent: number;
  /** How many the renderer's own listeners saw. */
  delivered: number;
  /** Characters that actually reached an editable target. Distinct from `delivered`: a
   *  key can arrive with nothing focused, which is a real and different outcome. */
  inserted: number;
  transport: 'cdp' | 'sendInputEvent';
  error?: string;
}

export const EMPTY_WITNESS: InputWitness = { keydown: 0, mousedown: 0, textInput: '' };

/**
 * Installed in the page and read back either side of a dispatch. Idempotent: the
 * listeners attach once per document, so repeated calls only sample. A navigation
 * clears them and the next call re-arms — which is safe because callers difference
 * two samples rather than trusting an absolute count.
 */
export const INPUT_WITNESS_SOURCE = `(() => {
  const w = window;
  if (!w.__jpBridgeInput) {
    const seen = { keydown: 0, mousedown: 0, textInput: '' };
    w.__jpBridgeInput = seen;
    document.addEventListener('keydown', () => { seen.keydown += 1; }, true);
    document.addEventListener('mousedown', () => { seen.mousedown += 1; }, true);
    document.addEventListener('beforeinput', (e) => {
      if (typeof e.data === 'string') seen.textInput += e.data;
    }, true);
  }
  const s = w.__jpBridgeInput;
  return { keydown: s.keydown, mousedown: s.mousedown, textInput: s.textInput };
})()`;

/** Tolerates a missing or half-shaped reading rather than throwing inside a route. */
export function normaliseWitness(raw: unknown): InputWitness {
  const r = (raw ?? {}) as Partial<InputWitness>;
  return {
    keydown: Number.isFinite(r.keydown) ? Number(r.keydown) : 0,
    mousedown: Number.isFinite(r.mousedown) ? Number(r.mousedown) : 0,
    textInput: typeof r.textInput === 'string' ? r.textInput : '',
  };
}

/**
 * The honesty gate. `ok` follows the channel the caller actually drove, never the
 * count it sent — that inversion is the whole defect this module was written for.
 */
export function summariseDelivery(
  before: InputWitness,
  after: InputWitness,
  channel: 'key' | 'mouse',
  sent: number,
  transport: InputReceipt['transport'],
): InputReceipt {
  const delivered =
    channel === 'key' ? after.keydown - before.keydown : after.mousedown - before.mousedown;
  const inserted = Math.max(0, after.textInput.length - before.textInput.length);
  const receipt: InputReceipt = {
    ok: delivered > 0,
    sent,
    delivered: Math.max(0, delivered),
    inserted,
    transport,
  };
  if (!receipt.ok) {
    receipt.error =
      `sent ${sent} ${channel} event(s) over ${transport} and the renderer observed none. ` +
      'The window is very likely not the OS foreground window; treat this as NOT delivered.';
  }
  return receipt;
}

/** Electron's modifier names -> the CDP bitmask. Unknown names are ignored, not fatal. */
export function cdpModifierMask(modifiers: readonly string[]): number {
  let mask = 0;
  for (const raw of modifiers) {
    switch (String(raw).toLowerCase()) {
      case 'alt':
        mask |= 1;
        break;
      case 'control':
      case 'ctrl':
        mask |= 2;
        break;
      case 'meta':
      case 'cmd':
      case 'command':
      case 'super':
        mask |= 4;
        break;
      case 'shift':
        mask |= 8;
        break;
      default:
        break;
    }
  }
  return mask;
}

interface NamedKey {
  key: string;
  code: string;
  vk: number;
}

/**
 * Only the keys a QA walk actually presses. Deliberately short: an unmapped name
 * still dispatches with a best-effort descriptor rather than failing the route,
 * and a single printable character needs no entry at all.
 */
const NAMED_KEYS: Record<string, NamedKey> = {
  enter: { key: 'Enter', code: 'Enter', vk: 13 },
  return: { key: 'Enter', code: 'Enter', vk: 13 },
  tab: { key: 'Tab', code: 'Tab', vk: 9 },
  escape: { key: 'Escape', code: 'Escape', vk: 27 },
  esc: { key: 'Escape', code: 'Escape', vk: 27 },
  backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
  delete: { key: 'Delete', code: 'Delete', vk: 46 },
  space: { key: ' ', code: 'Space', vk: 32 },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  up: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  down: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  right: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  home: { key: 'Home', code: 'Home', vk: 36 },
  end: { key: 'End', code: 'End', vk: 35 },
  pageup: { key: 'PageUp', code: 'PageUp', vk: 33 },
  pagedown: { key: 'PageDown', code: 'PageDown', vk: 34 },
};

export interface CdpKeyEvent {
  type: 'keyDown' | 'keyUp';
  key: string;
  code: string;
  windowsVirtualKeyCode: number;
  nativeVirtualKeyCode: number;
  modifiers: number;
  /** Present only when the press should insert a character. */
  text?: string;
  unmodifiedText?: string;
}

/**
 * Builds the keyDown/keyUp pair for one key press.
 *
 * The `text` field is what makes a press insert a character; CDP treats a keyDown
 * WITHOUT it as a raw key (no keypress, no insertion). So a printable character
 * gets one, a named key does not, and a modifier other than Shift suppresses it —
 * Ctrl+A must select, not type "a".
 */
export function cdpKeyEvents(key: string, modifiers: readonly string[] = []): CdpKeyEvent[] {
  const mask = cdpModifierMask(modifiers);
  const named = NAMED_KEYS[key.toLowerCase()];
  const printable = !named && Array.from(key).length === 1;
  // Ctrl/Alt/Meta turn a press into a command rather than an insertion.
  const suppressText = (mask & (1 | 2 | 4)) !== 0;

  let descriptor: NamedKey;
  if (named) {
    descriptor = named;
  } else if (printable) {
    const upper = key.toUpperCase();
    descriptor = {
      key,
      code: /[a-z]/i.test(key)
        ? `Key${upper}`
        : /[0-9]/.test(key)
          ? `Digit${key}`
          : '',
      vk: upper.charCodeAt(0),
    };
  } else {
    descriptor = { key, code: '', vk: 0 };
  }

  const base = {
    key: descriptor.key,
    code: descriptor.code,
    windowsVirtualKeyCode: descriptor.vk,
    nativeVirtualKeyCode: descriptor.vk,
    modifiers: mask,
  };
  const wantsText = (printable || named?.key === ' ' || named?.key === 'Enter') && !suppressText;
  const text = named?.key === 'Enter' ? '\r' : descriptor.key;

  return [
    { type: 'keyDown', ...base, ...(wantsText ? { text, unmodifiedText: text } : {}) },
    { type: 'keyUp', ...base },
  ];
}

export interface CdpMouseEvent {
  type: 'mousePressed' | 'mouseReleased';
  x: number;
  y: number;
  button: 'left' | 'right' | 'middle';
  buttons: number;
  clickCount: number;
  modifiers: number;
}

/** `buttons` is the mask of what is held DOWN, so the release event clears it. */
export function cdpMouseEvents(
  x: number,
  y: number,
  button: 'left' | 'right' | 'middle',
  clickCount: number,
  modifiers: readonly string[] = [],
): CdpMouseEvent[] {
  const mask = cdpModifierMask(modifiers);
  const held = button === 'left' ? 1 : button === 'right' ? 2 : 4;
  const base = { x, y, button, clickCount, modifiers: mask };
  return [
    { type: 'mousePressed', ...base, buttons: held },
    { type: 'mouseReleased', ...base, buttons: 0 },
  ];
}
