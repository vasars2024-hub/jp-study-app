// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../components/DictionaryResults', () => ({
  default: ({ query }: { query: string }) => <div data-testid="dictionary-results">{query}</div>,
}));

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}));

import LexiconWorkbenchResults from '../components/lexicon/LexiconWorkbenchResults';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('LexiconWorkbenchResults', () => {
  it('keeps lexical input on the full dictionary surface', async () => {
    const lookup = vi.fn();
    Object.defineProperty(window, 'api', { configurable: true, value: { lookupOfflineInterlinear: lookup } });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root?.render(<LexiconWorkbenchResults query="猫" lang="ja" lookupAttempt={1} />));
    expect(host.querySelector('[data-testid="dictionary-results"]')?.textContent).toBe('猫');
    expect(lookup).not.toHaveBeenCalled();
  });

  it('renders grounded offline interlinear rows for sentence-scale input', async () => {
    const lookup = vi.fn().mockResolvedValue({
      text: '猫を見た。', detectedLangs: ['ja'], glossLangs: ['en'], tokenCount: 2, matchedCount: 1,
      truncated: false,
      parts: [
        { kind: 'token', text: '猫', start: 0, end: 1, match: { reading: 'ねこ', glosses: [{ lang: 'en', text: 'cat' }] } },
        { kind: 'token', text: 'を見た', start: 1, end: 4 },
        { kind: 'separator', text: '。', start: 4, end: 5 },
      ],
    });
    Object.defineProperty(window, 'api', { configurable: true, value: { lookupOfflineInterlinear: lookup } });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<LexiconWorkbenchResults query="猫を見た。" lang="ja" lookupAttempt={2} />);
      await Promise.resolve();
    });
    expect(lookup).toHaveBeenCalledWith('猫を見た。', { sourceLangs: ['ja'], glossLangs: ['en'] });
    expect(host.querySelector('.lexicon-interlinear-flow')?.textContent).toContain('猫catを見た。');
    expect(host.querySelector('ruby.is-grounded')?.textContent).toContain('cat');
  });

  it('lets the user override an ambiguous automatic lens', async () => {
    const lookup = vi.fn().mockResolvedValue({
      text: '猫', detectedLangs: ['ja'], glossLangs: ['en'], tokenCount: 1, matchedCount: 0,
      truncated: false, parts: [{ kind: 'token', text: '猫', start: 0, end: 1 }],
    });
    Object.defineProperty(window, 'api', { configurable: true, value: { lookupOfflineInterlinear: lookup } });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root?.render(<LexiconWorkbenchResults query="猫" lang="ja" lookupAttempt={1} />));
    const translate = [...host.querySelectorAll('button')]
      .find((button) => button.textContent === 'lexicon.lens.interlinear');
    await act(async () => {
      translate?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(lookup).toHaveBeenCalledWith('猫', { sourceLangs: ['ja'], glossLangs: ['en'] });
    expect(host.querySelector('[data-testid="dictionary-results"]')).toBeNull();
  });

  it('lets the Translate compatibility route pin its lens and target gloss language', async () => {
    const lookup = vi.fn().mockResolvedValue({
      text: '猫', detectedLangs: ['ja'], glossLangs: ['ru'], tokenCount: 1, matchedCount: 0,
      truncated: false,
      parts: [{ kind: 'token', text: '猫', start: 0, end: 1 }],
    });
    Object.defineProperty(window, 'api', { configurable: true, value: { lookupOfflineInterlinear: lookup } });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(
        <LexiconWorkbenchResults
          query="猫"
          lang="ja"
          glossLang="ru"
          lookupAttempt={0}
          lens="translate"
        />,
      );
      await Promise.resolve();
    });
    expect(lookup).toHaveBeenCalledWith('猫', { sourceLangs: ['ja'], glossLangs: ['ru'] });
    expect(host.querySelector('.lexicon-interlinear-flow')?.textContent).toBe('猫');
    expect(host.querySelector('[data-testid="dictionary-results"]')).toBeNull();
  });

  it('asks every installed gloss language and shows each target on its own line', async () => {
    const lookup = vi.fn().mockResolvedValue({
      text: '猫', detectedLangs: ['ja'], glossLangs: ['ru', 'en'], tokenCount: 1, matchedCount: 1,
      truncated: false,
      parts: [{
        kind: 'token', text: '猫', start: 0, end: 1,
        match: {
          reading: 'ねこ',
          glosses: [{ lang: 'ru', text: 'кошка' }, { lang: 'en', text: 'cat' }],
          parallel: [
            { lang: 'ru', dictId: 'jmdict-ru', dictTitle: 'JMdict (Russian)', glosses: [{ lang: 'ru', text: 'кошка' }] },
            { lang: 'en', dictId: 'jmdict-en', dictTitle: 'JMdict (English)', glosses: [{ lang: 'en', text: 'cat' }] },
          ],
        },
      }],
    });
    const dictListYomitan = vi.fn().mockResolvedValue([
      { hasTerms: true, glossLangs: ['en'] },
      { hasTerms: true, glossLangs: ['ru'] },
      { hasTerms: true, enabled: false, glossLangs: ['fr'] },
    ]);
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { lookupOfflineInterlinear: lookup, dictListYomitan },
    });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(
        <LexiconWorkbenchResults query="猫" lang="ja" glossLang="ru" lookupAttempt={0} lens="translate" />,
      );
      await Promise.resolve();
    });

    expect(lookup).toHaveBeenCalledWith('猫', { sourceLangs: ['ja'], glossLangs: ['ru', 'en'] });
    const lines = [...host.querySelectorAll('rt .lexicon-gloss-line')].map((line) => line.textContent);
    expect(lines).toEqual(['RUкошка', 'ENcat']);
  });

  it('harvests the passage vocabulary, collapsing inflections and marking unknown words', async () => {
    const lookup = vi.fn().mockResolvedValue({
      text: '猫を見た。猫。', detectedLangs: ['ja'], glossLangs: ['en'], tokenCount: 3, matchedCount: 2,
      truncated: false,
      parts: [
        {
          kind: 'token', text: '猫', start: 0, end: 1,
          match: {
            text: '猫', reading: 'ねこ', dictId: 'jmdict-en', dictTitle: 'JMdict (English)',
            headwordId: 7, glosses: [{ lang: 'en', text: 'cat' }],
          },
        },
        { kind: 'token', text: 'を見た', start: 1, end: 4 },
        { kind: 'separator', text: '。', start: 4, end: 5 },
        {
          kind: 'token', text: '猫', start: 5, end: 6,
          match: {
            text: '猫', reading: 'ねこ', dictId: 'jmdict-en', dictTitle: 'JMdict (English)',
            headwordId: 7, glosses: [{ lang: 'en', text: 'cat' }],
          },
        },
      ],
    });
    Object.defineProperty(window, 'api', { configurable: true, value: { lookupOfflineInterlinear: lookup } });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<LexiconWorkbenchResults query="猫を見た。猫。" lang="ja" lookupAttempt={3} />);
      await Promise.resolve();
    });

    const rows = [...host.querySelectorAll('.lexicon-harvest-list li')];
    expect(rows).toHaveLength(2);
    expect(rows[0].className).toBe('is-grounded');
    expect(rows[0].querySelector('.lexicon-harvest-word')?.textContent).toBe('猫');
    expect(rows[0].querySelector('.lexicon-harvest-reading')?.textContent).toBe('ねこ');
    expect(rows[0].querySelector('.lexicon-harvest-count')?.textContent)
      .toBe('lexicon.harvest.occurrenceBadge:2');
    expect(rows[0].querySelector('.lexicon-harvest-gloss')?.textContent).toBe('cat');
    expect(rows[1].querySelector('.lexicon-harvest-gloss')?.textContent)
      .toBe('lexicon.harvest.ungrounded');
    expect(host.querySelector('.lexicon-harvest-summary')?.textContent)
      .toBe('lexicon.harvest.summary:2,1');
  });

  it('mines a harvested word with its passage sentence, and only offers rows it can answer', async () => {
    const lookup = vi.fn().mockResolvedValue({
      text: '猫を見た。ヌルポ。', detectedLangs: ['ja'], glossLangs: ['en'], tokenCount: 3,
      matchedCount: 1, truncated: false,
      parts: [
        {
          kind: 'token', text: '猫', start: 0, end: 1,
          match: {
            text: '猫', reading: 'ねこ', dictId: 'jmdict-en', dictTitle: 'JMdict (English)',
            headwordId: 7, glosses: [{ lang: 'en', text: 'cat' }],
          },
        },
        { kind: 'separator', text: 'を見た。', start: 1, end: 5 },
        { kind: 'token', text: 'ヌルポ', start: 5, end: 8 },
        { kind: 'separator', text: '。', start: 8, end: 9 },
      ],
    });
    const ankiMineNote = vi.fn().mockResolvedValue({ ok: true, noteId: 11 });
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { lookupOfflineInterlinear: lookup, ankiMineNote },
    });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<LexiconWorkbenchResults query="猫を見た。ヌルポ。" lang="ja" lookupAttempt={5} />);
      await Promise.resolve();
    });

    const rows = [...host.querySelectorAll('.lexicon-harvest-list li')];
    expect(rows).toHaveLength(2);
    // The ungrounded row would mine a card with a blank back, so it has no button.
    expect(rows[1].querySelector('.lexicon-harvest-mine')).toBeNull();

    const mine = rows[0].querySelector<HTMLButtonElement>('.lexicon-harvest-mine');
    expect(mine?.textContent).toBe('lexicon.harvest.mine');
    await act(async () => {
      mine?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(ankiMineNote).toHaveBeenCalledTimes(1);
    expect(ankiMineNote.mock.calls[0][0]).toEqual({
      route: { source: 'dictionary', cardKind: 'word', language: 'ja' },
      term: '猫',
      reading: 'ねこ',
      meaning: 'cat',
      sentence: '猫を見た。',
    });
    expect(rows[0].querySelector('.lexicon-harvest-mine')?.textContent)
      .toBe('lexicon.harvest.mined');
    expect(rows[0].querySelector<HTMLButtonElement>('.lexicon-harvest-mine')?.disabled).toBe(true);
  });

  it('keeps a failed mine retryable and shows the reason Anki gave', async () => {
    const lookup = vi.fn().mockResolvedValue({
      text: '猫を見た。', detectedLangs: ['ja'], glossLangs: ['en'], tokenCount: 1, matchedCount: 1,
      truncated: false,
      parts: [
        {
          kind: 'token', text: '猫', start: 0, end: 1,
          match: {
            text: '猫', reading: 'ねこ', dictId: 'jmdict-en', dictTitle: 'JMdict (English)',
            headwordId: 7, glosses: [{ lang: 'en', text: 'cat' }],
          },
        },
        { kind: 'separator', text: 'を見た。', start: 1, end: 5 },
      ],
    });
    const ankiMineNote = vi.fn().mockResolvedValue({ ok: false, error: 'Anki is not running' });
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { lookupOfflineInterlinear: lookup, ankiMineNote },
    });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<LexiconWorkbenchResults query="猫を見た。" lang="ja" lookupAttempt={6} />);
      await Promise.resolve();
    });

    await act(async () => {
      host.querySelector('.lexicon-harvest-mine')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const alert = host.querySelector('.lexicon-harvest-mine-error');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toBe('Anki is not running');
    const mine = host.querySelector<HTMLButtonElement>('.lexicon-harvest-mine');
    expect(mine?.disabled).toBe(false);
    expect(mine?.textContent).toBe('lexicon.harvest.mine');
  });

  it('reports a duplicate as a settled state rather than a failure', async () => {
    const lookup = vi.fn().mockResolvedValue({
      text: '猫を見た。', detectedLangs: ['ja'], glossLangs: ['en'], tokenCount: 1, matchedCount: 1,
      truncated: false,
      parts: [
        {
          kind: 'token', text: '猫', start: 0, end: 1,
          match: {
            text: '猫', reading: 'ねこ', dictId: 'jmdict-en', dictTitle: 'JMdict (English)',
            headwordId: 7, glosses: [{ lang: 'en', text: 'cat' }],
          },
        },
        { kind: 'separator', text: 'を見た。', start: 1, end: 5 },
      ],
    });
    const ankiMineNote = vi.fn().mockResolvedValue({ ok: false, error: 'duplicate' });
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { lookupOfflineInterlinear: lookup, ankiMineNote },
    });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<LexiconWorkbenchResults query="猫を見た。" lang="ja" lookupAttempt={7} />);
      await Promise.resolve();
    });
    await act(async () => {
      host.querySelector('.lexicon-harvest-mine')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const mine = host.querySelector<HTMLButtonElement>('.lexicon-harvest-mine');
    expect(mine?.textContent).toBe('lexicon.harvest.mineDuplicate');
    expect(mine?.disabled).toBe(true);
    expect(host.querySelector('.lexicon-harvest-mine-error')).toBeNull();
  });

  it('pins the sense a passage used, through the gloss line, the harvest row and the card', async () => {
    const senses = [
      { index: 0, glosses: [{ lang: 'en', text: 'to see' }] },
      { index: 2, glosses: [{ lang: 'en', text: 'to look after' }] },
    ];
    const lookup = vi.fn().mockResolvedValue({
      text: '猫を見た。', detectedLangs: ['ja'], glossLangs: ['en'], tokenCount: 2, matchedCount: 1,
      truncated: false,
      parts: [
        { kind: 'separator', text: '猫を', start: 0, end: 2 },
        {
          kind: 'token', text: '見た', start: 2, end: 4,
          match: {
            text: '見る', reading: 'みる', dictId: 'jmdict-en', dictTitle: 'JMdict (English)',
            headwordId: 3,
            glosses: [{ lang: 'en', text: 'to see' }, { lang: 'en', text: 'to look after' }],
            senses,
          },
        },
        { kind: 'separator', text: '。', start: 4, end: 5 },
      ],
    });
    const ankiMineNote = vi.fn().mockResolvedValue({ ok: true, noteId: 12 });
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { lookupOfflineInterlinear: lookup, ankiMineNote },
    });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<LexiconWorkbenchResults query="猫を見た。" lang="ja" lookupAttempt={8} />);
      await Promise.resolve();
    });

    expect(host.querySelector('.lexicon-harvest-gloss')?.textContent).toBe('to see; to look after');
    // The picker only opens on demand, so the flow is not covered by a panel.
    expect(host.querySelector('.lexicon-sense-panel')).toBeNull();

    const token = host.querySelector<HTMLButtonElement>('.lexicon-sense-token');
    expect(token?.getAttribute('aria-label')).toBe('lexicon.sense.choose:見た');
    await act(async () => {
      token?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const options = [...host.querySelectorAll('.lexicon-sense-list button')];
    expect(options.map((option) => option.textContent))
      .toEqual(['lexicon.sense.none', '1to see', '3to look after']);
    // Nothing is pinned yet, so "all senses" is the pressed option.
    expect(options[0].getAttribute('aria-pressed')).toBe('true');
    // The gloss is the visible label, so it has to reach the accessible name too.
    expect(options[2].getAttribute('aria-label')).toBe('lexicon.sense.use:3,to look after');

    await act(async () => {
      options[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(host.querySelector('ruby.is-pinned rt')?.textContent).toBe('to look after');
    expect(host.querySelector('.lexicon-harvest-gloss')?.textContent).toBe('to look after');
    expect([...host.querySelectorAll('.lexicon-sense-list button')]
      .map((option) => option.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);

    await act(async () => {
      host.querySelector('.lexicon-harvest-mine')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(ankiMineNote.mock.calls[0][0]).toMatchObject({
      term: '見る',
      meaning: 'to look after',
      sentence: '猫を見た。',
    });

    // Clearing the pin returns the token to every sense the dictionary supplied.
    await act(async () => {
      host.querySelector('.lexicon-sense-list button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(host.querySelector('ruby.is-pinned')).toBeNull();
    expect(host.querySelector('.lexicon-harvest-gloss')?.textContent).toBe('to see; to look after');
  });

  it('leaves a single-sense token as plain reading flow rather than a control', async () => {
    const lookup = vi.fn().mockResolvedValue({
      text: '猫', detectedLangs: ['ja'], glossLangs: ['en'], tokenCount: 1, matchedCount: 1,
      truncated: false,
      parts: [{
        kind: 'token', text: '猫', start: 0, end: 1,
        match: {
          text: '猫', reading: 'ねこ', dictId: 'jmdict-en', dictTitle: 'JMdict (English)',
          headwordId: 7, glosses: [{ lang: 'en', text: 'cat' }],
        },
      }],
    });
    Object.defineProperty(window, 'api', { configurable: true, value: { lookupOfflineInterlinear: lookup } });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<LexiconWorkbenchResults query="猫" lang="ja" lookupAttempt={9} lens="translate" />);
      await Promise.resolve();
    });

    expect(host.querySelector('.lexicon-sense-token')).toBeNull();
    expect(host.querySelector('ruby.is-grounded')?.textContent).toContain('cat');
  });

  it('leaves the harvest out entirely when nothing was segmented', async () => {
    const lookup = vi.fn().mockResolvedValue({
      text: '。', detectedLangs: ['ja'], glossLangs: ['en'], tokenCount: 0, matchedCount: 0,
      truncated: false, parts: [{ kind: 'separator', text: '。', start: 0, end: 1 }],
    });
    Object.defineProperty(window, 'api', { configurable: true, value: { lookupOfflineInterlinear: lookup } });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<LexiconWorkbenchResults query="。" lang="ja" lookupAttempt={4} lens="translate" />);
      await Promise.resolve();
    });
    expect(host.querySelector('.lexicon-harvest')).toBeNull();
  });

  it('has a real catalog string for every lens label and overridable scale', async () => {
    const { en } = await import('../../shared/i18n/catalogs/en');
    const keys = [
      'lexicon.lens.group',
      'lexicon.lens.auto',
      'lexicon.lens.lookup',
      'lexicon.lens.interlinear',
      // A manual lens sends character/word input through the interlinear meta line.
      'lexicon.kind.character',
      'lexicon.kind.word',
      'lexicon.kind.sentence',
      'lexicon.kind.paragraph',
      'lexicon.kind.document',
      // Every harvest string the panel can render, including both honest
      // empty-gloss labels.
      'lexicon.harvest.title',
      'lexicon.harvest.summary',
      'lexicon.harvest.capped',
      'lexicon.harvest.occurrenceBadge',
      'lexicon.harvest.occurrences',
      'lexicon.harvest.ungrounded',
      'lexicon.harvest.noGloss',
      // Every mining state a harvest row can reach.
      'lexicon.harvest.mine',
      'lexicon.harvest.mineWord',
      'lexicon.harvest.mining',
      'lexicon.harvest.mined',
      'lexicon.harvest.mineDuplicate',
      'lexicon.harvest.mineFailed',
      // Every string the sense picker can render.
      'lexicon.sense.choose',
      'lexicon.sense.group',
      'lexicon.sense.none',
      'lexicon.sense.use',
      'lexicon.sense.close',
    ];
    const catalog = en as Record<string, string>;
    expect(keys.filter((key) => !catalog[key])).toEqual([]);
  });
});
