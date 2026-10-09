// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { isReaderInteraction } from '../readerActivity';

afterEach(() => {
  document.body.replaceChildren();
});

function setup() {
  const reader = document.createElement('div');
  const page = document.createElement('p');
  reader.append(page);
  const sidebar = document.createElement('input');
  document.body.append(reader, sidebar);
  return { reader, page, sidebar };
}

describe('isReaderInteraction', () => {
  it('counts pointer, wheel and scroll activity inside the reader only', () => {
    const { reader, page, sidebar } = setup();
    for (const type of ['pointermove', 'pointerdown', 'wheel', 'scroll', 'touchstart']) {
      expect(isReaderInteraction({ type, target: page }, reader)).toBe(true);
      expect(isReaderInteraction({ type, target: sidebar }, reader)).toBe(false);
    }
  });

  it('counts a key pressed with nothing focused, but not typing in another field', () => {
    const { reader, sidebar } = setup();
    expect(isReaderInteraction({ type: 'keydown', target: document.body }, reader)).toBe(true);
    expect(isReaderInteraction({ type: 'keydown', target: sidebar }, reader)).toBe(false);
  });

  it('ignores events with no element target, and counts everything before the reader mounts', () => {
    const { reader } = setup();
    expect(isReaderInteraction({ type: 'scroll', target: window }, reader)).toBe(false);
    expect(isReaderInteraction({ type: 'scroll', target: window }, null)).toBe(true);
  });
});
