// @vitest-environment jsdom
/**
 * After a renderer crash main reloads the window and the reloaded window tells
 * the user. The notice used to go only to the notification center, which never
 * raises anything on its own — so the runtime check found no toast at all after
 * a crash. It must reach the center and the on-screen toast host.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const notified = vi.hoisted(() => [] as Array<{ id?: string; message: string }>);
vi.mock('../notificationStore', () => ({
  notify: (n: { id?: string; message: string }) => {
    notified.push(n);
    return n;
  },
}));
vi.mock('../i18n', () => ({
  t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
}));

import { showCrashRecoveryNotice } from '../crashRecoveryNotice';

const toasts: Array<{ message: string; kind: string }> = [];
const onToast = (e: Event) => toasts.push((e as CustomEvent<{ message: string; kind: string }>).detail);

beforeEach(() => {
  notified.length = 0;
  toasts.length = 0;
  window.addEventListener('os:toast', onToast);
});

afterEach(() => {
  window.removeEventListener('os:toast', onToast);
});

function stubNotice(notice: { reason: string; safeMode?: boolean } | null): void {
  (window as unknown as { api: Record<string, unknown> }).api = {
    diagnosticsConsumeCrashRecovery: vi.fn(async () => notice),
  };
}

describe('crash recovery notice', () => {
  it('raises an on-screen toast as well as the center entry', async () => {
    stubNotice({ reason: 'crashed' });
    await showCrashRecoveryNotice();
    expect(notified).toHaveLength(1);
    expect(notified[0].id).toBe('crash-recovered');
    expect(toasts).toHaveLength(1);
    expect(toasts[0].kind).toBe('warn');
    expect(toasts[0].message).toContain('crash.recovered.body');
    expect(toasts[0].message).toContain('crashed');
  });

  it('stays silent when there was no crash', async () => {
    stubNotice(null);
    await showCrashRecoveryNotice();
    expect(notified).toHaveLength(0);
    expect(toasts).toHaveLength(0);
  });
});
