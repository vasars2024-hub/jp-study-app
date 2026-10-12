// @vitest-environment jsdom
/**
 * The Notification Center's quiet-hours row: the nightly schedule is set here, shows when
 * it is holding things back, and is independent of the manual Do-not-disturb switch.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../i18n', () => ({
  t: (key: string) => key,
  useT: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars?.time ? `${key}:${String(vars.time)}` : key), lang: 'en' }),
}));

import NotificationCenter from '../components/shell/NotificationCenter';
import { isDnd, isManualDnd, loadQuietHours } from '../notificationStore';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function open(): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(createElement(NotificationCenter));
  });
  act(() => {
    window.dispatchEvent(new CustomEvent('shell:toggleNotifications'));
  });
  return host;
}

function setValue(input: HTMLInputElement, value: string): void {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  localStorage.clear();
});

describe('Notification Center quiet hours', () => {
  it('turns the nightly schedule on and edits its window', () => {
    const el = open();
    const group = el.querySelector('[aria-label="planner.quiet.label"]') as HTMLElement;
    expect(group).not.toBeNull();
    const box = group.querySelector('input[type="checkbox"]') as HTMLInputElement;
    const [from, to] = Array.from(group.querySelectorAll('input[type="time"]')) as HTMLInputElement[];
    expect(from.getAttribute('aria-label')).toBe('planner.quiet.from');
    expect(to.getAttribute('aria-label')).toBe('planner.quiet.to');
    act(() => box.click());
    expect(loadQuietHours().on).toBe(true);
    setValue(from, '21:30');
    setValue(to, '06:45');
    expect(loadQuietHours()).toEqual({ on: true, start: '21:30', end: '06:45' });
  });

  it('says when the schedule is active, without flipping the manual switch', () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    localStorage.setItem('jp-os-quiet-hours', JSON.stringify({
      on: true, start: `${pad((now.getHours() + 23) % 24)}:00`, end: `${pad((now.getHours() + 1) % 24)}:59`,
    }));
    expect(isDnd()).toBe(true);
    expect(isManualDnd()).toBe(false);
    const el = open();
    expect(el.textContent).toContain('planner.quiet.activeUntil:');
    // The header switch shows the manual state only, so turning it off is never a no-op.
    const header = el.querySelector('.os-flyout-head input[type="checkbox"]') as HTMLInputElement | null;
    if (header) expect(header.checked).toBe(false);
  });
});
