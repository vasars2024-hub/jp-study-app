// @vitest-environment jsdom
/**
 * An unmounted desktop must be garbage, and a closed window must reopen in the desktop the
 * user is looking at.
 *
 * Opening a book unmounts the whole `DesktopShell` (App renders the reader instead) and the
 * reader's Library button mounts a new one. Every window close pushed a "reopen" entry onto
 * the module-level undo stack (`actionHistory.ts`, 40 entries) whose closure was created
 * inside the shell's render, and a V8 closure keeps its enclosing scope, so each entry kept
 * the dead shell, its desk element and every window it had open. Measured on the packaged
 * build (2026-09-26, `longsession.mjs L3`, forced GC before each sample): +3,947 detached DOM
 * nodes and +707 JS listeners per book opened, retainer path
 * `undo stack -> undo closure -> DesktopShell context -> winOpeners Map -> old desktop`.
 * The same entry called the dead shell's `open`, so Ctrl+Shift+Z after reading did nothing.
 *
 * Driven with the real `DesktopShell`, the real undo stack and a real GC
 * (`--expose-gc` switched on at runtime). Only the preload bridge is stubbed.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc') as () => void;

type Tracked = { target: string; type: string; fn: unknown; capture: boolean };
const live = new Set<Tracked>();
let tracking = false;

/** Record every window/document listener added while `tracking`, and drop it when it is removed. */
function trackListeners(target: EventTarget, name: string): void {
  const add = target.addEventListener.bind(target);
  const remove = target.removeEventListener.bind(target);
  target.addEventListener = (type: string, fn: EventListenerOrEventListenerObject | null, opts?: boolean | AddEventListenerOptions) => {
    if (tracking && fn) {
      const entry = { target: name, type, fn, capture: typeof opts === 'boolean' ? opts : !!opts?.capture };
      live.add(entry);
      if (typeof opts === 'object') opts.signal?.addEventListener('abort', () => live.delete(entry));
    }
    add(type, fn, opts);
  };
  target.removeEventListener = (type: string, fn: EventListenerOrEventListenerObject | null, opts?: boolean | EventListenerOptions) => {
    const capture = typeof opts === 'boolean' ? opts : !!opts?.capture;
    for (const entry of live) {
      if (entry.target === name && entry.type === type && entry.fn === fn && entry.capture === capture) {
        live.delete(entry);
        break;
      }
    }
    remove(type, fn, opts);
  };
}

/** Every bridge call resolves; the few whose answer is read without a guard get a usable shape. */
function stubBridge(): void {
  const answers: Record<string, unknown> = {
    displayList: [],
    popoutListOpen: [],
    deskwinWhoAmI: {},
    desktopCommitLayout: { ok: true },
  };
  const call = (name: string) => () => {
    const p = Promise.resolve(answers[name]);
    // Callable as well as awaitable: `on*` subscriptions return their unsubscribe function.
    return Object.assign(() => undefined, { then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p) });
  };
  (window as unknown as { api: unknown }).api = new Proxy({}, { get: (_t, key) => call(String(key)) });
}

type Shell = { host: HTMLElement; root: Root };
let DesktopShell: (props: { onOpenBook: () => void }) => ReactNode;
let actionHistory: typeof import('../actionHistory');
const mounted: Shell[] = [];

const settle = async (ms = 30): Promise<void> => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

async function mountShell(): Promise<Shell> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<DesktopShell onOpenBook={() => undefined} />);
  });
  await settle();
  const shell = { host, root };
  mounted.push(shell);
  return shell;
}

async function unmountShell(shell: Shell): Promise<void> {
  await act(async () => {
    shell.root.unmount();
  });
  shell.host.remove();
  mounted.splice(mounted.indexOf(shell), 1);
}

async function openAndClose(shell: Shell, section: string): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new CustomEvent('os:open', { detail: section }));
  });
  await settle(100);
  const close = shell.host.querySelector<HTMLElement>(`.fwin[data-section=${section}] .fwin-close`);
  expect(close).not.toBe(null);
  await act(async () => {
    close?.click();
  });
  // The reopen entry is pushed after a dynamic import resolves.
  await settle(200);
}

const sections = (shell: Shell): string[] =>
  Array.from(shell.host.querySelectorAll<HTMLElement>('.fwin')).map((w) => w.dataset.section ?? '');

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  stubBridge();
  const none = (): void => undefined;
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: none, removeEventListener: none, addListener: none, removeListener: none,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  (globalThis as Record<string, unknown>).ResizeObserver ??= class {
    observe = none;
    unobserve = none;
    disconnect = none;
  };
  trackListeners(window, 'window');
  trackListeners(document, 'document');
  DesktopShell = (await import('../components/DesktopShell')).default;
  actionHistory = await import('../actionHistory');
  // One throwaway mount so module-level singletons exist before anything is measured.
  await unmountShell(await mountShell());
}, 180_000);

afterEach(async () => {
  tracking = false;
  live.clear();
  for (const shell of [...mounted]) await unmountShell(shell);
  actionHistory.clearUndoStack();
});

describe('DesktopShell unmount', () => {
  it('leaves no window or document listener behind', { timeout: 60_000 }, async () => {
    tracking = true;
    const shell = await mountShell();
    await openAndClose(shell, 'dictionary');
    await unmountShell(shell);
    tracking = false;
    expect([...live].map((l) => `${l.target}:${l.type}`)).toEqual([]);
  });

  it('is collectable once a book was read (its reopen entries do not pin it)', { timeout: 60_000 }, async () => {
    const before = await mountShell();
    // Never held in a local: an async function keeps its locals alive across every await.
    const startButton = new WeakRef(before.host.querySelector('.os-start-btn') as Element);
    expect(startButton.deref()).toBeTruthy();
    await openAndClose(before, 'stats');
    expect(actionHistory.canUndo()).toBe(true);
    // The book's window is still open when the book is opened, and it was opened from the
    // Start button: the shell remembers that button as the window's focus opener.
    before.host.querySelector<HTMLElement>('.os-start-btn')?.focus();
    await act(async () => {
      window.dispatchEvent(new CustomEvent('os:open', { detail: 'dictionary' }));
    });
    await settle(100);
    // Reading a book: the desktop unmounts, the reader's Library button mounts a new one,
    // and the user carries on there. Carrying on also moves jsdom's own one-slot caches
    // (the selector engine's last context and last focus event) off the dead shell;
    // Chromium has neither.
    await unmountShell(before);
    const after = await mountShell();
    await openAndClose(after, 'dictionary');
    await openAndClose(after, 'stats');
    // No `deref()` inside this loop: a WeakRef read keeps its target alive until the job ends.
    for (let i = 0; i < 4; i += 1) {
      gc();
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(startButton.deref()).toBeUndefined();
    // The entries themselves are kept: dropping them was never the fix.
    expect(actionHistory.canUndo()).toBe(true);
  });

  it('reopens a window closed before a book was read in the desktop mounted after it', { timeout: 60_000 }, async () => {
    const before = await mountShell();
    await openAndClose(before, 'dictionary');
    // Reading a book: the desktop unmounts, the reader's Library button mounts a new one.
    await unmountShell(before);
    const after = await mountShell();
    expect(sections(after)).toEqual([]);
    await act(async () => {
      await actionHistory.performUndo();
    });
    await settle(100);
    expect(sections(after)).toEqual(['dictionary']);
  });
});
