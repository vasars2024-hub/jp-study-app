// @vitest-environment jsdom
/**
 * The adopted Seanime surface writes 174 `toast.*` calls and, before this host existed,
 * had nowhere for them to land. These cases assert the thing that was actually broken —
 * a message reaching the screen — rather than the presence of a component.
 */
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/client/server-url', () => ({ setSeanimeBaseUrl: vi.fn() }));
vi.mock('@/app/(main)/_atoms/server-status.atoms', () => ({ serverAuthTokenAtom: {} }));
vi.mock('@/app/(main)/_hooks/use-server-status', () => ({ useSetServerStatus: () => vi.fn() }));
vi.mock('jotai', () => ({ useAtomValue: () => 'test-token', useSetAtom: () => vi.fn() }));
vi.mock('../StudyWebsocketProvider', () => ({ default: ({ children }: { children: React.ReactNode }) => children }));

let roots: Root[] = [];

async function mountHost(strict = false): Promise<{ host: HTMLElement; root: Root }> {
  const { default: SeanimeToastHost } = await import('../SeanimeToastHost');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    const component = createElement(SeanimeToastHost);
    root.render(strict ? createElement(StrictMode, null, component) : component);
  });
  return { host, root };
}

/**
 * Count the LAYER, not the list. sonner's `<ol data-sonner-toaster>` is rendered only
 * while at least one toast is live (`if (!filteredToasts.length) return null`), so an
 * idle `<Toaster />` is invisible to that selector and a first draft of this file scored
 * a correct implementation as absent four times. The always-present `<section>` is the
 * mounted-ness fact.
 */
function toasterCount(): number {
  return document.querySelectorAll('section[aria-live="polite"][aria-relevant="additions text"]').length;
}

/** sonner mounts the list, then renders the toast on a later frame. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = '';
});

afterEach(async () => {
  for (const root of roots) {
    await act(async () => root.unmount());
  }
  roots = [];
  const { toast } = await import('sonner');
  toast.dismiss();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('SeanimeToastHost', () => {
  it('makes an adopted toast reach the screen', async () => {
    await mountHost();
    expect(toasterCount()).toBe(1);

    const { toast } = await import('sonner');
    await act(async () => {
      toast.error('Request failed with status code 500');
    });
    await settle();

    expect(document.body.textContent).toContain('Request failed with status code 500');
  });

  it('CONTROL: the same call with no host mounted reaches nothing', async () => {
    // This is the measured state of the app before this file existed. If it ever starts
    // passing text through, the case above is no longer evidence for anything.
    const { toast } = await import('sonner');
    await act(async () => {
      toast.error('Request failed with status code 500');
    });
    await settle();

    expect(toasterCount()).toBe(0);
    expect(document.body.textContent).not.toContain('Request failed with status code 500');
  });

  it('renders exactly one layer when two shells are mounted in one window', async () => {
    // `MediaSurfaceShell`'s header calls two simultaneous shells expected and safe — the
    // workspace overlay and Blanc's toolbox player. Two Toasters would double every
    // message, because both subscribe to the same module-level observer.
    await mountHost();
    await mountHost();
    expect(toasterCount()).toBe(1);

    const { toast } = await import('sonner');
    await act(async () => {
      toast.error('duplicate check');
    });
    await settle();

    expect(document.querySelectorAll('[data-sonner-toast]').length).toBe(1);
  });

  it('hands the layer to the surviving shell when the owner unmounts', async () => {
    const first = await mountHost();
    await mountHost();
    expect(toasterCount()).toBe(1);

    await act(async () => first.root.unmount());
    roots = roots.filter((root) => root !== first.root);

    expect(toasterCount()).toBe(1);

    const { toast } = await import('sonner');
    await act(async () => {
      toast.error('after handover');
    });
    await settle();
    expect(document.body.textContent).toContain('after handover');
  });

  it('preserves the active notification and keyboard focus when a shell closes', async () => {
    const first = await mountHost();
    await mountHost();
    const { toast } = await import('sonner');
    await act(async () => { toast.error('keep this error', { duration: Infinity }); });
    await settle();
    const notification = document.querySelector('[data-sonner-toast]');
    const close = notification?.querySelector<HTMLButtonElement>('[data-close-button]');
    close?.focus();
    expect(document.activeElement).toBe(close);
    await act(async () => first.root.unmount());
    roots = roots.filter((root) => root !== first.root);
    expect(document.body.textContent).toContain('keep this error');
    expect(document.querySelector('[data-sonner-toast]')).toBe(notification);
    expect(document.activeElement).toBe(close);
  });

  it('leaves no layer behind once every shell has unmounted', async () => {
    const only = await mountHost();
    expect(toasterCount()).toBe(1);
    await act(async () => only.root.unmount());
    roots = roots.filter((root) => root !== only.root);
    expect(toasterCount()).toBe(0);
  });

  it('survives StrictMode replay and dismisses the visible error', async () => {
    await mountHost(true);
    const { toast } = await import('sonner');
    await act(async () => { toast.error('dismiss this error', { duration: Infinity }); });
    await settle();
    expect(toasterCount()).toBe(1);
    const close = document.querySelector<HTMLButtonElement>('[data-sonner-toast] [data-close-button]');
    expect(close?.getAttribute('aria-label')).toBe('Close');
    await act(async () => { close?.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 250)); });
    expect(document.body.textContent).not.toContain('dismiss this error');
  });

  /*
   * Boss audit F2. The layer is a React root on `document.body`, created outside
   * the app tree and therefore outside `AppErrorBoundary` — a throw inside it was
   * supervised by nothing. The assertion that matters is not "the layer is gone",
   * it is that the SHELL which mounted it is still on screen and still working.
   */
  it('a crash inside the notification layer leaves the shell that mounted it alive', async () => {
    const logRendererError = vi.fn().mockResolvedValue(undefined);
    (window as unknown as { api?: unknown }).api = { logRendererError };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.resetModules();
    vi.doMock('sonner', () => ({
      Toaster: () => {
        throw new Error('notification layer exploded');
      },
      toast: { dismiss: () => undefined, error: () => undefined },
    }));
    try {
      const { default: SeanimeToastHost } = await import('../SeanimeToastHost');
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      roots.push(root);
      await act(async () => {
        root.render(createElement('div', null, 'shell content', createElement(SeanimeToastHost)));
      });

      // The shell rendered and stayed rendered.
      expect(host.textContent).toContain('shell content');
      // No crash screen was mounted over it: `AppErrorBoundary`'s full-viewport
      // recovery page is the wrong shape for a notification layer, so the layer
      // renders nothing at all instead.
      expect(document.querySelector('[data-media-notifications]')?.innerHTML).toBe('');
      expect(toasterCount()).toBe(0);
      // The host element survives, so the release path can still remove it.
      expect(document.querySelectorAll('[data-media-notifications]').length).toBe(1);
      // Honest failure: it is recorded rather than swallowed.
      expect(logRendererError).toHaveBeenCalledTimes(1);
      expect(logRendererError.mock.calls[0][0]).toMatchObject({
        subsystem: 'renderer',
        operation: 'mediaNotificationLayer',
      });
      expect(String(logRendererError.mock.calls[0][0].detail)).toContain(
        'notification layer exploded',
      );
    } finally {
      vi.doUnmock('sonner');
      vi.resetModules();
      consoleError.mockRestore();
      delete (window as unknown as { api?: unknown }).api;
    }
  });

  it('keeps one notification layer in the real shell when both sidecars are offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline test')));
    const { default: Shell } = await import('../MediaSurfaceShell');
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    const conn = { baseUrl: 'http://127.0.0.1:4321', token: 'test-token' };
    await act(async () => {
      root.render(createElement('div', null,
        createElement(Shell, { conn, surface: 'workspace', children: 'library' }),
        createElement(Shell, { conn, surface: 'player', children: 'player' }),
      ));
    });
    expect(host.textContent).toContain('offline test');
    expect(toasterCount()).toBe(1);
    const { toast } = await import('sonner');
    await act(async () => { toast.error('server mutation failed'); });
    await settle();
    expect(document.body.textContent).toContain('server mutation failed');
    expect(host.textContent).not.toContain('server mutation failed');
  });
});
