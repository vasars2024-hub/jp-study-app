// @vitest-environment jsdom
/**
 * The boot sync of system-wide shortcuts (`syncGlobalCommands`) when Windows
 * refuses the chords — another program, or a second Gum, already holds them.
 *
 * Measured before this fix: one `os:toast` PER refused command (seven on a fresh
 * launch), composed before the UI catalog had loaded (English in a Russian UI),
 * stored in the Notification Center as frozen English, and posted again on every
 * launch for the same unchanged set.
 *
 * Each "launch" below is a fresh module graph over the same localStorage, which
 * is what a relaunch is to the renderer.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Mode = 'in-use' | 'mixed' | 'ok';
const state = vi.hoisted(() => ({ mode: 'in-use' as 'in-use' | 'mixed' | 'ok' }));

vi.hoisted(() => {
  const api = new Proxy({} as Record<string, unknown>, {
    get: (_target, prop) => {
      if (prop === 'globalCommandsSync') {
        return (chords: Record<string, string>) =>
          Promise.resolve(
            Object.keys(chords).map((id, i) => ({
              id,
              chord: chords[id],
              accelerator: null,
              registered: state.mode === 'ok',
              available: true,
              hasHandler: true,
              ...(state.mode === 'ok' ? {} : { error: state.mode === 'mixed' && i === 0 ? 'failed' : 'in-use' }),
            })),
          );
      }
      if (prop === 'globalCommandsLegacyChords') return () => Promise.resolve({});
      return typeof prop === 'string' && prop.startsWith('on') ? () => () => undefined : () => Promise.resolve(null);
    },
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
});

interface ToastDetail {
  message: string;
  kind: string;
  record?: boolean;
  action?: { label: string; run: () => void };
}

let toasts: ToastDetail[] = [];
const onToast = (e: Event): void => {
  toasts.push((e as CustomEvent<ToastDetail>).detail);
};

beforeEach(() => {
  toasts = [];
  window.addEventListener('os:toast', onToast);
});
afterEach(() => {
  window.removeEventListener('os:toast', onToast);
});

/** One renderer boot: fresh modules, same profile. Resolves once its sync has settled. */
async function launch(mode: Mode) {
  state.mode = mode;
  vi.resetModules();
  const shortcuts = await import('../keyboardShortcuts');
  const store = await import('../notificationStore');
  await shortcuts.syncGlobalCommands(true);
  // The module's own boot sync (setTimeout 0) must not add a second notice.
  await new Promise((r) => setTimeout(r, 30));
  return { shortcuts, store };
}

describe('global shortcuts Windows refused: one notice per sync', () => {
  it('a boot where every chord is taken posts ONE translated notice with an Open Shortcuts action', async () => {
    localStorage.clear();
    localStorage.setItem('ui-lang', 'ru');
    const { shortcuts, store } = await launch('in-use');
    const refused = Object.keys(shortcuts.collectGlobalChords()).length;
    expect(refused).toBeGreaterThan(1);

    expect(toasts).toHaveLength(1);
    const [toast] = toasts;
    // Russian, composed after the catalog loaded, with the count.
    expect(toast?.message).toMatch(/^Не удалось зарегистрировать \d+ сочетани/);
    expect(toast?.message).toContain(String(refused));
    expect(toast?.message).toContain('другое приложение');
    expect(toast?.action?.label).toBe('Открыть горячие клавиши');
    expect(toast?.record).toBe(false);

    const items = store.getNotifications();
    expect(items).toHaveLength(1);
    expect(items[0]?.clientAction).toBe('open-shortcuts');
    expect(items[0]?.i18n).toEqual({ message: 'shortcut.notice.refused.inUse', vars: { count: refused } });
  });

  it('the next launch with the same refused set says nothing', async () => {
    const { store } = await launch('in-use');
    expect(toasts).toHaveLength(0);
    // The earlier entry is still in the center; no duplicate was added.
    expect(store.getNotifications()).toHaveLength(1);
  });

  it('a changed set is news again, and names the mixed reason honestly', async () => {
    localStorage.setItem('ui-lang', 'en');
    const { store } = await launch('mixed');
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.message).toMatch(/shortcuts couldn't be registered\. Open Shortcuts to see why\.$/);
    // Replaced by id, not stacked.
    expect(store.getNotifications()).toHaveLength(1);
  });

  it('once everything registers the memory clears, so a later refusal is reported', async () => {
    await launch('ok');
    expect(toasts).toHaveLength(0);
    await launch('in-use');
    expect(toasts).toHaveLength(1);
  });

  it('the toast bus does not record a second, frozen copy in the center', async () => {
    localStorage.clear();
    state.mode = 'in-use';
    vi.resetModules();
    const store = await import('../notificationStore');
    store.installNotificationCapture();
    const shortcuts = await import('../keyboardShortcuts');
    await shortcuts.syncGlobalCommands(true);
    await new Promise((r) => setTimeout(r, 30));
    expect(toasts).toHaveLength(1);
    expect(store.getNotifications()).toHaveLength(1);
  });
});

describe('Notification Center re-translates a keyed notice', () => {
  it('shows the live language after a switch, not the language it was posted in', async () => {
    localStorage.clear();
    localStorage.setItem('ui-lang', 'en');
    vi.resetModules();
    const { ensureCatalog } = await import('../../shared/i18n/catalogs');
    const i18n = await import('../i18n');
    const store = await import('../notificationStore');
    const { default: NotificationCenter } = await import('../components/shell/NotificationCenter');
    await ensureCatalog('en');
    await ensureCatalog('ja');
    store.notify({
      id: 'global-shortcuts-refused',
      message: i18n.t('shortcut.notice.refused.inUse', { count: 3 }),
      i18n: { message: 'shortcut.notice.refused.inUse', vars: { count: 3 } },
      kind: 'warning',
      clientAction: 'open-shortcuts',
    });
    const mount = document.createElement('div');
    document.body.append(mount);
    const root = createRoot(mount);
    await act(async () => root.render(<NotificationCenter />));
    await act(async () => {
      window.dispatchEvent(new CustomEvent('shell:toggleNotifications'));
    });
    expect(document.body.textContent).toContain("3 shortcuts couldn't be registered");
    expect(document.body.textContent).toContain('Open Shortcuts');

    i18n.setUiLang('ja');
    await act(async () => {
      await ensureCatalog('ja');
    });
    expect(document.body.textContent).toContain('3 件のショートカットを登録できませんでした');
    expect(document.body.textContent).toContain('ショートカットを開く');
    expect(document.body.textContent).not.toContain("couldn't be registered");
    act(() => root.unmount());
    mount.remove();
  });
});

