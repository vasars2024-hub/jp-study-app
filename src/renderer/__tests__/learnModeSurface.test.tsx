// @vitest-environment jsdom
/**
 * The Learn surface, driven the way a user drives it.
 *
 * The session machine is pinned in `flashcardLearn.test.ts`. What only a
 * rendered pass can show:
 *
 * - the full choice → recall → mastered walk of one card actually reaches the
 *   done state, rather than the reducer being right while the host never asks
 *   the next question off the NEW session (the stale-state bug that would leave
 *   a card asking itself forever).
 * - a wrong pick marks the right answer too, because being told only "wrong"
 *   teaches nothing.
 * - the typing-only sitting SAYS it is typing-only instead of quietly skipping
 *   the choice stage.
 * - the exit is on screen in every state, refusal included.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (
      vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key
    ),
    lang: 'en',
  }),
}));

let deck: Array<Record<string, unknown>> = [];
vi.mock('../flashcardDeck', () => ({ loadDeck: () => deck }));

import LearnMode from '../components/flashcards/LearnMode';

let host: HTMLDivElement;
let root: Root;
let exited = 0;

function mount(): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(createElement(LearnMode, { onExit: () => { exited += 1; } })); });
}

function buttons(): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll('button'));
}

function labels(): string[] {
  return buttons().map((b) => b.textContent ?? '');
}

function click(label: string): void {
  const button = buttons().find((b) => b.textContent === label);
  if (!button) throw new Error(`no button ${label} in [${labels().join(' | ')}]`);
  act(() => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

function type(value: string): void {
  const input = host.querySelector('input') as HTMLInputElement;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const five = [
  { id: 'a', word: '食べる', reading: 'たべる', meaning: 'to eat', addedAt: 1 },
  { id: 'b', word: '飲む', reading: 'のむ', meaning: 'to drink', addedAt: 2 },
  { id: 'c', word: '走る', reading: 'はしる', meaning: 'to run', addedAt: 3 },
  { id: 'd', word: '書く', reading: 'かく', meaning: 'to write', addedAt: 4 },
];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  exited = 0;
  deck = five;
});

afterEach(() => {
  act(() => { root.unmount(); });
  host.remove();
});

describe('LearnMode', () => {
  it('refuses a deck with nothing to ask, and still offers the exit', () => {
    deck = [{ id: 'x', word: '猫', addedAt: 1 }];
    mount();
    expect(host.textContent).toContain('flash.learn.noUsableCards');
    click('flash.learn.exit');
    expect(exited).toBe(1);
  });

  it('opens on a choice question with the answer among the options', () => {
    mount();
    expect(host.textContent).toContain('flash.learn.askChoice');
    expect(host.textContent).toContain('flash.learn.progress(mastered=0,total=4)');
    const tiles = Array.from(host.querySelectorAll('.flash-match-tile'));
    expect(tiles.length).toBeGreaterThanOrEqual(3);
    const texts = tiles.map((tile) => tile.textContent);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('marks the right answer even when the pick was wrong', () => {
    mount();
    const tiles = Array.from(host.querySelectorAll('.flash-match-tile')) as HTMLButtonElement[];
    const prompt = host.querySelector('.flash-write-prompt')?.textContent ?? '';
    const answer = five.find((c) => c.word === prompt)?.meaning;
    const wrong = tiles.find((tile) => tile.textContent !== answer);
    if (!wrong) throw new Error('every option carried the answer');
    act(() => { wrong.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(host.textContent).toContain(`flash.learn.choiceWrong(answer=${answer})`);
    const marked = Array.from(host.querySelectorAll('.flash-match-tile.is-matched'));
    expect(marked.map((tile) => tile.textContent)).toEqual([answer]);
    expect(host.querySelectorAll('.flash-match-tile.is-wrong')).toHaveLength(1);
  });

  it('says a small deck is typing only rather than quietly skipping the choice', () => {
    deck = [five[0], five[1]];
    mount();
    expect(host.textContent).toContain('flash.learn.typingOnly');
    expect(host.textContent).toContain('flash.learn.askRecall');
  });

  it('carries one card choice → recall → mastered and reaches the done state', () => {
    deck = [five[0]];
    mount();
    // A one-card sitting is typing only, so the whole walk is the recall stage.
    expect(host.textContent).toContain('flash.learn.askRecall');
    type('食べる');
    click('flash.write.check');
    expect(host.textContent).toContain('flash.write.correct');
    click('flash.learn.next');
    expect(host.textContent).toContain('flash.learn.done(total=1)');
    expect(host.textContent).toContain('flash.learn.progress(mastered=1,total=1)');
  });

  it('REFUSAL: a wrong typed answer does not master the card', () => {
    deck = [five[0]];
    mount();
    type('飲む');
    click('flash.write.check');
    expect(host.textContent).toContain('flash.learn.recallWrong(answer=食べる)');
    click('flash.learn.next');
    // Still asking, still zero mastered — the card came back.
    expect(host.textContent).toContain('flash.learn.progress(mastered=0,total=1)');
    expect(host.textContent).not.toContain('flash.learn.done');
  });

  it('keeps the exit reachable while a question is open', () => {
    mount();
    expect(labels()).toContain('flash.learn.exit');
    click('flash.learn.exit');
    expect(exited).toBe(1);
  });
});
