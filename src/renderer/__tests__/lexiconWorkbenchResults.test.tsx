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

const agentHandoff = vi.hoisted(() => ({ handOffToAgent: vi.fn() }));
vi.mock('../agentContextHandoff', () => ({
  handOffToAgent: agentHandoff.handOffToAgent,
  lexiconPassageAgentContext: (text: string) => ({ kind: 'reading-passage', preview: text }),
  routeAgentContext: (section: string, label: string) => ({ kind: 'route', section, label }),
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
    expect(lookup).toHaveBeenCalledWith('猫を見た。', {
      sourceLangs: ['ja'], glossLangs: ['en'], withFrequency: true, withPartOfSpeech: true,
    });
    expect(host.querySelector('.lexicon-interlinear-flow')?.textContent).toContain('猫catを見た。');
    expect(host.querySelector('ruby.is-grounded')?.textContent).toContain('cat');
    expect(host.querySelector('.lexicon-explain-run')?.textContent).toBe('lexicon.explain.action');
    expect(host.querySelector('.lexicon-explain-bar')?.textContent)
      .toContain('lexicon.explain.generated');

    await act(async () => {
      host.querySelector('.lexicon-explain-run')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(agentHandoff.handOffToAgent).toHaveBeenCalledWith(
      { kind: 'reading-passage', preview: '猫を見た。' },
      'lexicon.explain.conversation',
      expect.objectContaining({ kind: 'route', section: 'dictionary' }),
    );
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
    expect(lookup).toHaveBeenCalledWith('猫', {
      sourceLangs: ['ja'], glossLangs: ['en'], withFrequency: true, withPartOfSpeech: true,
    });
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
    expect(lookup).toHaveBeenCalledWith('猫', {
      sourceLangs: ['ja'], glossLangs: ['ru'], withFrequency: true, withPartOfSpeech: true,
    });
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

    expect(lookup).toHaveBeenCalledWith('猫', {
      sourceLangs: ['ja'], glossLangs: ['ru', 'en'], withFrequency: true, withPartOfSpeech: true,
    });
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

  it('retranslates the passage under the pins, and only offers it once something is pinned', async () => {
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
            senses: [
              { index: 0, glosses: [{ lang: 'en', text: 'to see' }] },
              { index: 2, glosses: [{ lang: 'en', text: 'to look after' }] },
            ],
          },
        },
        { kind: 'separator', text: '。', start: 4, end: 5 },
      ],
    });
    const translateRun = vi.fn().mockResolvedValue({ ok: true, text: 'I looked after the cat.' });
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        lookupOfflineInterlinear: lookup,
        translateRun,
        onTranslateModelProgress: () => () => undefined,
        onTranslatePartial: () => () => undefined,
      },
    });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<LexiconWorkbenchResults query="猫を見た。" lang="ja" lookupAttempt={11} />);
      await Promise.resolve();
    });

    // With nothing pinned this would only repeat the translation already on screen.
    expect(host.querySelector('.lexicon-retranslate')).toBeNull();

    await act(async () => {
      host.querySelector('.lexicon-sense-token')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      [...host.querySelectorAll('.lexicon-sense-list button')][2]
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const run = host.querySelector<HTMLButtonElement>('.lexicon-retranslate-run');
    expect(run?.disabled).toBe(false);
    expect(host.querySelector('.lexicon-retranslate-note')?.textContent)
      .toBe('lexicon.retranslate.applied:1');
    // Pinning alone must not wake the model — the call is the reader's to make.
    expect(translateRun).not.toHaveBeenCalled();

    await act(async () => {
      run?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(translateRun.mock.calls[0][0]).toMatchObject({
      text: '猫を見た。',
      source: 'ja',
      target: 'en',
      senseHints: [{ text: '見る', reading: 'みる', gloss: 'to look after' }],
    });
    expect(host.querySelector('.lexicon-retranslate-output p')?.textContent)
      .toBe('I looked after the cat.');

    // Changing a pin makes the prose stale in a way the reader cannot see, so it goes.
    await act(async () => {
      host.querySelector('.lexicon-sense-list button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(host.querySelector('.lexicon-retranslate-output')).toBeNull();
    expect(host.querySelector('.lexicon-retranslate')).toBeNull();
  });

  it('reports an empty retranslation as the failure it is rather than a blank panel', async () => {
    const lookup = vi.fn().mockResolvedValue({
      text: '見た。', detectedLangs: ['ja'], glossLangs: ['en'], tokenCount: 1, matchedCount: 1,
      truncated: false,
      parts: [
        {
          kind: 'token', text: '見た', start: 0, end: 2,
          match: {
            text: '見る', reading: 'みる', dictId: 'jmdict-en', dictTitle: 'JMdict (English)',
            headwordId: 3,
            glosses: [{ lang: 'en', text: 'to see' }],
            senses: [
              { index: 0, glosses: [{ lang: 'en', text: 'to see' }] },
              { index: 1, glosses: [{ lang: 'en', text: 'to look after' }] },
            ],
          },
        },
      ],
    });
    // Every sentence failed the translator's validation and was dropped: `ok`, empty.
    const translateRun = vi.fn().mockResolvedValue({ ok: true, text: '   ' });
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        lookupOfflineInterlinear: lookup,
        translateRun,
        onTranslateModelProgress: () => () => undefined,
        onTranslatePartial: () => () => undefined,
      },
    });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<LexiconWorkbenchResults query="見た。" lang="ja" lookupAttempt={12} />);
      await Promise.resolve();
    });
    await act(async () => {
      host.querySelector('.lexicon-sense-token')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      [...host.querySelectorAll('.lexicon-sense-list button')][2]
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      host.querySelector('.lexicon-retranslate-run')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(host.querySelector('.lexicon-retranslate-error')?.getAttribute('role')).toBe('alert');
    expect(host.querySelector('.lexicon-retranslate-output')).toBeNull();
  });

  it('offers no retranslation when the pinned sense says nothing in the translation language', async () => {
    const lookup = vi.fn().mockResolvedValue({
      text: '見た。', detectedLangs: ['ja'], glossLangs: ['ru'], tokenCount: 1, matchedCount: 1,
      truncated: false,
      parts: [
        {
          kind: 'token', text: '見た', start: 0, end: 2,
          match: {
            text: '見る', reading: 'みる', dictId: 'jmdict-ru', dictTitle: 'JMdict (Russian)',
            headwordId: 3,
            glosses: [{ lang: 'ru', text: 'видеть' }],
            parallel: [
              {
                lang: 'ru', dictId: 'jmdict-ru', dictTitle: 'JMdict (Russian)',
                glosses: [{ lang: 'ru', text: 'видеть' }],
              },
            ],
            senses: [
              { index: 0, glosses: [{ lang: 'ru', text: 'видеть' }] },
              { index: 1, glosses: [{ lang: 'ru', text: 'присматривать' }] },
            ],
          },
        },
      ],
    });
    const translateRun = vi.fn();
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        lookupOfflineInterlinear: lookup,
        translateRun,
        onTranslateModelProgress: () => () => undefined,
        onTranslatePartial: () => () => undefined,
      },
    });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<LexiconWorkbenchResults query="見た。" lang="ja" lookupAttempt={13} glossLang="en" />);
      await Promise.resolve();
    });
    await act(async () => {
      host.querySelector('.lexicon-sense-token')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      [...host.querySelectorAll('.lexicon-sense-list button')][2]
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    // The control is present and honestly says why it cannot run, rather than
    // running and passing the model a rule it cannot apply.
    expect(host.querySelector<HTMLButtonElement>('.lexicon-retranslate-run')?.disabled).toBe(true);
    expect(host.querySelector('.lexicon-retranslate-note')?.textContent)
      .toBe('lexicon.retranslate.unusable');
    expect(translateRun).not.toHaveBeenCalled();
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
    expect(host.querySelector('.lexicon-difficulty')).toBeNull();
  });

  /** 猫を見た。 with the ranks this installation's JPDB list really returns. */
  function rankedPassage(withRanks: boolean) {
    const frequency = (rank: number) =>
      (withRanks ? { frequency: { rank, source: 'JPDB v2.2' } } : {});
    return {
      text: '猫を見た。', detectedLangs: ['ja'], glossLangs: ['en'], tokenCount: 3, matchedCount: 2,
      truncated: false,
      parts: [
        {
          kind: 'token', text: '猫', start: 0, end: 1,
          match: {
            text: '猫', reading: 'ねこ', glosses: [{ lang: 'en', text: 'cat' }], ...frequency(1509),
          },
        },
        { kind: 'separator', text: 'を', start: 1, end: 2 },
        {
          kind: 'token', text: '見た', start: 2, end: 4,
          match: {
            text: '見る', reading: 'みる', glosses: [{ lang: 'en', text: 'to see' }], ...frequency(36),
          },
        },
        { kind: 'token', text: '田中', start: 4, end: 6 },
        { kind: 'separator', text: '。', start: 6, end: 7 },
      ],
    };
  }

  it('profiles how hard the passage is from the ranks the lookup carried', async () => {
    const lookup = vi.fn().mockResolvedValue(rankedPassage(true));
    Object.defineProperty(window, 'api', { configurable: true, value: { lookupOfflineInterlinear: lookup } });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<LexiconWorkbenchResults query="猫を見た。" lang="ja" lookupAttempt={9} lens="translate" />);
      await Promise.resolve();
    });

    // Two of the three distinct words were ranked; 田中 is grounded by nothing.
    expect(host.querySelector('.lexicon-difficulty-summary')?.textContent)
      .toBe('lexicon.difficulty.coverage:2,3 lexicon.difficulty.median:773');
    const bands = [...host.querySelectorAll('.lexicon-difficulty-bands li')]
      .map((row) => row.textContent);
    expect(bands).toEqual([
      'lexicon.difficulty.bandTop:15001',
      'lexicon.difficulty.bandTop:50001',
      'lexicon.difficulty.bandTop:150000',
      'lexicon.difficulty.bandBeyond:150000',
    ]);
    // Rarest first: 猫 at 1,509 leads 見る at 36.
    expect([...host.querySelectorAll('.lexicon-difficulty-word')].map((el) => el.textContent))
      .toEqual(['猫', '見る']);
    expect(host.querySelector('.lexicon-difficulty-rank')?.textContent)
      .toBe('lexicon.difficulty.rankBadge:1509');
    expect(host.textContent).toContain('lexicon.difficulty.ungrounded:1');
    expect(host.textContent).toContain('lexicon.difficulty.sources:JPDB v2.2');
    expect(host.textContent).not.toContain('lexicon.difficulty.unscored');
  });

  it('says the lists could not speak for the passage rather than printing zeroes', async () => {
    const lookup = vi.fn().mockResolvedValue(rankedPassage(false));
    Object.defineProperty(window, 'api', { configurable: true, value: { lookupOfflineInterlinear: lookup } });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<LexiconWorkbenchResults query="猫を見た。" lang="ja" lookupAttempt={10} lens="translate" />);
      await Promise.resolve();
    });
    expect(host.querySelector('.lexicon-difficulty')?.textContent)
      .toBe('lexicon.difficulty.titlelexicon.difficulty.unscored');
    expect(host.querySelector('.lexicon-difficulty-bands')).toBeNull();
  });

  it('reads the retranslation back and reports which of the passage words came with it', async () => {
    const original = {
      text: '猫を見た。', detectedLangs: ['ja'], glossLangs: ['en'], tokenCount: 2, matchedCount: 2,
      truncated: false,
      parts: [
        {
          kind: 'token', text: '猫', start: 0, end: 1,
          match: {
            text: '猫', reading: 'ねこ', dictId: 'jmdict-en', dictTitle: 'JMdict (English)',
            headwordId: 7, glosses: [{ lang: 'en', text: 'cat' }],
          },
        },
        { kind: 'separator', text: 'を', start: 1, end: 2 },
        {
          kind: 'token', text: '見た', start: 2, end: 4,
          match: {
            text: '見る', reading: 'みる', dictId: 'jmdict-en', dictTitle: 'JMdict (English)',
            headwordId: 3,
            glosses: [{ lang: 'en', text: 'to see' }, { lang: 'en', text: 'to look after' }],
            senses: [
              { index: 0, glosses: [{ lang: 'en', text: 'to see' }] },
              { index: 2, glosses: [{ lang: 'en', text: 'to look after' }] },
            ],
          },
        },
        { kind: 'separator', text: '。', start: 4, end: 5 },
      ],
    };
    // The model's own way back: it kept 猫, dropped 見る entirely and reached
    // for 世話 instead — exactly the shape a pinned sense failing to survive has.
    const back = {
      text: '猫の世話をした。', detectedLangs: ['ja'], glossLangs: ['en'], tokenCount: 2, matchedCount: 2,
      truncated: false,
      parts: [
        {
          kind: 'token', text: '猫', start: 0, end: 1,
          match: {
            text: '猫', reading: 'ねこ', dictId: 'jmdict-en', dictTitle: 'JMdict (English)',
            headwordId: 7, glosses: [{ lang: 'en', text: 'cat' }],
          },
        },
        { kind: 'separator', text: 'の', start: 1, end: 2 },
        {
          kind: 'token', text: '世話', start: 2, end: 4,
          match: {
            text: '世話', reading: 'せわ', dictId: 'jmdict-en', dictTitle: 'JMdict (English)',
            headwordId: 9, glosses: [{ lang: 'en', text: 'care' }],
          },
        },
        { kind: 'separator', text: 'をした。', start: 4, end: 8 },
      ],
    };
    const lookup = vi.fn().mockImplementation((text: string) => Promise.resolve(
      text === '猫を見た。' ? original : back,
    ));
    const translateRun = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: 'I looked after the cat.' })
      .mockResolvedValueOnce({ ok: true, text: '猫の世話をした。' });
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        lookupOfflineInterlinear: lookup,
        translateRun,
        onTranslateModelProgress: () => () => undefined,
        onTranslatePartial: () => () => undefined,
      },
    });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<LexiconWorkbenchResults query="猫を見た。" lang="ja" lookupAttempt={21} />);
      await Promise.resolve();
    });

    await act(async () => {
      host.querySelector('.lexicon-sense-token')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      [...host.querySelectorAll('.lexicon-sense-list button')][2]
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    // There is nothing to read back before a translation has been produced.
    expect(host.querySelector('.lexicon-roundtrip')).toBeNull();

    await act(async () => {
      host.querySelector('.lexicon-retranslate-run')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    const roundTripRun = host.querySelector<HTMLButtonElement>('.lexicon-roundtrip-run');
    expect(roundTripRun).not.toBeNull();
    // Offering it is not running it: the return leg is a second model call.
    expect(translateRun).toHaveBeenCalledTimes(1);

    await act(async () => {
      roundTripRun?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    // The return leg goes back the other way, and deliberately carries no
    // hints: handing the model the pinned glosses would plant the very words
    // this check is asking whether the prose still carries.
    expect(translateRun.mock.calls[1][0]).toMatchObject({
      text: 'I looked after the cat.',
      source: 'en',
      target: 'ja',
    });
    expect(translateRun.mock.calls[1][0].senseHints).toBeUndefined();
    expect(lookup).toHaveBeenLastCalledWith('猫の世話をした。', {
      sourceLangs: ['ja'], glossLangs: ['en'],
    });

    expect(host.querySelector('.lexicon-roundtrip-output p')?.textContent).toBe('猫の世話をした。');
    expect(host.querySelector('.lexicon-roundtrip-summary')?.textContent)
      .toBe('lexicon.roundTrip.summary:1,2');
    expect(host.querySelector('.lexicon-roundtrip-pinned-lost')?.textContent)
      .toBe('lexicon.roundTrip.pinnedLost:1');
    expect(host.querySelector('.is-lost .lexicon-roundtrip-word')?.textContent).toBe('見る');
    expect(host.querySelector('.is-lost li')?.className).toBe('is-pinned');
    expect(host.querySelector('.is-lost .lexicon-roundtrip-badge')?.textContent)
      .toBe('lexicon.roundTrip.pinnedBadge');
    expect(host.querySelector('.is-added .lexicon-roundtrip-word')?.textContent).toBe('世話');
    expect(host.querySelector('.is-kept .lexicon-roundtrip-word')?.textContent).toBe('猫');

    // The diff is a statement about one translation. Repinning replaces that
    // translation, so the diff underneath it cannot outlive it.
    await act(async () => {
      host.querySelector('.lexicon-sense-list button')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(host.querySelector('.lexicon-roundtrip')).toBeNull();
  });

  it('reports an unusable back-translation as a failure rather than as a lost passage', async () => {
    const original = {
      text: '猫。', detectedLangs: ['ja'], glossLangs: ['en'], tokenCount: 1, matchedCount: 1,
      truncated: false,
      parts: [
        {
          kind: 'token', text: '猫', start: 0, end: 1,
          match: {
            text: '猫', reading: 'ねこ', dictId: 'jmdict-en', dictTitle: 'JMdict (English)',
            headwordId: 7,
            glosses: [{ lang: 'en', text: 'cat' }, { lang: 'en', text: 'kitty' }],
            senses: [
              { index: 0, glosses: [{ lang: 'en', text: 'cat' }] },
              { index: 1, glosses: [{ lang: 'en', text: 'kitty' }] },
            ],
          },
        },
        { kind: 'separator', text: '。', start: 1, end: 2 },
      ],
    };
    const lookup = vi.fn().mockResolvedValue(original);
    // Every sentence of the return leg failed the translator's validation: `ok`,
    // empty. Diffing that would report the whole passage as lost.
    const translateRun = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: 'A kitty.' })
      .mockResolvedValueOnce({ ok: true, text: '  ' });
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        lookupOfflineInterlinear: lookup,
        translateRun,
        onTranslateModelProgress: () => () => undefined,
        onTranslatePartial: () => () => undefined,
      },
    });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<LexiconWorkbenchResults query="猫。" lang="ja" lookupAttempt={22} />);
      await Promise.resolve();
    });
    await act(async () => {
      host.querySelector('.lexicon-sense-token')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      [...host.querySelectorAll('.lexicon-sense-list button')][1]
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      host.querySelector('.lexicon-retranslate-run')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      host.querySelector('.lexicon-roundtrip-run')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.querySelector('.lexicon-roundtrip-error')?.getAttribute('role')).toBe('alert');
    expect(host.querySelector('.lexicon-roundtrip-body')).toBeNull();
    // The failed leg must not have reached the offline lookup at all.
    expect(lookup).toHaveBeenCalledTimes(1);
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
      // Every state the sense-constrained retranslation can reach.
      'lexicon.retranslate.action',
      'lexicon.retranslate.title',
      'lexicon.retranslate.applied',
      'lexicon.retranslate.running',
      'lexicon.retranslate.failed',
      'lexicon.retranslate.unusable',
      // Every string the round-trip check can render, including the two that
      // only appear when the comparison could not speak for the whole passage.
      'lexicon.roundTrip.action',
      'lexicon.roundTrip.running',
      'lexicon.roundTrip.title',
      'lexicon.roundTrip.failed',
      'lexicon.roundTrip.summary',
      'lexicon.roundTrip.incomparable',
      'lexicon.roundTrip.pinnedLost',
      'lexicon.roundTrip.lost',
      'lexicon.roundTrip.added',
      'lexicon.roundTrip.kept',
      'lexicon.roundTrip.pinnedBadge',
      'lexicon.roundTrip.more',
      'lexicon.roundTrip.ungrounded',
      'lexicon.roundTrip.note',
      // Every string the difficulty profile can render, including the line that
      // replaces the whole profile when no list ranked anything.
      'lexicon.difficulty.title',
      'lexicon.difficulty.bandGroup',
      'lexicon.difficulty.bandTop',
      'lexicon.difficulty.bandBeyond',
      'lexicon.difficulty.median',
      'lexicon.difficulty.coverage',
      'lexicon.difficulty.unranked',
      'lexicon.difficulty.ungrounded',
      'lexicon.difficulty.hardest',
      'lexicon.difficulty.rankBadge',
      'lexicon.difficulty.occurrences',
      'lexicon.difficulty.sources',
      'lexicon.difficulty.unscored',
      'lexicon.difficulty.note',
      // Personal concordance is local and opt-in, with honest running, empty,
      // error and literal-match scope states.
      'lexicon.concordance.title',
      'lexicon.concordance.note',
      'lexicon.concordance.action',
      'lexicon.concordance.running',
      'lexicon.concordance.failed',
      'lexicon.concordance.empty',
      'lexicon.concordance.summary',
      'lexicon.concordance.scope',
    ];
    const catalog = en as Record<string, string>;
    expect(keys.filter((key) => !catalog[key])).toEqual([]);
  });

  it('searches owned subtitle tracks only after the user asks and renders citations', async () => {
    const lookup = vi.fn().mockResolvedValue({
      text: '猫が来た。', detectedLangs: ['ja'], glossLangs: ['en'], tokenCount: 2,
      matchedCount: 1, truncated: false,
      parts: [
        {
          kind: 'token', text: '猫', start: 0, end: 1, wordClass: 'content',
          match: {
            text: '猫', reading: 'ねこ', dictId: 'jmdict', dictTitle: 'JMdict',
            headwordId: 1, glosses: [{ lang: 'en', text: 'cat' }],
          },
        },
        { kind: 'token', text: 'が来た', start: 1, end: 4 },
        { kind: 'separator', text: '。', start: 4, end: 5 },
      ],
    });
    const listMedia = vi.fn().mockResolvedValue([
      { id: 'episode-1', path: 'D:/Anime/Episode 1.mkv', title: 'Episode 1' },
    ]);
    const subtitleForPath = vi.fn().mockResolvedValue({
      name: 'Japanese', text: '1\n00:00:04,000 --> 00:00:06,000\n猫が来た。\n',
    });
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { lookupOfflineInterlinear: lookup, listMedia, subtitleForPath },
    });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<LexiconWorkbenchResults query="猫が来た。" lang="ja" lookupAttempt={31} />);
      await Promise.resolve();
    });
    expect(listMedia).not.toHaveBeenCalled();

    await act(async () => {
      host.querySelector('.lexicon-concordance-run')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(subtitleForPath).toHaveBeenCalledWith('D:/Anime/Episode 1.mkv');
    expect(host.querySelector('.lexicon-concordance-source')?.textContent).toBe('Episode 10:04');
    expect(host.querySelector('.lexicon-concordance-list blockquote')?.textContent).toBe('猫が来た。');
    expect(host.querySelector('.lexicon-concordance-terms')?.textContent).toBe('猫');
    expect(host.textContent).toContain('lexicon.concordance.scope');
  });
});
