// @vitest-environment jsdom
/**
 * The Test surface, driven the way a user drives it.
 *
 * The paper builder and grader are pinned in `flashcardTest.test.ts`. What only
 * a rendered pass can show:
 *
 * - nothing on screen says right or wrong until the paper is handed in, which
 *   is the whole difference between this mode and the other three;
 * - an answer given on question 1 is still there after walking to 3 and back,
 *   rather than the host losing it on navigation;
 * - handing in with blanks DISCLOSES them and asks again, and the second press
 *   actually submits — a warning that cannot be got past is a dead control;
 * - the sheet lists every question, blanks included, with the answer on it;
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

import TestMode from '../components/flashcards/TestMode';

let host: HTMLDivElement;
let root: Root;
let exited = 0;

function mount(): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(createElement(TestMode, { onExit: () => { exited += 1; } })); });
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

/** Answer whatever the current question is, however it happens to be asked. */
function answerCurrent(): void {
  const input = host.querySelector('input') as HTMLInputElement | null;
  if (input) {
    const answer = host.querySelector('.flash-write-prompt')?.textContent ?? 'x';
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, answer);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return;
  }
  const tile = host.querySelector('.flash-match-tile') as HTMLButtonElement | null;
  if (!tile) throw new Error('question is neither written nor pickable');
  act(() => { tile.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

const six = [
  { id: 'a', word: '食べる', reading: 'たべる', meaning: 'to eat', addedAt: 1 },
  { id: 'b', word: '飲む', reading: 'のむ', meaning: 'to drink', addedAt: 2 },
  { id: 'c', word: '走る', reading: 'はしる', meaning: 'to run', addedAt: 3 },
  { id: 'd', word: '書く', reading: 'かく', meaning: 'to write', addedAt: 4 },
  { id: 'e', word: '読む', reading: 'よむ', meaning: 'to read', addedAt: 5 },
  { id: 'f', word: '見る', reading: 'みる', meaning: 'to see', addedAt: 6 },
];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  exited = 0;
  deck = six;
});

afterEach(() => {
  act(() => { root.unmount(); });
  host.remove();
});

describe('TestMode', () => {
  it('refuses a deck with nothing to ask, and still offers the exit', () => {
    deck = [{ id: 'x', word: '猫', addedAt: 1 }];
    mount();
    expect(host.textContent).toContain('flash.test.noUsableCards');
    click('flash.test.exit');
    expect(exited).toBe(1);
  });

  it('opens on question one of a paper and says which kinds it asks', () => {
    mount();
    expect(host.textContent).toContain('flash.test.position(position=1,total=6)');
    expect(host.textContent).toContain('flash.test.answered(answered=0,total=6)');
    expect(host.textContent).toContain('flash.test.kinds');
    expect(labels()).toContain('flash.test.handIn');
  });

  it('never marks an answer before the paper is handed in', () => {
    mount();
    answerCurrent();
    expect(host.textContent).toContain('flash.test.answered(answered=1,total=6)');
    // The three verdict vocabularies of the other modes must not appear.
    expect(host.textContent).not.toContain('flash.test.outcomeCorrect');
    expect(host.textContent).not.toContain('flash.test.outcomeWrong');
    expect(host.textContent).not.toContain('flash.test.score');
    expect(host.querySelector('.flash-match-tile.is-matched')).toBeNull();
    expect(host.querySelector('.flash-match-tile.is-wrong')).toBeNull();
  });

  it('keeps an answer across navigation instead of losing it on the way back', () => {
    mount();
    answerCurrent();
    click('flash.test.next');
    click('flash.test.next');
    expect(host.textContent).toContain('flash.test.position(position=3,total=6)');
    click('flash.test.back');
    click('flash.test.back');
    expect(host.textContent).toContain('flash.test.position(position=1,total=6)');
    expect(host.textContent).toContain('flash.test.answered(answered=1,total=6)');
  });

  it('cannot walk off either end of the paper', () => {
    mount();
    const back = buttons().find((b) => b.textContent === 'flash.test.back');
    expect(back?.disabled).toBe(true);
    for (let i = 0; i < 5; i += 1) click('flash.test.next');
    expect(host.textContent).toContain('flash.test.position(position=6,total=6)');
    const next = buttons().find((b) => b.textContent === 'flash.test.next');
    expect(next?.disabled).toBe(true);
  });

  it('DISCLOSURE: handing in with blanks warns once, then goes through', () => {
    mount();
    answerCurrent();
    click('flash.test.handIn');
    // Still on the paper, and told exactly how many are blank.
    expect(host.textContent).toContain('flash.test.blanksWarning(count=5)');
    expect(host.textContent).not.toContain('flash.test.score');
    click('flash.test.handInAnyway');
    expect(host.textContent).toContain('flash.test.score');
  });

  it('withdraws the warning when the user goes back and answers something', () => {
    mount();
    click('flash.test.handIn');
    expect(host.textContent).toContain('flash.test.blanksWarning(count=6)');
    answerCurrent();
    expect(host.textContent).not.toContain('flash.test.blanksWarning');
    expect(labels()).toContain('flash.test.handIn');
  });

  it('sheets every question including the blanks, each with its answer', () => {
    mount();
    click('flash.test.handIn');
    click('flash.test.handInAnyway');
    expect(host.textContent).toContain('flash.test.score(correct=0,total=6,percent=0)');
    expect(host.textContent).toContain('flash.test.blankNote(count=6)');
    const lines = Array.from(host.querySelectorAll('.flash-test-line'));
    expect(lines).toHaveLength(6);
    expect(lines.every((line) => line.textContent?.includes('flash.test.answerWas'))).toBe(true);
    expect(lines.every((line) => line.textContent?.includes('flash.test.gaveNothing'))).toBe(true);
    expect(host.querySelectorAll('.flash-test-line.is-unanswered')).toHaveLength(6);
    // A blank paper scores zero WRONG, not six — the distinction is the point.
    expect(host.textContent).not.toContain('flash.test.wrongNote');
  });

  it('starts a fresh paper from the sheet and keeps the exit reachable throughout', () => {
    mount();
    expect(labels()).toContain('flash.test.exit');
    click('flash.test.handIn');
    click('flash.test.handInAnyway');
    expect(labels()).toContain('flash.test.exit');
    click('flash.test.again');
    expect(host.textContent).toContain('flash.test.position(position=1,total=6)');
    expect(host.textContent).toContain('flash.test.answered(answered=0,total=6)');
    click('flash.test.exit');
    expect(exited).toBe(1);
  });
});
