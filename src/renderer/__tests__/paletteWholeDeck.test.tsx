// @vitest-environment jsdom
//
// The palette offered only the first 400 cards of the deck (and parsed the
// deck to get them): on a 10,000-card deck, 96% of the cards could not be
// found from it. It now searches every card, from the cached parse.
import { act, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let host: HTMLDivElement;
let root: Root;
let CommandPalette: ComponentType;

function stubApi(): void {
  const api = new Proxy({}, {
    get: (_target, prop) => (typeof prop === 'string' && prop.startsWith('on')
      ? () => () => undefined
      : () => Promise.resolve(null)),
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
}

async function type(input: HTMLInputElement, query: string): Promise<void> {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setValue?.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  stubApi();
  localStorage.clear();
  const cards = Array.from({ length: 10_000 }, (_, i) => ({
    id: `fc-${i}`,
    word: i === 9_000 ? '麒麟児' : `語${i}`,
    reading: '',
    meaning: 'm',
    source: 'epub',
    bookTitle: `Book ${i % 30}`,
    addedAt: i,
  }));
  localStorage.setItem('jp-flashcard-deck', JSON.stringify({ folders: [], cards }));
  ({ default: CommandPalette } = await import('../components/CommandPalette'));
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: () => undefined, configurable: true });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<CommandPalette />);
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('the palette and the deck', () => {
  it('finds a card far past the first 400', async () => {
    await act(async () => {
      window.dispatchEvent(new CustomEvent('palette:open', { detail: 'search' }));
    });
    const input = document.querySelector<HTMLInputElement>('.palette-input');
    expect(input).not.toBeNull();
    await type(input as HTMLInputElement, '麒麟児');
    const labels = [...document.querySelectorAll('.palette-row .palette-label')].map((el) => el.textContent);
    expect(labels).toContain('麒麟児');
  });

  it('blurs its search box before it unmounts, so the closed palette is not retained', async () => {
    await act(async () => {
      window.dispatchEvent(new CustomEvent('palette:open', { detail: 'search' }));
    });
    const input = document.querySelector<HTMLInputElement>('.palette-input');
    input?.focus();
    const blurred = { value: false };
    input?.addEventListener('blur', () => { blurred.value = true; });
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(document.querySelector('.palette-input')).toBeNull();
    expect(blurred.value).toBe(true);
  });
});
