// @vitest-environment jsdom
/**
 * a11y2 — the desktop shell under the ARIA contract audit, plus its keyboard
 * focus order: taskbar, Start, and a window.
 *
 * Mounted for real (only the preload bridge is stubbed), the way
 * desktopShellUnmountRetention.test.tsx does it.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditAria, tabOrder, type AriaFinding } from './helpers/ariaAudit';

function stubBridge(): void {
  const answers: Record<string, unknown> = {
    displayList: [],
    popoutListOpen: [],
    deskwinWhoAmI: {},
    desktopCommitLayout: { ok: true },
  };
  const call = (name: string) => () => {
    const p = Promise.resolve(answers[name]);
    return Object.assign(() => undefined, { then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p) });
  };
  (window as unknown as { api: unknown }).api = new Proxy({}, { get: (_t, key) => call(String(key)) });
}

let host: HTMLElement;
let root: Root;

const settle = async (ms = 50): Promise<void> => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

const fmt = (findings: AriaFinding[]): string[] => findings.map((f) => `${f.rule}: ${f.where}${f.detail ? ` (${f.detail})` : ''}`);

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
  Element.prototype.scrollIntoView ??= (): undefined => undefined;
  const DesktopShell = (await import('../components/DesktopShell')).default as (p: { onOpenBook: () => void }) => ReactNode;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<DesktopShell onOpenBook={() => undefined} />);
  });
  await settle(100);
}, 180_000);

afterAll(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('desktop shell — ARIA contract', () => {
  it('the taskbar has no ARIA contract violations', () => {
    const taskbar = host.querySelector('.os-taskbar');
    expect(taskbar, 'taskbar rendered').not.toBeNull();
    expect(fmt(auditAria(taskbar as HTMLElement))).toEqual([]);
  });

  it('the taskbar is a named landmark whose tab order starts at Start', () => {
    const taskbar = host.querySelector('.os-taskbar') as HTMLElement;
    const order = tabOrder(taskbar);
    expect(order.length).toBeGreaterThan(2);
    expect(order[0].classList.contains('os-start-btn'), `first stop is ${order[0].className}`).toBe(true);
    const named = taskbar.getAttribute('aria-label') || taskbar.getAttribute('aria-labelledby');
    const landmark = taskbar.getAttribute('role') ?? (taskbar.tagName === 'NAV' || taskbar.tagName === 'FOOTER' ? taskbar.tagName : null);
    expect(landmark, 'taskbar exposes a landmark role').toBeTruthy();
    expect(named, 'taskbar is named').toBeTruthy();
  });

  it('Start opens with focus inside, audits clean, and Escape returns focus to the button', async () => {
    const start = host.querySelector<HTMLElement>('.os-start-btn');
    expect(start).not.toBeNull();
    start?.focus();
    await act(async () => start?.click());
    await settle(80);
    const menu = host.querySelector('.os-start');
    expect(menu, 'Start panel open').not.toBeNull();
    expect(start?.getAttribute('aria-expanded')).toBe('true');
    expect(fmt(auditAria(menu as HTMLElement))).toEqual([]);
    expect(menu?.contains(document.activeElement), `focus is in Start (${document.activeElement?.className})`).toBe(true);

    await act(async () => {
      (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await settle(80);
    expect(host.querySelector('.os-start')).toBeNull();
    expect(document.activeElement).toBe(start);
  });

  it('an open window is named, its title-bar buttons are named, and it audits clean', async () => {
    await act(async () => {
      window.dispatchEvent(new CustomEvent('os:open', { detail: 'stats' }));
    });
    await settle(200);
    const win = host.querySelector<HTMLElement>('.fwin[data-section=stats]');
    expect(win, 'window open').not.toBeNull();
    const bar = win?.querySelector('.fwin-bar') as HTMLElement;
    expect(fmt(auditAria(bar))).toEqual([]);
    const named = win?.getAttribute('aria-label') || win?.getAttribute('aria-labelledby');
    expect(named, 'window has an accessible name').toBeTruthy();
    expect(['dialog', 'region', 'application', 'group']).toContain(win?.getAttribute('role'));
  });
});
