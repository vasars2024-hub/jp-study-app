// @vitest-environment jsdom
/**
 * a11y3 — axe-core over the desktop shell: taskbar, Start, a window's chrome,
 * the notification centre and Quick Settings. Zero serious/critical findings.
 *
 * Mounted for real the way a11yShellAudit.test.tsx does it (only the preload
 * bridge is stubbed). Rules that need layout are off; see helpers/axeAudit.ts.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { a11yViolations } from './helpers/axeAudit';

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
  const { notify } = await import('../notificationStore');
  notify({ kind: 'success', title: 'Deck saved', message: 'Five cards added' });
  notify({ kind: 'warning', message: 'Update ready', clientAction: 'restart-to-update' });
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

describe('desktop shell — axe-core', () => {
  it('the whole desktop at rest', async () => {
    expect(await a11yViolations(host)).toEqual([]);
  });

  it('the first Tab stop skips to the taskbar', async () => {
    const desk = host.querySelector('.os-desktop') as HTMLElement;
    const skip = desk.querySelector<HTMLButtonElement>('button.os-skip-link');
    expect(skip, 'skip control').not.toBeNull();
    const first = desk.querySelector('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
    expect(first, 'skip control is the first tab stop').toBe(skip);
    skip?.focus();
    await act(async () => skip?.click());
    expect(document.activeElement?.classList.contains('os-start-btn'), `focus on ${document.activeElement?.className}`).toBe(true);
  });

  it('the Start menu, open', async () => {
    const start = host.querySelector<HTMLElement>('.os-start-btn');
    await act(async () => start?.click());
    await settle(80);
    const menu = host.querySelector('.os-start');
    expect(menu, 'Start open').not.toBeNull();
    expect(await a11yViolations(menu as Element)).toEqual([]);
    await act(async () => {
      (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await settle(80);
  });

  it('a window, its chrome and the taskbar with it open', async () => {
    await act(async () => {
      window.dispatchEvent(new CustomEvent('os:open', { detail: 'stats' }));
    });
    await settle(200);
    const win = host.querySelector<HTMLElement>('.fwin[data-section=stats]');
    expect(win, 'window open').not.toBeNull();
    expect(await a11yViolations(win?.querySelector('.fwin-bar') as Element)).toEqual([]);
    expect(await a11yViolations(host.querySelector('.os-taskbar') as Element)).toEqual([]);
  });

  it('the notification centre with entries', async () => {
    await act(async () => {
      window.dispatchEvent(new CustomEvent('shell:toggleNotifications'));
    });
    await settle(60);
    const panel = document.querySelector('.os-flyout--notifications');
    expect(panel, 'notification centre open').not.toBeNull();
    expect(await a11yViolations(panel as Element)).toEqual([]);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await settle(40);
  });

  it('Quick Settings', async () => {
    await act(async () => {
      window.dispatchEvent(new CustomEvent('shell:toggleQuickSettings'));
    });
    await settle(60);
    const panel = document.querySelector('.os-flyout:not(.os-flyout--notifications), [class*="quick-settings"], [class*="os-qs"]');
    expect(panel, 'Quick Settings open').not.toBeNull();
    expect(await a11yViolations(panel as Element)).toEqual([]);
  });
});
