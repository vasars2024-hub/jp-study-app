// @vitest-environment jsdom
/**
 * kbd6 — key sequences ("Ctrl+K S"), search-by-key helpers and the isDefault fix.
 *
 * - normalization is step by step; mouse steps are invalid; a sequence never reaches
 *   Windows (global / Startup-helper chords skip it);
 * - the dispatcher holds a live prefix, runs the completed sequence, swallows a key
 *   that leads nowhere, cancels on Escape or after the timeout, and keeps the typing
 *   guard for the first step;
 * - `keyQueryToChord` (keyQuery.ts) reads "ctrl k" as keys and "reader" as a word;
 * - a default spelled out of normal order still reads as the default.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

function stubApi(): void {
  const api = new Proxy(
    {},
    {
      get: (_target, prop) =>
        typeof prop === 'string' && prop.startsWith('on') ? () => () => undefined : () => Promise.resolve(null),
    },
  );
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
}

type KS = typeof import('../keyboardShortcuts');
type KQ = typeof import('../keyQuery');
type KSeq = typeof import('../keySequences');
let ks: KS;
let kq: KQ;
let kseq: KSeq;
let uninstall: () => void = () => undefined;

beforeAll(async () => {
  stubApi();
  localStorage.clear();
  ks = await import('../keyboardShortcuts');
  kq = await import('../keyQuery');
  kseq = await import('../keySequences');
  uninstall = ks.installKeyboardShortcuts();
  // The sequence runtime is lazy: binding a sequence is what loads it.
  ks.setBinding('nav.widgets', 'Ctrl+K S');
  await vi.waitFor(() => expect(kseq.keySequencesReady()).toBe(true));
  ks.resetAllBindings();
});

afterAll(() => {
  uninstall();
  localStorage.clear();
});

beforeEach(() => {
  ks.resetAllBindings();
  for (const c of ks.listCustomCommands()) ks.removeCustomCommand(c.id);
  (document.activeElement as HTMLElement | null)?.blur?.();
  document.body.replaceChildren();
});

afterEach(() => {
  vi.useRealTimers();
  // Leave no half-typed sequence behind for the next test.
  if (kseq.keySequencePending()) press({ key: 'Escape', code: 'Escape' });
});

function press(init: KeyboardEventInit, target: EventTarget = document.body): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
}

const CTRL_K: KeyboardEventInit = { key: 'k', code: 'KeyK', ctrlKey: true };
const S: KeyboardEventInit = { key: 's', code: 'KeyS' };

/** Count the window events a built-in fires: `nav.widgets` → os:widgets, `nav.palette` → palette:open. */
function counter(event: string): { count: () => number; stop: () => void } {
  let n = 0;
  const h = (): void => {
    n += 1;
  };
  window.addEventListener(event, h);
  return { count: () => n, stop: () => window.removeEventListener(event, h) };
}

function statusRegion(): HTMLElement | null {
  return document.querySelector('.kbd6-seq-status');
}

/** The live region is a lazy module and fills a beat after it is created. */
async function statusSays(text: string | RegExp): Promise<HTMLElement> {
  await vi.waitFor(() => {
    expect(statusRegion()?.textContent ?? '').toMatch(text);
  });
  return statusRegion() as HTMLElement;
}

async function statusClosed(): Promise<void> {
  await vi.waitFor(() => {
    expect(statusRegion()?.dataset.open).toBe('false');
  });
}

describe('normalization', () => {
  it('normalizes a sequence step by step and keeps single chords as they were', () => {
    expect(ks.normalizeChord('ctrl+k s')).toBe('Ctrl+K S');
    expect(ks.normalizeChord('Ctrl + K')).toBe('Ctrl+K');
    expect(ks.normalizeChord('  shift+ctrl+k   ctrl+s ')).toBe('Ctrl+Shift+K Ctrl+S');
    expect(ks.normalizeChord('Ctrl+K S|Space')).toBe('Ctrl+K S|Space');
    expect(ks.normalizeChord('Space|Enter')).toBe('Space|Enter');
    // Keys typed by hand: named keys in any case land on the spelling a keypress produces.
    expect(kq.normalizeTypedKeys('ctrl+shift+f12 esc')).toBe('Ctrl+Shift+F12 Escape');
    expect(kq.normalizeTypedKeys('alt+left|pgdn')).toBe('Alt+ArrowLeft|PageDown');
    expect(kq.normalizeTypedKeys('ctrl+k s')).toBe('Ctrl+K S');
  });

  it('refuses a mouse step and cuts a sequence at the step limit', () => {
    expect(ks.normalizeChord('Ctrl+K MouseRight')).toBe('');
    expect(ks.normalizeChord('Ctrl+K MouseRight|F5')).toBe('F5');
    expect(ks.normalizeChord('Ctrl+MouseRight')).toBe('Ctrl+MouseRight');
    expect(ks.normalizeChord('a b c d e')).toBe('A B C D');
    expect(ks.KEY_SEQUENCE_MAX_STEPS).toBe(4);
  });

  it('splits and spells sequences', () => {
    expect(ks.isKeySequence('Ctrl+K S')).toBe(true);
    expect(ks.isKeySequence('Ctrl+K')).toBe(false);
    expect(kq.keySequenceSteps('Ctrl+K Ctrl+S')).toEqual(['Ctrl+K', 'Ctrl+S']);
    expect(ks.formatKeysDisplay('Ctrl+K S|F5')).toBe('Ctrl+K, then S · F5');
    expect(ks.formatKeysDisplay('Ctrl+K S D')).toBe('Ctrl+K, then S, then D');
  });

  it('accepts a typed sequence as a binding', () => {
    ks.setBinding('nav.widgets', 'ctrl+k  w');
    expect(ks.effectiveKeys('nav.widgets')).toBe('Ctrl+K W');
    ks.setBinding('nav.widgets', 'Ctrl+K X', 'add');
    expect(ks.effectiveKeys('nav.widgets')).toBe('Ctrl+K W|Ctrl+K X');
  });
});

describe('system-wide chords never carry a sequence', () => {
  it('collectGlobalChords drops sequence alternatives', () => {
    const global = ks.COMMAND_CATALOG.find((c) => c.global);
    expect(global).toBeDefined();
    const id = (global as { id: string }).id;
    ks.setBinding(id, 'Ctrl+Alt+Shift+F11|Ctrl+K G');
    expect(ks.collectGlobalChords()[id]).toBe('Ctrl+Alt+Shift+F11');
    ks.setBinding(id, 'Ctrl+K G');
    expect(ks.collectGlobalChords()[id]).toBe('');
  });

  it('the Startup helper gets the first single-chord alternative', () => {
    ks.setBinding('app.restart', 'Ctrl+K R|Ctrl+Alt+Shift+R');
    expect(ks.collectOsHotkeyBindings().restart).toBe('Ctrl+Alt+Shift+R');
    ks.setBinding('app.restart', 'Ctrl+K R');
    expect(ks.collectOsHotkeyBindings().restart).toBe('');
  });
});

describe('isDefault compares normalized keys', () => {
  it('every untouched catalog row reads as its default', () => {
    const wrong = ks.getBindings().filter((r) => !r.custom && !r.isDefault).map((r) => r.id);
    expect(wrong).toEqual([]);
  });

  it('a default spelled Meta+Ctrl is still the default, and setting it back drops the override', () => {
    const res = ks.importShortcuts(
      JSON.stringify({
        active: 'Default',
        profiles: { Default: {} },
        customCommands: [
          { id: 'custom.kbd6raw', label: 'Raw', defaultKeys: 'Meta+Ctrl+J', action: { type: 'openApp', appId: 'music' } },
        ],
      }),
    );
    expect(res.ok).toBe(true);
    const row = ks.getBindings().find((r) => r.id === 'custom.kbd6raw');
    expect(row?.keys).toBe('Ctrl+Meta+J');
    expect(row?.isDefault).toBe(true);
    ks.setBinding('custom.kbd6raw', 'Ctrl+Meta+J');
    const exported = JSON.parse(ks.exportShortcuts()) as { profiles: Record<string, Record<string, unknown>> };
    expect('custom.kbd6raw' in (exported.profiles.Default ?? {})).toBe(false);
  });
});

describe('dispatching a sequence', () => {
  it('holds the prefix, announces it, and runs the command on the second key', async () => {
    ks.setBinding('nav.widgets', 'Ctrl+K S');
    const widgets = counter('os:widgets');
    const palette = counter('palette:open');
    const first = press(CTRL_K);
    expect(first.defaultPrevented).toBe(true);
    // The prefix wins over Ctrl+K's own binding (the palette).
    expect(palette.count()).toBe(0);
    expect(kseq.keySequencePending()).toEqual(['Ctrl+K']);
    const region = await statusSays('Ctrl+K pressed. Waiting for the next key…');
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.dataset.open).toBe('true');
    // A modifier on its own neither advances nor cancels.
    press({ key: 'Shift', code: 'ShiftLeft', shiftKey: true });
    expect(kseq.keySequencePending()).toEqual(['Ctrl+K']);
    const second = press(S);
    expect(second.defaultPrevented).toBe(true);
    expect(widgets.count()).toBe(1);
    expect(kseq.keySequencePending()).toBeNull();
    await statusClosed();
    widgets.stop();
    palette.stop();
  });

  it('runs Ctrl+K Ctrl+S too, and waits through a three-step prefix', async () => {
    ks.setBinding('nav.widgets', 'Ctrl+K Ctrl+S X');
    const widgets = counter('os:widgets');
    press(CTRL_K);
    press({ key: 's', code: 'KeyS', ctrlKey: true });
    expect(kseq.keySequencePending()).toEqual(['Ctrl+K', 'Ctrl+S']);
    await statusSays('Ctrl+K, then Ctrl+S pressed');
    press({ key: 'x', code: 'KeyX' });
    expect(widgets.count()).toBe(1);
    widgets.stop();
  });

  it('swallows a second key that completes nothing and says so', async () => {
    ks.setBinding('nav.widgets', 'Ctrl+K S');
    const widgets = counter('os:widgets');
    press(CTRL_K);
    const wrong = press({ key: 'x', code: 'KeyX' });
    expect(wrong.defaultPrevented).toBe(true);
    expect(widgets.count()).toBe(0);
    expect(kseq.keySequencePending()).toBeNull();
    const region = await statusSays('Ctrl+K, then X is not a shortcut.');
    expect(region.dataset.state).toBe('miss');
    widgets.stop();
  });

  it('Escape cancels a pending sequence', async () => {
    ks.setBinding('nav.widgets', 'Ctrl+K S');
    const widgets = counter('os:widgets');
    press(CTRL_K);
    const esc = press({ key: 'Escape', code: 'Escape' });
    expect(esc.defaultPrevented).toBe(true);
    expect(kseq.keySequencePending()).toBeNull();
    await statusClosed();
    press(S);
    expect(widgets.count()).toBe(0);
    widgets.stop();
  });

  it('gives up after the timeout', () => {
    vi.useFakeTimers();
    ks.setBinding('nav.widgets', 'Ctrl+K S');
    const widgets = counter('os:widgets');
    press(CTRL_K);
    expect(kseq.keySequencePending()).toEqual(['Ctrl+K']);
    vi.advanceTimersByTime(kseq.KEY_SEQUENCE_TIMEOUT_MS + 10);
    expect(kseq.keySequencePending()).toBeNull();
    press(S);
    expect(widgets.count()).toBe(0);
    widgets.stop();
  });

  it('a sequence whose view is not open does not hold its first key', () => {
    // reader.pageNext has no built-in: with no reader mounted nothing would answer it.
    ks.setBinding('reader.pageNext', 'Ctrl+K R');
    const palette = counter('palette:open');
    press(CTRL_K);
    expect(kseq.keySequencePending()).toBeNull();
    expect(palette.count()).toBe(1);
    palette.stop();
  });

  it('a bare first step does not start while typing, and does on the desktop', () => {
    ks.setBinding('nav.widgets', 'G W');
    const widgets = counter('os:widgets');
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    const typed = press({ key: 'g', code: 'KeyG' }, input);
    expect(typed.defaultPrevented).toBe(false);
    expect(kseq.keySequencePending()).toBeNull();
    input.blur();
    press({ key: 'g', code: 'KeyG' });
    expect(kseq.keySequencePending()).toEqual(['G']);
    press({ key: 'w', code: 'KeyW' });
    expect(widgets.count()).toBe(1);
    widgets.stop();
  });

  it('an editing chord in a text field never starts a sequence', () => {
    ks.setBinding('nav.widgets', 'Ctrl+C X');
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    const copy = press({ key: 'c', code: 'KeyC', ctrlKey: true }, input);
    expect(copy.defaultPrevented).toBe(false);
    expect(kseq.keySequencePending()).toBeNull();
  });
});

describe('search by key', () => {
  it('reads chord-like queries as keys', () => {
    expect(kq.keyQueryToChord('ctrl+k')).toBe('Ctrl+K');
    expect(kq.keyQueryToChord('Ctrl K')).toBe('Ctrl+K');
    expect(kq.keyQueryToChord('ctrl+shift+f')).toBe('Ctrl+Shift+F');
    expect(kq.keyQueryToChord('shift ctrl f')).toBe('Ctrl+Shift+F');
    expect(kq.keyQueryToChord('F5')).toBe('F5');
    expect(kq.keyQueryToChord('ctrl+k s')).toBe('Ctrl+K S');
    expect(kq.keyQueryToChord('alt+arrowleft')).toBe('Alt+ArrowLeft');
    expect(kq.keyQueryToChord('alt+left')).toBe('Alt+ArrowLeft');
    expect(kq.keyQueryToChord('esc')).toBe('Escape');
    expect(kq.keyQueryToChord('PageUp')).toBe('PageUp');
    expect(kq.keyQueryToChord('ctrl+,')).toBe('Ctrl+,');
  });

  it('leaves words, lone letters and half-typed chords alone', () => {
    for (const q of ['reader', 'save', 'k', 'k s', 'home', 'up', 'ctrl', 'ctrl+', 'open music', '', '  ']) {
      expect(kq.keyQueryToChord(q), q).toBeNull();
    }
  });

  it('matches an alternative exactly or as the start of a sequence', () => {
    expect(kq.keysMatchQuery('Ctrl+K', 'Ctrl+K')).toBe(true);
    expect(kq.keysMatchQuery('F5|Ctrl+K S', 'Ctrl+K')).toBe(true);
    expect(kq.keysMatchQuery('Ctrl+K S', 'Ctrl+K S')).toBe(true);
    expect(kq.keysMatchQuery('Ctrl+K', 'Ctrl+K S')).toBe(false);
    expect(kq.keysMatchQuery('Ctrl+Shift+K', 'Ctrl+K')).toBe(false);
    expect(kq.keysMatchQuery('', 'Ctrl+K')).toBe(false);
  });
});

describe('commandAvailability', () => {
  it('tells here, anywhere, elsewhere and inactive apart', () => {
    expect(kq.commandAvailability('nav.widgets')).toBe('anywhere');
    expect(kq.commandAvailability('reader.pageNext')).toBe('inactive');
    const surface = document.createElement('div');
    surface.setAttribute('data-command-scope', 'kbd6-test');
    const other = document.createElement('button');
    document.body.append(surface, other);
    const off = ks.registerCommandHandler('reader.pageNext', () => true, { scope: 'kbd6-test' });
    other.focus();
    expect(kq.commandAvailability('reader.pageNext')).toBe('elsewhere');
    const inner = document.createElement('button');
    surface.append(inner);
    inner.focus();
    expect(kq.commandAvailability('reader.pageNext')).toBe('here');
    off();
    const offUnscoped = ks.registerCommandHandler('reader.pageNext', () => true);
    expect(kq.commandAvailability('reader.pageNext')).toBe('here');
    offUnscoped();
  });
});
