// @vitest-environment jsdom
/**
 * Round-2 keyboard pass (K1–K4): who gets a keypress.
 *
 * - K2: a bare Space / Enter on a focused button, link or disclosure presses THAT control;
 *   it is not turned into `flashcards.flip` (bound to Space|Enter app-wide).
 * - K3: a handler registered with a scope only hears keys while the keyboard is on its
 *   surface (focus inside its desktop window, or nothing focused and its window focused).
 * - K4: chords that already edit text (Ctrl+Z, Ctrl+Arrow, Ctrl+Shift+V …) are left to a
 *   focused text field unless the command declares `worksWhileTyping`; defaults that sat
 *   on such chords (or on Windows / IME chords) moved, and profiles migrate: rows that
 *   followed the old default move, explicit choices stay.
 * - K1: the player's document-level keymap hands Enter / Space on a focused control back.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { keyBelongsToFocusedControl } from '../../../vendor/seanime-web/app/(main)/_features/video-core/video-core-keyboard-target';

/** `keyboardShortcuts` → `playerBus`, which touches `window.api` at module-eval time. */
function stubApi(): void {
  const api = new Proxy(
    {},
    {
      get: (_target, prop) =>
        typeof prop === 'string' && prop.startsWith('on') ? () => () => undefined : () => Promise.resolve(null),
    },
  );
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
}

type KS = typeof import('../keyboardShortcuts');
let ks: KS;
let uninstall: () => void = () => undefined;

beforeAll(async () => {
  stubApi();
  // A profile saved under the old defaults: one row followed the default, one spelled the
  // old default explicitly, one is the user's own chord, one is explicitly unbound.
  localStorage.setItem(
    'jp-shortcuts-v1',
    JSON.stringify({
      active: 'Default',
      profiles: {
        Default: {
          'music.next': 'Ctrl+ArrowRight',
          'music.prev': 'Ctrl+Shift+F9',
          'clipboard.open': null,
        },
      },
      customCommands: [],
    }),
  );
  ks = await import('../keyboardShortcuts');
  uninstall = ks.installKeyboardShortcuts();
});

afterAll(() => {
  uninstall();
  localStorage.clear();
});

beforeEach(() => {
  document.body.innerHTML = '';
  (document.activeElement as HTMLElement | null)?.blur?.();
});

function press(target: Element, init: KeyboardEventInit): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
}

describe('K4: moved defaults', () => {
  it('no default sits on the IME toggle, a text-editing chord or the Windows desktop switch', () => {
    const byId = new Map(ks.COMMAND_CATALOG.map((c) => [c.id, c.defaultKeys]));
    expect(byId.get('nav.palette')).not.toMatch(/Ctrl\+Space/);
    expect(byId.get('nav.search')).toBe('Ctrl+P');
    const moved = [
      'nav.palette',
      'nav.undo',
      'clipboard.open',
      'music.next',
      'music.prev',
      'window.moveToNextMonitor',
      'window.moveToPrevMonitor',
      'nav.nextDesktop',
      'nav.prevDesktop',
    ];
    for (const id of moved) {
      for (const chord of ks.splitChords(ks.normalizeChord(byId.get(id) ?? ''))) {
        expect(ks.isEditingChord(chord, true), `${id} = ${chord}`).toBe(false);
        expect(chord, id).not.toMatch(/^Ctrl\+Meta\+Arrow|^Ctrl\+Space$/);
      }
    }
    // Nothing else claims the palette's new chord.
    const paletteChord = ks.normalizeChord(byId.get('nav.palette') ?? '');
    const others = ks.COMMAND_CATALOG.filter(
      (c) => c.id !== 'nav.palette' && ks.splitChords(ks.normalizeChord(c.defaultKeys)).includes(paletteChord),
    );
    expect(others.map((c) => c.id)).toEqual([]);
  });

  it('a saved profile migrates: default-following rows move, explicit choices stay', () => {
    // 'music.next' spelled the old default → follows the new one.
    expect(ks.effectiveKeys('music.next')).toBe(
      ks.normalizeChord(ks.COMMAND_CATALOG.find((c) => c.id === 'music.next')?.defaultKeys ?? ''),
    );
    // The user's own chord and an explicit unbind are kept.
    expect(ks.effectiveKeys('music.prev')).toBe('Ctrl+Shift+F9');
    expect(ks.effectiveKeys('clipboard.open')).toBe('');
    const saved = JSON.parse(localStorage.getItem('jp-shortcuts-v1') ?? '{}');
    expect(saved.defaultsVersion).toBeGreaterThanOrEqual(2);
  });

  it('a row keeps its old chord when the new default is already taken in that profile', () => {
    const profiles: Record<string, Record<string, string | null>> = {
      P: { 'nav.search': 'Ctrl+K' },
    };
    ks.migrateMovedDefaults(profiles, 1);
    expect(profiles.P['nav.palette']).toBe('Ctrl+Space');
    expect(profiles.P['nav.search']).toBe('Ctrl+K');
  });

  it('Ctrl+Z in a text field is not taken by a review undo; elsewhere it is', () => {
    const fn = vi.fn();
    const off = ks.registerCommandHandler('flashcards.undo', fn);
    try {
      const input = document.createElement('input');
      document.body.append(input);
      input.focus();
      const inField = press(input, { key: 'z', code: 'KeyZ', ctrlKey: true });
      expect(fn).not.toHaveBeenCalled();
      expect(inField.defaultPrevented).toBe(false);
      input.blur();
      press(document.body, { key: 'z', code: 'KeyZ', ctrlKey: true });
      expect(fn).toHaveBeenCalledTimes(1);
    } finally {
      off();
    }
  });

  it('isEditingChord: caret / clipboard / history chords yes, Alt chords and plain Ctrl letters no', () => {
    for (const c of ['Ctrl+ArrowLeft', 'Ctrl+Shift+ArrowRight', 'Ctrl+Shift+Z', 'Ctrl+Shift+V', 'Ctrl+Backspace', 'Shift+PageDown']) {
      expect(ks.isEditingChord(c), c).toBe(true);
    }
    for (const c of ['Ctrl+Alt+Z', 'Ctrl+K', 'Ctrl+P', 'Ctrl+PageDown', 'Ctrl+Alt+Shift+V', 'Ctrl+Shift+C']) {
      expect(ks.isEditingChord(c), c).toBe(false);
    }
    expect(ks.isEditingChord('Ctrl+B')).toBe(false);
    expect(ks.isEditingChord('Ctrl+B', true)).toBe(true);
  });
});

describe('K2: a focused control keeps its own Space and Enter', () => {
  it('Space on a focused grade button does not flip the card', () => {
    const flip = vi.fn();
    const off = ks.registerCommandHandler('flashcards.flip', flip);
    try {
      const button = document.createElement('button');
      button.textContent = 'Good';
      document.body.append(button);
      button.focus();
      const onButton = press(button, { key: ' ', code: 'Space' });
      expect(flip).not.toHaveBeenCalled();
      expect(onButton.defaultPrevented).toBe(false);
      press(button, { key: 'Enter', code: 'Enter' });
      expect(flip).not.toHaveBeenCalled();
      button.blur();
      press(document.body, { key: ' ', code: 'Space' });
      expect(flip).toHaveBeenCalledTimes(1);
    } finally {
      off();
    }
  });
});

describe('K3: scoped handlers hear keys only on their own surface', () => {
  function desktopWindow(focused: boolean): { win: HTMLElement; root: HTMLElement; field: HTMLButtonElement } {
    const win = document.createElement('div');
    win.className = focused ? 'fwin focused' : 'fwin';
    const root = document.createElement('div');
    const field = document.createElement('button');
    root.append(field);
    win.append(root);
    document.body.append(win);
    return { win, root, field };
  }

  it('Escape in another window does not end the review; in the review window it does', () => {
    const review = desktopWindow(false);
    const other = desktopWindow(true);
    const end = vi.fn();
    const off = ks.registerCommandHandler('flashcards.end', end, { scope: () => review.root });
    try {
      other.field.focus();
      press(other.field, { key: 'Escape', code: 'Escape' });
      expect(end).not.toHaveBeenCalled();
      review.field.focus();
      press(review.field, { key: 'Escape', code: 'Escape' });
      expect(end).toHaveBeenCalledTimes(1);
    } finally {
      off();
    }
  });

  it('with nothing focused, the focused desktop window decides', () => {
    const review = desktopWindow(false);
    const end = vi.fn();
    const off = ks.registerCommandHandler('flashcards.end', end, { scope: () => review.root });
    try {
      press(document.body, { key: 'Escape', code: 'Escape' });
      expect(end).not.toHaveBeenCalled();
      review.win.classList.add('focused');
      press(document.body, { key: 'Escape', code: 'Escape' });
      expect(end).toHaveBeenCalledTimes(1);
    } finally {
      off();
    }
  });

  it('the palette (runCommand) still reaches a scoped handler', () => {
    const review = desktopWindow(false);
    const end = vi.fn();
    const off = ks.registerCommandHandler('flashcards.end', end, { scope: () => review.root });
    try {
      expect(ks.runCommand('flashcards.end')).toBe(true);
      expect(end).toHaveBeenCalledTimes(1);
    } finally {
      off();
    }
  });
});

describe('K1: the player keymap leaves a focused control its own keys', () => {
  it('Enter / Space on a button, link or menu item belong to it; on the page they do not', () => {
    const button = document.createElement('button');
    const item = document.createElement('div');
    item.setAttribute('role', 'menuitem');
    const plain = document.createElement('div');
    document.body.append(button, item, plain);
    for (const target of [button, item]) {
      expect(keyBelongsToFocusedControl({ code: 'Space', key: ' ', target })).toBe(true);
      expect(keyBelongsToFocusedControl({ code: 'Enter', key: 'Enter', target })).toBe(true);
    }
    expect(keyBelongsToFocusedControl({ code: 'Space', key: ' ', target: plain })).toBe(false);
    // A plain button keeps the player's seek arrows (focus stays on it after a click).
    expect(keyBelongsToFocusedControl({ code: 'ArrowLeft', key: 'ArrowLeft', target: button })).toBe(false);
  });

  it('arrows inside a menu or slider belong to it', () => {
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    const inner = document.createElement('div');
    inner.setAttribute('role', 'menuitem');
    menu.append(inner);
    const slider = document.createElement('div');
    slider.setAttribute('role', 'slider');
    document.body.append(menu, slider);
    expect(keyBelongsToFocusedControl({ code: 'ArrowDown', key: 'ArrowDown', target: inner })).toBe(true);
    expect(keyBelongsToFocusedControl({ code: 'ArrowRight', key: 'ArrowRight', target: slider })).toBe(true);
  });
});
