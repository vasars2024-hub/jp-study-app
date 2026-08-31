import { describe, expect, it } from 'vitest';
import {
  captureVisibleWindowMinStates,
  setCapturedWindowsMinimized,
} from '../showDesktopState';

describe('the taskbar Show desktop round trip', () => {
  const windows = [
    { id: 'visible-a', min: false, payload: 'a' },
    { id: 'already-minimized', min: true, payload: 'b' },
    { id: 'visible-c', payload: 'c' },
  ];

  it('captures only windows that are visible when the action starts', () => {
    expect([...captureVisibleWindowMinStates(windows)]).toEqual([
      ['visible-a', false],
      ['visible-c', undefined],
    ]);
  });

  it('minimizes and restores only that captured set', () => {
    const captured = captureVisibleWindowMinStates(windows);
    const minimized = setCapturedWindowsMinimized(windows, captured, true);
    expect(minimized.map((window) => [window.id, Boolean(window.min)])).toEqual([
      ['visible-a', true],
      ['already-minimized', true],
      ['visible-c', true],
    ]);

    const restored = setCapturedWindowsMinimized(minimized, captured, false);
    expect(restored.map((window) => [window.id, Boolean(window.min)])).toEqual([
      ['visible-a', false],
      ['already-minimized', true],
      ['visible-c', false],
    ]);
    expect(restored.map((window) => window.payload)).toEqual(['a', 'b', 'c']);
    expect(restored).toEqual(windows);
    expect('min' in restored[2]).toBe(false);
  });

  it('leaves unrelated objects byte-for-byte identical', () => {
    const captured = new Map([['visible-a', false]]);
    const next = setCapturedWindowsMinimized(windows, captured, true);
    expect(next[1]).toBe(windows[1]);
    expect(next[2]).toBe(windows[2]);
  });
});
