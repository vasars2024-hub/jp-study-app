// kbd6 — key sequences at runtime ("Ctrl+K S", "Ctrl+K Ctrl+S"), VS Code style.
//
// keyboardShortcuts.ts imports this lazily, once some binding holds a sequence, and
// hands over a resolver (`attach`) for "what would answer this command right now".
// Every window installs the dispatcher (Blanc's boot graph has a byte ceiling), and
// most users never bind a sequence, so none of this — nor the live region and its
// sheet — is on anyone's boot path.
//
// Rules: a first step that starts a sequence of a LIVE command (an eligible view
// handler or a built-in) is held instead of firing its own single-chord binding —
// the prefix wins. The next key completes it, extends it, or is swallowed with a
// "not a shortcut" notice. Escape, a click and KEY_SEQUENCE_TIMEOUT_MS cancel.
// Modifier-only keys never reach here (the dispatcher drops them first).

import { COMMAND_CATALOG, effectiveKeys, formatKeysDisplay, KEY_SEQUENCE_MAX_STEPS, listCustomCommands, splitChords } from './keyboardShortcuts';
import { ensureUiPack, t } from './i18n';
import './components/kbd6.css';

/** How long a held prefix waits for its next key. */
export const KEY_SEQUENCE_TIMEOUT_MS = 1500;
/** A "not a shortcut" notice clears itself after this long. */
const MISS_SHOWN_MS = 1500;

type Handler = (e: Event) => boolean | void;
type Resolve = (id: string, e: Event) => Handler | null;

let resolveLive: Resolve | null = null;
let pending: string[] | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Called by keyboardShortcuts.ts once this module has loaded. */
export function attach(resolve: Resolve): void {
  resolveLive = resolve;
}

/** True once the dispatcher has wired this module in. */
export function keySequencesReady(): boolean {
  return resolveLive != null;
}

/** The steps a sequence is waiting on, or null. */
export function keySequencePending(): string[] | null {
  return pending && [...pending];
}

/** Handlers the steps complete, and whether some live command's sequence goes on past them. */
function candidates(steps: string[], e: Event, editing: boolean): { exact: Handler[]; longer: boolean } {
  const joined = steps.join(' ');
  const exact: Handler[] = [];
  let longer = false;
  const commands: { id: string; worksWhileTyping?: boolean }[] = [...COMMAND_CATALOG, ...listCustomCommands()];
  for (const c of commands) {
    if (editing && !c.worksWhileTyping) continue;
    const alts = splitChords(effectiveKeys(c.id));
    const isExact = steps.length > 1 && alts.includes(joined);
    const isLonger = alts.some((a) => a.startsWith(`${joined} `));
    if (!isExact && !isLonger) continue;
    const fn = resolveLive?.(c.id, e);
    if (!fn) continue;
    if (isExact) exact.push(fn);
    if (isLonger) longer = true;
  }
  return { exact, longer };
}

function end(): void {
  if (timer) clearTimeout(timer);
  if (pending) announce(() => '');
  timer = null;
  pending = null;
}

function begin(steps: string[]): void {
  end();
  pending = steps;
  timer = setTimeout(end, KEY_SEQUENCE_TIMEOUT_MS);
  announce(() => t('kbd6.seq.waiting', { keys: formatKeysDisplay(steps.join(' ')) }));
}

/**
 * The first step, after the dispatcher's typing / IME / AltGr / lockscreen / focused-
 * control guards. True (and the key is swallowed) when it starts a live sequence.
 */
export function startKeySequence(chord: string, e: Event, editing: boolean): boolean {
  if (!candidates([chord], e, editing).longer) return false;
  begin([chord]);
  e.preventDefault();
  return true;
}

/** The key after a held prefix belongs to the sequence: run it, wait on, or swallow it. */
export function continueKeySequence(chord: string, e: KeyboardEvent): boolean {
  if (!pending) return false;
  e.preventDefault();
  const steps = [...pending, chord];
  end();
  if (chord === 'Escape') return true;
  const { exact, longer } = candidates(steps, e, false);
  if (exact.length) exact.some((fn) => fn(e) !== false);
  else if (longer && steps.length < KEY_SEQUENCE_MAX_STEPS) begin(steps);
  else announce(() => t('kbd6.seq.noCommand', { keys: formatKeysDisplay(steps.join(' ')) }), true);
  return true;
}

/** A click, or the dispatcher going away, abandons a half-typed sequence. */
export function cancelKeySequence(): void {
  end();
}

// ---------------------------------------------------------------------------
// The live region: "Ctrl+K pressed. Waiting for the next key…". Plain DOM — the
// dispatcher runs outside any React tree. Created once and kept in the tree
// (transparent and empty when closed, never display:none) so a screen reader hears
// each change; inside Blanc it joins `.blanc-root` to take Blanc's tokens.
// ---------------------------------------------------------------------------

let region: HTMLElement | null = null;
/** True for the beat between creating the region and its first content. */
let fresh = false;
let latest = { text: '', miss: false };
let hideTimer: ReturnType<typeof setTimeout> | null = null;
/** Announcements in order; each waits for the lazy kbd6 strings so none reads "…". */
let queue: Promise<void> = Promise.resolve();

function announce(text: () => string, miss = false): void {
  queue = queue
    .then(() => ensureUiPack('pass6').catch(() => undefined))
    .then(() => show(text(), miss))
    .catch(() => undefined);
}

function paint(el: HTMLElement): void {
  el.textContent = latest.text;
  el.dataset.open = latest.text ? 'true' : 'false';
  el.dataset.state = latest.miss ? 'miss' : 'waiting';
}

function show(text: string, miss: boolean): void {
  if (typeof document === 'undefined' || !document.body) return;
  latest = { text, miss };
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = miss ? setTimeout(() => show('', false), MISS_SHOWN_MS) : null;
  if (region?.isConnected) {
    if (!fresh) paint(region);
    return;
  }
  const el = document.createElement('div');
  el.className = 'kbd6-seq-status';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  el.dataset.open = 'false';
  (document.querySelector('.blanc-root') ?? document.body).append(el);
  region = el;
  // A live region announces changes, not the content it is born with: fill it a beat later.
  fresh = true;
  setTimeout(() => {
    fresh = false;
    if (region === el) paint(el);
  }, 50);
}
