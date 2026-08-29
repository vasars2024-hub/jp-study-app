// @vitest-environment jsdom
/**
 * The Write surface, driven the way a user drives it.
 *
 * The grader is pinned separately in `flashcardWrite.test.ts`; what this file
 * exists for is the three things a pure grader cannot show:
 *
 * - a `close` answer does NOT advance and does NOT score. Everywhere else in
 *   this repo a near miss has been quietly rounded to one side or the other.
 * - the override is an explicit act with its own count, and the summary says so
 *   rather than folding it into "correct".
 * - the exit is on screen in every state the mode can be in, including the
 *   refusal. A practice mode with no way back is the defect Match was written
 *   against.
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

import WriteMode from '../components/flashcards/WriteMode';

let host: HTMLDivElement;
let root: Root;

function mount(): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(createElement(WriteMode, { onExit: () => { exited += 1; } })); });
}

let exited = 0;

function buttons(): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll('button'));
}

function click(label: string): void {
  const button = buttons().find((b) => b.textContent === label);
  if (!button) throw new Error(`no button ${label} in [${buttons().map((b) => b.textContent).join(' | ')}]`);
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

/** Long enough that a dropped kana is a slip rather than a different word. */
const greeting = {
  id: 'g', word: 'おはようございます', reading: 'おはようございます', meaning: 'good morning', addedAt: 1,
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  exited = 0;
  deck = [
    { id: 'a', word: '漢字', reading: 'かんじ', meaning: 'Chinese character', addedAt: 1 },
  ];
});

afterEach(() => {
  act(() => { root.unmount(); });
  host.remove();
});

describe('WriteMode', () => {
  it('refuses a deck with nothing typeable, and still offers the exit', () => {
    deck = [{ id: 'x', word: '猫', addedAt: 1 }];
    mount();
    expect(host.textContent).toContain('flash.write.noUsableCards');
    click('flash.write.exit');
    expect(exited).toBe(1);
  });

  it('scores an exact answer and moves on when asked', () => {
    mount();
    type('漢字');
    click('flash.write.check');
    expect(host.textContent).toContain('flash.write.correct');
    click('flash.write.next');
    // One card, so the round is over and the summary reports one correct.
    expect(host.textContent).toContain('flash.write.summary(correct=1,total=1,wrong=0)');
  });

  it('REFUSAL: a close answer neither scores nor advances', () => {
    deck = [greeting];
    mount();
    // One kana short of おはようございます — a slip, not a different word.
    type('おはようございす');
    click('flash.write.check');
    expect(host.textContent).toContain('flash.write.close');
    expect(host.textContent).not.toContain('flash.write.correct');
    // Still the same question — no summary, and the retype control is offered.
    expect(host.textContent).toContain('flash.write.position(position=1,total=1)');
    expect(buttons().map((b) => b.textContent)).toContain('flash.write.retype');
  });

  it('counts an override separately from a correct answer', () => {
    deck = [greeting];
    mount();
    type('おはようございす');
    click('flash.write.check');
    click('flash.write.override');
    expect(host.textContent).toContain('flash.write.summary(correct=0,total=1,wrong=0)');
    expect(host.textContent).toContain('flash.write.summaryOverrides(count=1)');
  });

  it('REFUSAL: checking an empty box says so and does not count as wrong', () => {
    mount();
    click('flash.write.check');
    expect(host.textContent).toContain('flash.write.empty');
    expect(host.textContent).toContain('flash.write.position(position=1,total=1)');
  });

  it('keeps the exit reachable while a question is open', () => {
    mount();
    expect(buttons().map((b) => b.textContent)).toContain('flash.write.exit');
    click('flash.write.exit');
    expect(exited).toBe(1);
  });

  it('names the written form when the reading was accepted', () => {
    mount();
    // The Japanese direction comes first by default, so this is card one.
    const wantsJapanese = host.textContent?.includes('flash.write.askJapanese');
    expect(wantsJapanese).toBe(true);
    type('かんじ');
    click('flash.write.check');
    expect(host.textContent).toContain('flash.write.correctViaReading(answer=漢字)');
  });
});
