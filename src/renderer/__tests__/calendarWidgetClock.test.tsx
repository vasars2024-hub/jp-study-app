// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CalendarWidget } from '../widgets/productivity';

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  localStorage.clear();
});

it('removes finished sessions without requiring an edit or reopening the widget', () => {
  vi.setSystemTime(new Date(2026, 9, 3, 9, 59, 30));
  localStorage.setItem('jp-calendar-events', JSON.stringify([{
    id: 'review', createdAt: 1,
    title: 'Kanji review', date: '2026-10-03', allDay: false,
    startTime: '09:00', endTime: '10:00', category: 'study',
    color: '#900', reminder: 'none', recurrence: 'none',
  }]));
  act(() => root.render(<CalendarWidget />));
  expect(host.querySelector('.wgt-cal-ev-title')?.textContent).toBe('Kanji review');

  // The calendar allows a one-minute grace period after an event ends.
  act(() => vi.advanceTimersByTime(120_000));
  expect(host.querySelector('.wgt-cal-upcoming')).toBeNull();
});

it('moves the today highlight after local midnight while keeping the browsed month', () => {
  vi.setSystemTime(new Date(2026, 9, 3, 23, 59, 30));
  act(() => root.render(<CalendarWidget />));
  const month = host.querySelector('.wgt-cal-head span')?.textContent;
  expect(host.querySelector('.wgt-cal-day.today')?.textContent).toBe('3');

  act(() => vi.advanceTimersByTime(60_000));
  expect(host.querySelector('.wgt-cal-day.today')?.textContent).toBe('4');
  expect(host.querySelector('.wgt-cal-head span')?.textContent).toBe(month);
});
