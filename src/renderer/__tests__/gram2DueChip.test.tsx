// @vitest-environment jsdom
/** gram2 — the grammar-due chip Flashcards / Statistics show, and the Calendar day line. */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../extensionBridgeUi', () => ({ openAppSection: vi.fn() }));
vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${Object.values(vars).join(',')}` : key),
    lang: 'en',
  }),
}));

import GrammarDueChip, { GrammarDueDayLine } from '../components/grammar/GrammarDueChip';
import { enrolGrammarPoints, saveGrammarSrs } from '../grammarSrs';
import { openAppSection } from '../extensionBridgeUi';

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

async function render(node: ReactNode): Promise<void> {
  root = createRoot(host);
  await act(async () => root?.render(node));
}

function todayKey(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('GrammarDueChip', () => {
  it('is silent until grammar review is in use', async () => {
    await render(<GrammarDueChip />);
    expect(host.innerHTML).toBe('');
  });

  it('shows what is due and opens the Review tab', async () => {
    saveGrammarSrs(enrolGrammarPoints({}, ['a', 'b', 'c'], Date.now() - 1000));
    await render(<GrammarDueChip />);
    expect(host.querySelector('.gram-due-chip-count')?.textContent).toBe('gram2.due.count:3');
    await act(async () => host.querySelector<HTMLButtonElement>('.gram-due-chip-go')?.click());
    expect(openAppSection).toHaveBeenCalledWith('grammar');
  });

  it('follows a review made elsewhere', async () => {
    saveGrammarSrs(enrolGrammarPoints({}, ['a'], Date.now() - 1000));
    await render(<GrammarDueChip />);
    expect(host.querySelector('.gram-due-chip-count')).not.toBeNull();
    await act(async () => saveGrammarSrs(enrolGrammarPoints({}, ['a'], Date.now() + 86_400_000)));
    expect(host.querySelector('.gram-due-chip-count')).toBeNull();
    expect(host.querySelector('.gram-due-chip-next')?.textContent).toContain('gram2.due.nextAt');
  });
});

describe('GrammarDueDayLine', () => {
  it('counts today with a review button, and a later day without one', async () => {
    saveGrammarSrs({
      ...enrolGrammarPoints({}, ['now'], Date.now() - 1000),
      ...enrolGrammarPoints({}, ['later'], Date.now() + 2 * 86_400_000),
    });
    await render(
      <>
        <GrammarDueDayLine dateKey={todayKey()} isToday />
        <GrammarDueDayLine dateKey={todayKey(2)} isToday={false} />
        <GrammarDueDayLine dateKey={todayKey(5)} isToday={false} />
      </>,
    );
    const lines = [...host.querySelectorAll('.gram-due-day')];
    expect(lines).toHaveLength(2);
    expect(lines[0].textContent).toContain('gram2.due.count:1');
    expect(lines[0].querySelector('button')).not.toBeNull();
    expect(lines[1].querySelector('button')).toBeNull();
  });
});
