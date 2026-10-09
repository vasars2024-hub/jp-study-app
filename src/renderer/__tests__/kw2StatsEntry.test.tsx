// @vitest-environment jsdom
/**
 * kw2 / gram2 — where Statistics surfaces them: "Manage words" opens the bulk manager
 * (loaded on demand), and the grammar section says what grammar review owes today.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../components/Icons', () => ({ default: () => null }));
vi.mock('../components/LevelMeter', () => ({ LevelMeter: () => null }));
vi.mock('../ankiSync', () => ({ syncKnowledgeFromAnki: vi.fn() }));
vi.mock('../extensionBridgeUi', () => ({ openAppSection: vi.fn() }));
vi.mock('../i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../i18n')>()),
  useT: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${Object.values(vars).join(',')}` : key),
    lang: 'en',
  }),
}));
vi.mock('../reviewLog', () => ({
  loadReviewLog: async () => [],
  onReviewLogChanged: () => () => undefined,
}));
vi.mock('../components/knownWords/KnownWordsManager', () => ({
  default: () => <div data-testid="kw2-manager" />,
}));

import { StatsGrammar, WordKnowledge } from '../components/stats/StatsContent';
import { setGrammarCorpusForTests } from '../grammarProgress';
import { enrolGrammarPoints, saveGrammarSrs } from '../grammarSrs';

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  setGrammarCorpusForTests([]);
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  setGrammarCorpusForTests(null);
});

describe('Statistics entry points', () => {
  it('opens the known-words manager from Word knowledge', async () => {
    root = createRoot(host);
    await act(async () => root?.render(<WordKnowledge />));
    const toggle = host.querySelector<HTMLButtonElement>('.kw2-manage-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('[data-testid="kw2-manager"]')).toBeNull();
    await act(async () => {
      toggle.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('[data-testid="kw2-manager"]')).not.toBeNull();
  });

  it('shows grammar due today in the grammar section', async () => {
    saveGrammarSrs(enrolGrammarPoints({}, ['a', 'b'], Date.now() - 1000));
    root = createRoot(host);
    await act(async () => root?.render(<StatsGrammar />));
    expect(host.querySelector('.stats-grammar .gram-due-chip-count')?.textContent).toBe('gram2.due.count:2');
  });
});
