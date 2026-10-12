import { describe, expect, it } from 'vitest';
import { headlessClipboardChord } from '../debugBridge';

/**
 * Under the e2e harness `/key` must never let a clipboard chord reach Chromium's native
 * copy / paste — those read and write the owner's real clipboard. The route turns each
 * such chord into the page's `execCommand`, which the headless page shim answers from the
 * in-memory clipboard. This pins which chords count.
 */
describe('headlessClipboardChord', () => {
  it('names the native clipboard command of every clipboard chord', () => {
    expect(headlessClipboardChord('c', ['ctrl'])).toBe('copy');
    expect(headlessClipboardChord('C', ['control'])).toBe('copy');
    expect(headlessClipboardChord('x', ['meta'])).toBe('cut');
    expect(headlessClipboardChord('v', ['ctrl'])).toBe('paste');
    expect(headlessClipboardChord('v', ['ctrl', 'shift'])).toBe('paste');
    expect(headlessClipboardChord('Insert', ['ctrl'])).toBe('copy');
    expect(headlessClipboardChord('Insert', ['shift'])).toBe('paste');
    expect(headlessClipboardChord('Delete', ['shift'])).toBe('cut');
  });

  it('leaves every other key alone (study keys, shifted letters, plain C)', () => {
    expect(headlessClipboardChord('c', [])).toBeNull();
    expect(headlessClipboardChord('C', ['shift'])).toBeNull();
    expect(headlessClipboardChord('c', ['ctrl', 'shift'])).toBeNull();
    expect(headlessClipboardChord('u', ['ctrl'])).toBeNull();
    expect(headlessClipboardChord('Delete', [])).toBeNull();
  });
});
