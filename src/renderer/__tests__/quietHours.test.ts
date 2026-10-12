// @vitest-environment jsdom
/** Quiet hours: Do not disturb on a nightly schedule, feeding `isDnd`. */
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_QUIET_HOURS,
  inQuietHours,
  isDnd,
  isManualDnd,
  loadQuietHours,
  quietHoursEndAt,
  setDnd,
  setQuietHours,
  shouldShowToast,
} from '../notificationStore';

const at = (h: number, m = 0) => new Date(2026, 9, 9, h, m).getTime();
const night = { on: true, start: '22:00', end: '07:00' };

afterEach(() => localStorage.clear());

describe('quiet hours', () => {
  it('is off by default and changes nothing', () => {
    expect(loadQuietHours()).toEqual(DEFAULT_QUIET_HOURS);
    expect(isDnd(at(23))).toBe(false);
  });

  it('wraps past midnight and respects the end minute', () => {
    expect(inQuietHours(at(21, 59), night)).toBe(false);
    expect(inQuietHours(at(22), night)).toBe(true);
    expect(inQuietHours(at(3), night)).toBe(true);
    expect(inQuietHours(at(6, 59), night)).toBe(true);
    expect(inQuietHours(at(7), night)).toBe(false);
    const day = { on: true, start: '13:00', end: '14:30' };
    expect(inQuietHours(at(14, 15), day)).toBe(true);
    expect(inQuietHours(at(14, 30), day)).toBe(false);
    expect(inQuietHours(at(3), { ...night, on: false })).toBe(false);
    expect(inQuietHours(at(3), { on: true, start: '07:00', end: '07:00' })).toBe(false);
  });

  it('reports when the current window ends', () => {
    expect(quietHoursEndAt(at(23), night)).toBe(new Date(2026, 9, 10, 7, 0).getTime());
    expect(quietHoursEndAt(at(5), night)).toBe(at(7));
    expect(quietHoursEndAt(at(12), night)).toBeNull();
  });

  it('persists, ignores malformed times, and feeds isDnd without touching the manual switch', () => {
    setQuietHours({ on: true, start: '22:00', end: '7:00' });
    expect(loadQuietHours()).toEqual({ on: true, start: '22:00', end: '07:00' });
    expect(isDnd(at(23))).toBe(true);
    expect(isManualDnd(at(23))).toBe(false);
    // Informational pop-ups are held; anything that needs action still shows.
    expect(shouldShowToast('info', false, at(23))).toBe(false);
    expect(shouldShowToast('error', false, at(23))).toBe(true);
    setDnd(true);
    expect(isManualDnd(at(12))).toBe(true);
  });
});
