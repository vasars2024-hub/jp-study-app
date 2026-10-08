// @vitest-environment jsdom
//
// Shortcuts under a Russian keyboard layout and while an IME is composing.
// Ctrl+P under ЙЦУКЕН arrives as key "з"; a Japanese or Chinese IME's
// keystrokes arrive with isComposing / keyCode 229 / key "Process".
import { describe, expect, it, vi } from 'vitest';

// `keyboardShortcuts` -> `playerBus` touches `window.api` at module-eval time.
vi.hoisted(() => {
  const api = new Proxy({}, {
    get: (_target, prop) => (typeof prop === 'string' && prop.startsWith('on')
      ? () => () => undefined
      : () => Promise.resolve(null)),
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
});
import { chordFromEvent, isImeCompositionEvent } from '../keyboardShortcuts';

function key(init: KeyboardEventInit & { keyCode?: number }): KeyboardEvent {
  const event = new KeyboardEvent('keydown', init);
  if (init.keyCode !== undefined) Object.defineProperty(event, 'keyCode', { value: init.keyCode });
  return event;
}

describe('chordFromEvent under a non-Latin layout', () => {
  it('Russian layout letters resolve to the physical key', () => {
    expect(chordFromEvent(key({ key: 'з', code: 'KeyP', ctrlKey: true })))
      .toBe(chordFromEvent(key({ key: 'p', code: 'KeyP', ctrlKey: true })));
    expect(chordFromEvent(key({ key: 'Ф', code: 'KeyA', shiftKey: true })))
      .toBe(chordFromEvent(key({ key: 'A', code: 'KeyA', shiftKey: true })));
    // A bare letter too (single-key shortcuts like F for fullscreen).
    expect(chordFromEvent(key({ key: 'а', code: 'KeyF' }))).toBe(chordFromEvent(key({ key: 'f', code: 'KeyF' })));
  });

  it('a Latin layout is unchanged, and symbols keep their own character', () => {
    expect(chordFromEvent(key({ key: 'p', code: 'KeyP', ctrlKey: true }))).toMatch(/P$/);
    expect(chordFromEvent(key({ key: '+', code: 'Equal', shiftKey: true }))).toMatch(/\+$/);
    expect(chordFromEvent(key({ key: 'ArrowLeft', code: 'ArrowLeft' }))).toBe('ArrowLeft');
  });

  it('a dead key on a digit resolves to the digit', () => {
    expect(chordFromEvent(key({ key: 'Dead', code: 'Digit6', altKey: true })))
      .toBe(chordFromEvent(key({ key: '6', code: 'Digit6', altKey: true })));
  });
});

describe('AltGr typing is never a shortcut', () => {
  function altGr(init: KeyboardEventInit): KeyboardEvent {
    const event = key({ ...init, ctrlKey: true, altKey: true });
    Object.defineProperty(event, 'getModifierState', { value: (m: string) => m === 'AltGraph' || m === 'Control' || m === 'Alt' });
    return event;
  }

  it('Polish AltGr letters (Ctrl+Alt on Windows) yield no chord', () => {
    expect(chordFromEvent(altGr({ key: 'ż', code: 'KeyZ' }))).toBeNull();
    expect(chordFromEvent(altGr({ key: 'ś', code: 'KeyS' }))).toBeNull();
    expect(chordFromEvent(altGr({ key: '@', code: 'KeyQ' }))).toBeNull();
    expect(chordFromEvent(altGr({ key: 'Dead', code: 'Digit6' }))).toBeNull();
  });

  it('a real Ctrl+Alt chord without AltGraph still resolves', () => {
    expect(chordFromEvent(key({ key: 'z', code: 'KeyZ', ctrlKey: true, altKey: true }))).toMatch(/Z$/);
  });

  it('AltGr with a named key stays a chord', () => {
    expect(chordFromEvent(altGr({ key: 'ArrowLeft', code: 'ArrowLeft' }))).toMatch(/ArrowLeft$/);
  });
});

describe('IME composition is never a shortcut', () => {
  it('composing keystrokes yield no chord', () => {
    expect(chordFromEvent(key({ key: 'k', code: 'KeyK', isComposing: true }))).toBeNull();
    expect(chordFromEvent(key({ key: 'Process', code: 'KeyK' }))).toBeNull();
    expect(chordFromEvent(key({ key: 'k', code: 'KeyK', keyCode: 229 }))).toBeNull();
    expect(isImeCompositionEvent({ key: 'Enter', keyCode: 13, isComposing: false })).toBe(false);
  });
});
