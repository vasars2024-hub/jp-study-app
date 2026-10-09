// @vitest-environment jsdom
/**
 * shell2 — notification center grouping and timed Do not disturb, DND holding
 * back pop-ups, taskbar overflow arithmetic, the panel commands, the title-bar
 * menu and the resize refit, and the empty desk's one-line way in.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as store from '../notificationStore';
import { bucketOf, groupNotifications, sameNotice } from '../components/shell/notificationGroups';
import { revealScrollDelta, wheelScrollDelta } from '../components/shell/taskbarOverflow';
import ToastHost from '../components/ToastHost';
import NotificationCenter from '../components/shell/NotificationCenter';
import StartHereCard, { START_HERE_DISMISSED_KEY } from '../components/shell/StartHereCard';
import { COMMAND_CATALOG, runCommand } from '../keyboardShortcuts';
import { markTourComplete } from '../onboardingStore';
import { CATALOGS } from '../../shared/i18n/catalogs/all';

const SHELL = readFileSync(resolve(__dirname, '..', 'components', 'DesktopShell.tsx'), 'utf8');

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  localStorage.clear();
  store.clearAll();
  store.setDnd(false);
});

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
});

async function render(node: React.ReactNode): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
  return host;
}

const notice = (over: Partial<store.ShellNotification>): store.ShellNotification => ({
  id: 1,
  message: 'Synced',
  kind: 'default',
  ts: Date.now(),
  read: false,
  ...over,
});

describe('timed Do not disturb', () => {
  it('is on until its end, then off by itself', () => {
    const now = Date.parse('2026-10-08T10:00:00');
    store.setDndFor(60 * 60 * 1000, now);
    expect(store.isDnd(now + 1000)).toBe(true);
    expect(store.dndUntil(now + 1000)).toBe(now + 60 * 60 * 1000);
    expect(store.isDnd(now + 61 * 60 * 1000)).toBe(false);
    store.setDnd(true);
    expect(store.isDnd()).toBe(true);
    expect(store.dndUntil()).toBeNull();
  });

  it('"until 8:00" lands on the next 8:00', () => {
    expect(store.msUntilHour(8, new Date('2026-10-08T07:00:00'))).toBe(60 * 60 * 1000);
    expect(store.msUntilHour(8, new Date('2026-10-08T09:00:00'))).toBe(23 * 60 * 60 * 1000);
  });

  it('holds back informational pop-ups only', () => {
    store.setDnd(true);
    expect(store.shouldShowToast('ok', false)).toBe(false);
    expect(store.shouldShowToast('muted', false)).toBe(false);
    expect(store.shouldShowToast('err', false)).toBe(true);
    expect(store.shouldShowToast('warn', false)).toBe(true);
    expect(store.shouldShowToast('ok', true)).toBe(true);
    store.setDnd(false);
    expect(store.shouldShowToast('ok', false)).toBe(true);
  });

  it('ToastHost honours it', async () => {
    await render(<ToastHost />);
    store.setDnd(true);
    await act(async () => {
      window.dispatchEvent(new CustomEvent('os:toast', { detail: { message: 'Saved', kind: 'ok' } }));
      window.dispatchEvent(new CustomEvent('os:toast', { detail: { message: 'Failed', kind: 'err' } }));
    });
    const texts = [...host.querySelectorAll('.os-toast')].map((el) => el.textContent ?? '');
    expect(texts.some((text) => text.includes('Failed'))).toBe(true);
    expect(texts.some((text) => text.includes('Saved'))).toBe(false);
  });
});

describe('notification grouping', () => {
  const now = Date.parse('2026-10-08T12:00:00');
  it('buckets by local day', () => {
    expect(bucketOf(Date.parse('2026-10-08T00:30:00'), now)).toBe('today');
    expect(bucketOf(Date.parse('2026-10-07T23:59:00'), now)).toBe('yesterday');
    expect(bucketOf(Date.parse('2026-10-01T09:00:00'), now)).toBe('earlier');
  });

  it('collapses identical notices in a row and keeps every id', () => {
    const items = [
      notice({ id: 3, ts: now - 1000 }),
      notice({ id: 2, ts: now - 2000 }),
      notice({ id: 1, ts: now - 3000, message: 'Other' }),
      notice({ id: 9, ts: Date.parse('2026-10-07T09:00:00') }),
    ];
    const groups = groupNotifications(items, now);
    expect(groups.map((g) => g.bucket)).toEqual(['today', 'yesterday']);
    expect(groups[0].rows.map((r) => r.count)).toEqual([2, 1]);
    expect(groups[0].rows[0].ids).toEqual([3, 2]);
    expect(groups[0].ids).toEqual([3, 2, 1]);
  });

  it('compares catalog notices by key and vars, not by stored text', () => {
    const a = notice({ i18n: { message: 'x.y', vars: { n: 1 } }, message: 'old text' });
    expect(sameNotice(a, { ...a, id: 2, message: 'other stored text' })).toBe(true);
    expect(sameNotice(a, { ...a, id: 2, i18n: { message: 'x.y', vars: { n: 2 } } })).toBe(false);
  });

  it('the center renders day groups, a repeat count, and a per-group clear', async () => {
    store.notify({ message: 'Folder imported' });
    store.notify({ message: 'Folder imported' });
    await render(<NotificationCenter />);
    await act(async () => {
      window.dispatchEvent(new CustomEvent('shell:toggleNotifications'));
    });
    const en = (key: string) => String(CATALOGS.en[key]);
    expect(host.querySelector('#os-notif-group-today')?.textContent).toBe(en('shell2.notif.group.today'));
    expect(host.querySelector('[data-notif-count="2"]')).not.toBeNull();
    const clear = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${en('shell2.notif.clearGroup').replace('{group}', en('shell2.notif.group.today'))}"]`,
    );
    expect(clear).not.toBeNull();
    await act(async () => {
      clear?.click();
    });
    expect(store.getNotifications()).toHaveLength(0);
  });
});

describe('taskbar overflow', () => {
  it('turns a vertical wheel into a sideways scroll only when something is hidden', () => {
    expect(wheelScrollDelta(0, 120, 900, 500)).toBe(120);
    expect(wheelScrollDelta(0, 120, 500, 500)).toBeNull();
    expect(wheelScrollDelta(40, 10, 900, 500)).toBeNull();
  });

  it('reveals the active task by the minimum scroll, in the strip\'s own pixels', () => {
    expect(revealScrollDelta({ left: 0, right: 500 }, { left: 520, right: 600 })).toBe(100);
    expect(revealScrollDelta({ left: 0, right: 500 }, { left: -30, right: 50 })).toBe(-30);
    expect(revealScrollDelta({ left: 0, right: 500 }, { left: 100, right: 200 })).toBe(0);
    expect(revealScrollDelta({ left: 0, right: 500 }, { left: 520, right: 600 }, 2)).toBe(50);
  });
});

describe('panel commands', () => {
  it('are in the catalog, labelled in every language', () => {
    for (const id of ['shell.openNotifications', 'shell.openStart', 'shell.openQuickSettings', 'shell.toggleDnd']) {
      expect(COMMAND_CATALOG.some((c) => c.id === id), id).toBe(true);
      for (const lang of ['en', 'ja', 'zh', 'ru'] as const) expect(CATALOGS[lang][`cmd.${id}`], `${lang} ${id}`).toBeTruthy();
    }
  });

  it('open the panels through the events they already listen for', () => {
    const seen: string[] = [];
    const record = (event: Event) => seen.push(event.type);
    for (const type of ['shell:toggleNotifications', 'shell:start', 'shell:toggleQuickSettings']) window.addEventListener(type, record);
    try {
      runCommand('shell.openNotifications');
      runCommand('shell.openStart');
      runCommand('shell.openQuickSettings');
    } finally {
      for (const type of ['shell:toggleNotifications', 'shell:start', 'shell:toggleQuickSettings']) window.removeEventListener(type, record);
    }
    expect(seen).toEqual(['shell:toggleNotifications', 'shell:start', 'shell:toggleQuickSettings']);
  });

  it('Do not disturb toggles, and says so while pop-ups can still be seen', () => {
    const toasts: string[] = [];
    const onToast = (event: Event) => {
      if (!store.isDnd()) toasts.push(String((event as CustomEvent<{ message: string }>).detail.message));
    };
    window.addEventListener('os:toast', onToast);
    try {
      runCommand('shell.toggleDnd');
      expect(store.isDnd()).toBe(true);
      runCommand('shell.toggleDnd');
      expect(store.isDnd()).toBe(false);
    } finally {
      window.removeEventListener('os:toast', onToast);
    }
    expect(toasts).toHaveLength(2);
  });
});

describe('desktop shell wiring (source guards)', () => {
  it('the title bar opens the window\'s own menu', () => {
    expect(SHELL).toMatch(/onTitleMenu=\{openTitleMenu\}/);
    expect(SHELL).toMatch(/onTitleMenu\(win\.id, e\.clientX, e\.clientY\)/);
  });

  it('a settled window resize re-runs the reversible refit', () => {
    expect(SHELL).toMatch(/announceViewportChange\(\)/);
    expect(SHELL).toMatch(/window\.addEventListener\('resize', onResize\)/);
  });

  it('keeps the taskbar strip tag the menu guard slices on', () => {
    expect(SHELL).toContain('<div className="os-task-wins">');
  });
});

describe('empty desk after "Start here" is dismissed', () => {
  it('shows one pointer-transparent line instead of nothing', async () => {
    markTourComplete();
    localStorage.setItem(START_HERE_DISMISSED_KEY, '1');
    await render(<StartHereCard desktopEmpty onOpen={() => undefined} />);
    expect(host.querySelector('.os-start-here')).toBeNull();
    const hint = host.querySelector('.os-empty-desk-hint');
    expect(hint?.getAttribute('role')).toBe('note');
    expect(hint?.textContent).toContain('Ctrl+K');
  });
});
