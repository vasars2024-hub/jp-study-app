/**
 * Shared mounting harness for the a11y3 axe suites. Every `a11yAxe*.test.tsx`
 * mounts a real surface into jsdom with the preload bridge stubbed, waits for
 * its async first paint, and runs `axeViolations` on it. This file holds the
 * parts they all repeat: jsdom shims, a bridge stub, mount/unmount, settle.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const none = (): void => undefined;

/** Browser APIs jsdom lacks and the app touches during first paint. */
export function installJsdomShims(): void {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: none, removeEventListener: none, addListener: none, removeListener: none,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  const g = globalThis as Record<string, unknown>;
  g.ResizeObserver ??= class { observe = none; unobserve = none; disconnect = none; };
  g.IntersectionObserver ??= class {
    observe = none; unobserve = none; disconnect = none;
    takeRecords = (): unknown[] => [];
  };
  Element.prototype.scrollIntoView ??= (): undefined => undefined;
  Element.prototype.scrollTo ??= (): undefined => undefined;
  window.scrollTo = (() => undefined) as typeof window.scrollTo;
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
  HTMLMediaElement.prototype.pause = (): undefined => undefined;
  HTMLMediaElement.prototype.load = (): undefined => undefined;
  HTMLMediaElement.prototype.play = () => Promise.resolve();
}

const PENDING = Symbol('pending');

/**
 * A preload bridge that answers every call. Named shapes win; `on*` returns an
 * unsubscribe; a `list*` call resolves to `[]`; anything else never settles by
 * default, so a component keeps its own initial state, as it would while the
 * main process is still busy, instead of crashing on a `null` no real handler
 * returns. Pass a `fallback` value to resolve instead.
 */
export function stubBridge(shapes: Record<string, unknown> = {}, fallback: unknown = PENDING): void {
  const api = new Proxy({}, {
    get: (_t, prop) => {
      if (typeof prop !== 'string') return undefined;
      if (prop in shapes) {
        const v = shapes[prop];
        return typeof v === 'function' ? v : () => Promise.resolve(v);
      }
      if (/^on[A-Z]/.test(prop)) return () => () => undefined;
      // `listLibrary`, `dictListSources`: a list call answers a list. (`watchList`
      // and `assetsList` answer envelopes, so they are not matched; name them.)
      if (/^list[A-Z]|^[a-z]+List[A-Z]/.test(prop)) return () => Promise.resolve([]);
      return () => (fallback === PENDING ? new Promise(() => undefined) : Promise.resolve(fallback));
    },
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
}

/**
 * A lean bridge: only the named bindings exist, so optional panels that check
 * `typeof window.api.x === 'function'` stay absent, as in a minimal preload.
 */
export function leanBridge(shapes: Record<string, unknown>): void {
  const api: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(shapes)) {
    api[k] = typeof v === 'function' ? v : /^on[A-Z]/.test(k) ? () => () => undefined : () => Promise.resolve(v);
  }
  // Module-level subscribers (playerBus, settings sync) run at import time and
  // assume their bindings exist; give every `on*` and `player*` a no-op.
  const lean = new Proxy(api, {
    get: (t, prop) => {
      if (typeof prop !== 'string') return undefined;
      if (prop in t) return t[prop];
      if (/^on[A-Z]/.test(prop)) return () => () => undefined;
      if (/^player[A-Z]/.test(prop)) return () => Promise.resolve(null);
      return undefined;
    },
  });
  Object.defineProperty(window, 'api', { value: lean, configurable: true, writable: true });
}

export interface Mounted {
  host: HTMLDivElement;
  unmount: () => Promise<void>;
}

let current: Root | null = null;

export async function settle(ms = 30): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

export async function mount(node: ReactNode, ms = 30): Promise<Mounted> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  current = root;
  await act(async () => {
    root.render(node);
  });
  await settle(ms);
  return {
    host,
    unmount: async () => {
      await act(async () => root.unmount());
      if (current === root) current = null;
      host.remove();
    },
  };
}

/** Unmount whatever `mount` left and empty <body> (portals included). */
export async function cleanup(): Promise<void> {
  if (current) {
    const r = current;
    current = null;
    await act(async () => r.unmount());
  }
  document.body.replaceChildren();
}

/** Click and let React commit. */
export async function click(el: Element | null | undefined): Promise<void> {
  if (!el) throw new Error('click: element missing');
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle(10);
}

/** Find a button by visible text or accessible name (regex). */
export function button(root: ParentNode, name: RegExp): HTMLButtonElement | undefined {
  return [...root.querySelectorAll<HTMLButtonElement>('button, [role="button"], [role="tab"]')].find((b) =>
    name.test(`${b.getAttribute('aria-label') ?? ''} ${b.textContent ?? ''}`),
  );
}

/** Set a React-controlled input's value. */
export async function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  await act(async () => {
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle(10);
}
