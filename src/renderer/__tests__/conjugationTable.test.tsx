// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConjugationAnalysis } from '../../shared/conjugationClass';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
    lang: 'en',
  }),
}));

import ConjugationTable from '../components/lexicon/ConjugationTable';

const ICHIDAN: ConjugationAnalysis = {
  word: '食べる',
  conjugationType: '一段',
  wordClass: 'ichidan',
  rows: [
    { form: 'polite', surface: '食べます' },
    { form: 'pastNegative', surface: '食べなかった' },
  ],
};

const NONE: ConjugationAnalysis = {
  word: '猫',
  conjugationType: null,
  wordClass: null,
  rows: [],
};

let dictConjugation: ReturnType<typeof vi.fn>;

function stubApi(reply: (word: string) => Promise<ConjugationAnalysis>): void {
  dictConjugation = vi.fn(reply);
  (window as unknown as { api: Record<string, unknown> }).api = { dictConjugation };
}

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
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
  await act(async () => {
    root?.render(node);
  });
}

/** Same root, new props — the "reader looked up a different word" transition. */
async function rerender(node: ReactNode): Promise<void> {
  await act(async () => {
    root?.render(node);
  });
}

const table = () => host.querySelector('.lexicon-conjugation');
const surfaces = () =>
  [...host.querySelectorAll('.lexicon-conjugation-surface')].map((el) => el.textContent);

describe('Conjugation table', () => {
  it('renders the analyser class and every generated form', async () => {
    stubApi(async () => ICHIDAN);
    await render(<ConjugationTable query="食べる" lang="ja" />);

    expect(table()).not.toBeNull();
    expect(surfaces()).toEqual(['食べます', '食べなかった']);
    // The IPADIC class string is shown, so the claim is checkable rather than
    // only its consequences.
    expect(host.querySelector('.lexicon-conjugation-class')?.textContent)
      .toContain('lexicon.conjugation.classIs:食べる');
    expect(host.querySelector('.lexicon-conjugation-class')?.textContent).toContain('一段');
  });

  it('labels forms with the same keys the pop-up uses when it deinflects', async () => {
    stubApi(async () => ICHIDAN);
    await render(<ConjugationTable query="食べる" lang="ja" />);

    const labels = [...host.querySelectorAll('.lexicon-conjugation-label')].map((el) => el.textContent);
    expect(labels[0]).toBe('deinflect.reason.polite');
    // pastNegative is the one form deinflect.ts has no reason id for, so it is
    // the only one that gets a key of its own.
    expect(labels[1]).toBe('lexicon.conjugation.form.pastNegative');
  });

  it('does not caption a form with another class’s suffix', async () => {
    // `FormSpec.japanese` calls the potential '〜できる', which is true of する
    // only. Across a table that spans every class it would label 食べられる as
    // 〜できる, so the pattern column is deliberately absent.
    stubApi(async () => ICHIDAN);
    await render(<ConjugationTable query="食べる" lang="ja" />);

    expect(host.querySelector('.lexicon-conjugation-pattern')).toBeNull();
    expect(table()?.textContent).not.toContain('〜できる');
  });

  it('renders nothing at all for a word with no conjugation class', async () => {
    stubApi(async () => NONE);
    await render(<ConjugationTable query="ある猫" lang="ja" />);

    expect(table()).toBeNull();
  });

  it('never asks about a word that could not produce a form', async () => {
    // The prefilter must save the round trip, not merely hide the result.
    stubApi(async () => ICHIDAN);
    await render(<ConjugationTable query="猫" lang="ja" />);

    expect(dictConjugation).not.toHaveBeenCalled();
    expect(table()).toBeNull();
  });

  it('does not analyse a lookup made in another language’s lens', async () => {
    // The query deliberately passes the shape prefilter, so this pins the
    // language guard itself: IPADIC is a Japanese dictionary and would answer
    // for a word the reader looked up as Chinese.
    stubApi(async () => ICHIDAN);
    await render(<ConjugationTable query="食べる" lang="zh" />);

    expect(dictConjugation).not.toHaveBeenCalled();
    expect(table()).toBeNull();
  });

  it('stays silent when the analyser is unavailable', async () => {
    stubApi(async () => {
      throw new Error('no tokenizer');
    });
    await render(<ConjugationTable query="食べる" lang="ja" />);

    expect(table()).toBeNull();
  });

  it('discards a slow reply for a word that is no longer being shown', async () => {
    // Bumping the run id on every query change is what stops 食べる's table from
    // landing under 帰る.
    let release: ((value: ConjugationAnalysis) => void) | null = null;
    stubApi((word) =>
      word === '食べる'
        ? new Promise<ConjugationAnalysis>((resolve) => {
          release = resolve;
        })
        : Promise.resolve({ ...ICHIDAN, word: '帰る', conjugationType: '五段・ラ行', wordClass: 'godan' }),
    );

    await render(<ConjugationTable query="食べる" lang="ja" />);
    await rerender(<ConjugationTable query="帰る" lang="ja" />);
    await act(async () => {
      release?.(ICHIDAN);
    });

    expect(host.querySelector('.lexicon-conjugation-class')?.textContent).toContain('五段・ラ行');
  });
});
