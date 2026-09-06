// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FlashcardFileMenu from '../components/flashcards/FlashcardFileMenu';

let root: Root;
let host: HTMLDivElement;
const move = vi.fn();

function Harness() {
  const [open, setOpen] = useState(false);
  return <FlashcardFileMenu open={open} folders={['My deck']} onOpenChange={setOpen} onMove={move} />;
}

function trigger(): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>('button');
  if (!button) throw new Error('Missing File button');
  return button;
}

function items(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('[role=menuitem]'));
}

async function open() {
  await act(async () => trigger().click());
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  move.mockReset();
  host = document.createElement('div');
  // A floating window establishes a containing block: the menu must escape it.
  host.style.transform = 'translateX(40px)';
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('Flashcard File menu', () => {
  it('announces expansion and focuses a menu outside the window containing block', async () => {
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    await open();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(document.querySelector('[role=menu]')?.parentElement).toBe(document.body);
    expect(document.activeElement).toBe(items()[0]);
  });

  it('Escape closes without moving a card and returns focus to File', async () => {
    await open();
    await act(async () => {
      items()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(items()).toHaveLength(0);
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger());
    expect(move).not.toHaveBeenCalled();
  });

  it('outside press dismisses, while an inside press keeps the choices available', async () => {
    await open();
    await act(async () => items()[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    expect(items()).toHaveLength(2);
    await act(async () => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    expect(items()).toHaveLength(0);
    expect(move).not.toHaveBeenCalled();
  });

  it('arrow navigation selects the real folder, closes and restores focus', async () => {
    await open();
    await act(async () => {
      items()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(document.activeElement).toBe(items()[1]);
    await act(async () => items()[1].click());
    expect(move).toHaveBeenCalledExactlyOnceWith('My deck');
    expect(items()).toHaveLength(0);
    expect(document.activeElement).toBe(trigger());
  });

  it('Unfiled keeps its null-folder mutation contract', async () => {
    await open();
    await act(async () => items()[0].click());
    expect(move).toHaveBeenCalledExactlyOnceWith(null);
    expect(items()).toHaveLength(0);
  });
});
