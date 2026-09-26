// @vitest-environment jsdom
/**
 * Text editing keeps working with no application menu.
 *
 * The Electron default menu is gone (`main/appMenu.ts`). On Windows, Chromium
 * handles Ctrl+C/V/X/Z/Y/A in editable fields itself — unless the page cancels the
 * keydown. This pins that the app's global shortcut listener does not cancel them
 * in an input, a textarea or a contenteditable, so the menu's removal cannot have
 * taken copy / paste / cut / undo / redo / select-all away.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

const CHORDS: { key: string; code: string; shift?: boolean }[] = [
  { key: 'c', code: 'KeyC' },
  { key: 'v', code: 'KeyV' },
  { key: 'x', code: 'KeyX' },
  { key: 'z', code: 'KeyZ' },
  { key: 'y', code: 'KeyY' },
  { key: 'a', code: 'KeyA' },
];

let uninstall: () => void = () => undefined;

beforeAll(async () => {
  stubApi();
  const ks = await import('../keyboardShortcuts');
  uninstall = ks.installKeyboardShortcuts();
});

afterAll(() => {
  uninstall();
  localStorage.clear();
});

function editables(): HTMLElement[] {
  const input = document.createElement('input');
  input.type = 'text';
  const textarea = document.createElement('textarea');
  const editable = document.createElement('div');
  editable.contentEditable = 'true';
  // jsdom does not implement isContentEditable; the app's typing guard reads it.
  Object.defineProperty(editable, 'isContentEditable', { value: true });
  editable.tabIndex = 0;
  return [input, textarea, editable];
}

describe('editing chords in text fields are left to the browser', () => {
  for (const field of ['input', 'textarea', 'contenteditable']) {
    it(`Ctrl+C/V/X/Z/Y/A are not cancelled in a ${field}`, () => {
      const el = editables()[['input', 'textarea', 'contenteditable'].indexOf(field)];
      document.body.append(el);
      el.focus();
      expect(document.activeElement).toBe(el);
      try {
        for (const { key, code, shift } of CHORDS) {
          const event = new KeyboardEvent('keydown', {
            key,
            code,
            ctrlKey: true,
            shiftKey: shift === true,
            bubbles: true,
            cancelable: true,
          });
          el.dispatchEvent(event);
          expect(event.defaultPrevented, `Ctrl+${key.toUpperCase()} in ${field}`).toBe(false);
        }
      } finally {
        el.remove();
      }
    });
  }
});
