// @vitest-environment jsdom
/**
 * M14 — notification store and i18n integration tests.
 *
 * Covers the gaps the milestone targeted: DND suppression of both sound and
 * badge, history cap at 100, client-id dedup/replace, silent entries, toast
 * capture, and the i18n keys introduced for time-ago and Blanc panel strings.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOGS, en } from '../../shared/i18n/catalogs/all';
import { translate, type UiLang } from '../../shared/i18n/core';

const SOUND_EVENT = 'shell:notification';

// Fresh-import notificationStore per test to reset module state.
async function loadStore() {
  // Clear module cache so each test gets a fresh store.
  const mod = '../../renderer/notificationStore';
  vi.resetModules();
  return await import(mod);
}

function mockStorage() {
  const data = new Map<string, string>();
  const storage: Storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    clear: () => data.clear(),
    get length() { return data.size; },
    key: (i) => [...data.keys()][i] ?? null,
  };
  Object.defineProperty(window, 'localStorage', { value: storage, writable: true });
}

beforeEach(() => {
  mockStorage();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('notificationStore: history cap', () => {
  it('caps history at 100 items, dropping oldest', async () => {
    const store = await loadStore();
    store.installNotificationCapture();
    for (let i = 0; i < 110; i++) {
      store.notify({ message: `msg-${i}` });
    }
    const items = store.getNotifications();
    expect(items.length).toBe(100);
    // Newest first: msg-109 should be first, msg-10 should be last.
    expect(items[0].message).toBe('msg-109');
    expect(items[99].message).toBe('msg-10');
  });
});

describe('notificationStore: client-id dedup', () => {
  it('replaces an earlier notice with the same clientId', async () => {
    const store = await loadStore();
    store.installNotificationCapture();
    store.notify({ message: 'v1', id: 'update-check' });
    store.notify({ message: 'v2', id: 'update-check' });
    const items = store.getNotifications();
    expect(items.length).toBe(1);
    expect(items[0].message).toBe('v2');
    expect(items[0].clientId).toBe('update-check');
  });

  it('does not affect notices with different clientIds', async () => {
    const store = await loadStore();
    store.installNotificationCapture();
    store.notify({ message: 'a', id: 'alpha' });
    store.notify({ message: 'b', id: 'beta' });
    expect(store.getNotifications().length).toBe(2);
  });
});

describe('notificationStore: DND', () => {
  it('suppresses sound dispatch when DND is on', async () => {
    const store = await loadStore();
    store.installNotificationCapture();
    store.setDnd(true);
    expect(store.isDnd()).toBe(true);

    let soundFired = false;
    window.addEventListener(SOUND_EVENT, () => { soundFired = true; }, { once: true });
    store.notify({ message: 'hello' });
    expect(soundFired).toBe(false);
  });

  it('still records in history when DND is on', async () => {
    const store = await loadStore();
    store.installNotificationCapture();
    store.setDnd(true);
    store.notify({ message: 'silent-but-stored' });
    const items = store.getNotifications();
    expect(items.length).toBe(1);
    expect(items[0].message).toBe('silent-but-stored');
    expect(items[0].read).toBe(false); // Not silent, just DND
  });

  it('dispatches sound when DND is off', async () => {
    const store = await loadStore();
    store.installNotificationCapture();
    store.setDnd(false);

    let soundFired = false;
    window.addEventListener(SOUND_EVENT, () => { soundFired = true; }, { once: true });
    store.notify({ message: 'audible' });
    expect(soundFired).toBe(true);
  });
});

describe('notificationStore: silent entries', () => {
  it('marks silent entries as already-read and skips sound', async () => {
    const store = await loadStore();
    store.installNotificationCapture();

    let soundFired = false;
    window.addEventListener(SOUND_EVENT, () => { soundFired = true; }, { once: true });
    store.notify({ message: 'log-only', silent: true });

    const items = store.getNotifications();
    expect(items.length).toBe(1);
    expect(items[0].read).toBe(true);
    expect(soundFired).toBe(false);
  });
});

describe('notificationStore: clear and dismiss', () => {
  it('dismiss removes a single item by id', async () => {
    const store = await loadStore();
    store.installNotificationCapture();
    const a = store.notify({ message: 'a' });
    store.notify({ message: 'b' });
    expect(store.getNotifications().length).toBe(2);
    store.dismiss(a.id);
    expect(store.getNotifications().length).toBe(1);
    expect(store.getNotifications()[0].message).toBe('b');
  });

  it('clearAll empties the list', async () => {
    const store = await loadStore();
    store.installNotificationCapture();
    store.notify({ message: 'x' });
    store.notify({ message: 'y' });
    store.clearAll();
    expect(store.getNotifications().length).toBe(0);
  });

  it('markAllRead marks unread items as read', async () => {
    const store = await loadStore();
    store.installNotificationCapture();
    store.notify({ message: 'unread1' });
    store.notify({ message: 'unread2' });
    expect(store.unreadCount()).toBe(2);
    store.markAllRead();
    expect(store.unreadCount()).toBe(0);
  });

  it('markAllRead is a no-op when everything is already read', async () => {
    const store = await loadStore();
    store.installNotificationCapture();
    store.notify({ message: 'silent', silent: true });
    expect(store.unreadCount()).toBe(0);
    store.markAllRead(); // Should not trigger a change event
    expect(store.unreadCount()).toBe(0);
  });
});

describe('notificationStore: toast capture', () => {
  it('captures os:toast events into history', async () => {
    const store = await loadStore();
    store.installNotificationCapture();
    window.dispatchEvent(
      new CustomEvent('os:toast', { detail: { message: 'captured toast', kind: 'ok' } })
    );
    const items = store.getNotifications();
    expect(items.length).toBe(1);
    expect(items[0].message).toBe('captured toast');
    expect(items[0].kind).toBe('success');
  });

  it('captures ui:toast events with title into history', async () => {
    const store = await loadStore();
    store.installNotificationCapture();
    window.dispatchEvent(
      new CustomEvent('ui:toast', { detail: { title: 'Update', message: 'New version', kind: 'info' } })
    );
    const items = store.getNotifications();
    expect(items.length).toBe(1);
    expect(items[0].title).toBe('Update');
    expect(items[0].message).toBe('New version');
    expect(items[0].kind).toBe('info');
  });

  it('skips ui:toast with non-string message (ReactNode)', async () => {
    const store = await loadStore();
    store.installNotificationCapture();
    window.dispatchEvent(
      new CustomEvent('ui:toast', { detail: { message: { react: true } } })
    );
    expect(store.getNotifications().length).toBe(0);
  });

  it('normalizes kind aliases', async () => {
    const store = await loadStore();
    store.installNotificationCapture();
    window.dispatchEvent(new CustomEvent('os:toast', { detail: { message: 'warn', kind: 'warn' } }));
    window.dispatchEvent(new CustomEvent('os:toast', { detail: { message: 'err', kind: 'err' } }));
    const items = store.getNotifications();
    expect(items.find((n: { message: string }) => n.message === 'warn')?.kind).toBe('warning');
    expect(items.find((n: { message: string }) => n.message === 'err')?.kind).toBe('error');
  });
});

describe('notificationStore: persistence', () => {
  it('persists to localStorage under the expected key', async () => {
    const store = await loadStore();
    store.installNotificationCapture();
    store.notify({ message: 'persist-me' });

    // Verify the data is in localStorage (the store reads from it on load).
    const raw = localStorage.getItem('jp-os-notifications-v1');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].message).toBe('persist-me');
  });
});

describe('i18n: notification time keys resolve in all languages', () => {
  const t = (key: string, lang: UiLang, vars?: Record<string, string | number>) =>
    translate(key, vars, { lang, catalog: CATALOGS[lang], fallback: en });

  it('notifications.time.justNow resolves in all languages', () => {
    expect(t('notifications.time.justNow', 'en')).toBe('just now');
    expect(t('notifications.time.justNow', 'ja')).toBe('たった今');
    expect(t('notifications.time.justNow', 'zh')).toBe('刚刚');
    expect(t('notifications.time.justNow', 'ru')).toBe('только что');
  });

  it('notifications.time.minutes uses count correctly', () => {
    expect(t('notifications.time.minutes', 'en', { count: 5 })).toBe('5m ago');
    expect(t('notifications.time.minutes', 'ja', { count: 5 })).toBe('5分前');
    expect(t('notifications.time.minutes', 'zh', { count: 5 })).toBe('5分钟前');
  });

  it('notifications.time.minutes Russian plural: one/few/many', () => {
    const ru = (n: number) => t('notifications.time.minutes', 'ru', { count: n });
    expect(ru(1)).toContain('минуту');
    expect(ru(3)).toContain('минуты');
    expect(ru(5)).toContain('минут');
    expect(ru(21)).toContain('минуту');
  });

  it('notifications.time.hours resolves with count', () => {
    expect(t('notifications.time.hours', 'en', { count: 3 })).toBe('3h ago');
    expect(t('notifications.time.hours', 'ru', { count: 1 })).toContain('час');
    expect(t('notifications.time.hours', 'ru', { count: 5 })).toContain('часов');
  });

  it('notifications.time.days resolves with count', () => {
    expect(t('notifications.time.days', 'en', { count: 7 })).toBe('7d ago');
    expect(t('notifications.time.days', 'ru', { count: 1 })).toContain('день');
    expect(t('notifications.time.days', 'ru', { count: 5 })).toContain('дней');
  });
});

describe('i18n: Blanc notification panel keys resolve in all languages', () => {
  const t = (key: string, lang: UiLang, vars?: Record<string, string | number>) =>
    translate(key, vars, { lang, catalog: CATALOGS[lang], fallback: en });

  it('notifications.blanc.title', () => {
    expect(t('notifications.blanc.title', 'en')).toBe('Task Center');
    expect(t('notifications.blanc.title', 'ja')).toBe('タスクセンター');
    expect(t('notifications.blanc.title', 'zh')).toBe('任务中心');
    expect(t('notifications.blanc.title', 'ru')).toBe('Центр задач');
  });

  it('notifications.blanc.entries with plural count', () => {
    expect(t('notifications.blanc.entries', 'en', { count: 1 })).toBe('1 entry');
    expect(t('notifications.blanc.entries', 'en', { count: 5 })).toBe('5 entries');
    expect(t('notifications.blanc.entries', 'ru', { count: 1 })).toContain('запись');
    expect(t('notifications.blanc.entries', 'ru', { count: 3 })).toContain('записи');
    expect(t('notifications.blanc.entries', 'ru', { count: 5 })).toContain('записей');
  });

  it('notifications.blanc.when and .message', () => {
    expect(t('notifications.blanc.when', 'en')).toBe('When');
    expect(t('notifications.blanc.message', 'en')).toBe('Message');
    expect(t('notifications.blanc.when', 'ja')).toBe('日時');
    expect(t('notifications.blanc.message', 'ja')).toBe('メッセージ');
  });

  it('notifications.clearAll and notifications.dismiss in all languages', () => {
    for (const lang of ['en', 'ja', 'zh', 'ru'] as UiLang[]) {
      expect(t('notifications.clearAll', lang)).toBeTruthy();
      expect(t('notifications.dismiss', lang)).toBeTruthy();
      expect(t('notifications.clearAll', lang)).not.toBe('{notifications.clearAll}');
      expect(t('notifications.dismiss', lang)).not.toBe('{notifications.dismiss}');
    }
  });
});
