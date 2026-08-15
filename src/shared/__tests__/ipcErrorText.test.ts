import { describe, expect, it } from 'vitest';
import { ipcErrorText } from '../ipcErrorText';

describe('ipcErrorText', () => {
  it('keeps the handler sentence and drops the channel name', () => {
    // The exact string measured live on 2026-08-16 in the download dialog.
    const raw = new Error(
      "Error invoking remote method 'scraper:malUnits': Error: The catalogue has no anilist entry 185874.",
    );
    expect(ipcErrorText(raw)).toBe('The catalogue has no anilist entry 185874.');
  });

  it('strips a non-Error subclass prefix too', () => {
    const raw = new Error("Error invoking remote method 'a:b': TypeError: x is not a function");
    expect(ipcErrorText(raw)).toBe('x is not a function');
  });

  it('leaves an unwrapped message alone', () => {
    expect(ipcErrorText(new Error('Seanime sidecar is stopped.'))).toBe('Seanime sidecar is stopped.');
  });

  it('accepts a thrown non-Error', () => {
    expect(ipcErrorText('plain string')).toBe('plain string');
  });

  it('never returns an empty string', () => {
    // The negative control for the fallback: an empty status line is read as
    // success, so the wrapper is better than nothing when nothing is left.
    expect(ipcErrorText(new Error("Error invoking remote method 'a:b': "))).toBe(
      "Error invoking remote method 'a:b':",
    );
    expect(ipcErrorText(new Error(''))).toBe('Unknown error');
  });

  it('does not swallow a message that merely contains the wrapper text', () => {
    const raw = new Error("The log said: Error invoking remote method 'x:y': Error: boom");
    expect(ipcErrorText(raw)).toBe("The log said: Error invoking remote method 'x:y': Error: boom");
  });
});
