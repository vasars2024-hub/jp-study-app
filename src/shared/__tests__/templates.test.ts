import { describe, expect, it } from 'vitest';
import { renderFieldTemplate } from '../anki';
import {
  collapseEmptySegments,
  normalizeEpubTemplateSeparators,
  buildEpubMiningValues,
} from '../epubEnrichment';
import { runEnrichment } from '../fieldRouter';
import { hasKana } from '../langs';
import { makeCandidate, makeConfig, makeFakeIO, type FakeDict } from './testUtils';

const DICT: FakeDict = {
  人間: { en: 'human being / person', ru: 'человек', zh: '人类' },
};

describe('separator normalization and empty-slot collapsing', () => {
  it('inserts the default newline between adjacent tokens', () => {
    expect(normalizeEpubTemplateSeparators('{expression:ja}{reading:ja}')).toBe(
      '{expression:ja}\n{reading:ja}',
    );
  });

  it('supports a custom separator', () => {
    expect(normalizeEpubTemplateSeparators('{a}{b}', ' — ')).toBe('{a} — {b}');
  });

  it('collapseEmptySegments removes blank lines from unfilled tokens', () => {
    expect(collapseEmptySegments('human\n\n\nにんげん')).toBe('human\nにんげん');
    // `{a} — {b} — {c}` with b unfilled renders as 'a —  — c'.
    expect(collapseEmptySegments('a —  — c', ' — ')).toBe('a — c');
  });
});

describe('end-to-end template rendering (the user-reported RU+ZH+EN back)', () => {
  const front = '{expression:ja}';
  const back = '{meaning:en}\n{expression:ru}\n{expression:zh}\n{reading:ja}\n{expression:en}';

  it('renders with no blank lines, no kana in non-JA slots, no id echoes', async () => {
    const config = makeConfig(front, back);
    const { io } = makeFakeIO(DICT);
    const { candidates } = await runEnrichment([makeCandidate()], config, io);
    const values = buildEpubMiningValues(candidates[0], config);
    const rendered = collapseEmptySegments(renderFieldTemplate(back, values));

    expect(rendered).not.toMatch(/\n\s*\n/);
    expect(rendered).not.toMatch(/\bt\d+\b/);
    const lines = rendered.split('\n');
    expect(lines.length).toBe(5);
    // Only the reading line may carry kana.
    for (const line of lines) {
      if (line === values['reading:ja']) continue;
      expect(hasKana(line)).toBe(false);
    }
  });

  it('unfilled tokens collapse cleanly when a language is uncovered and Qwen fails', async () => {
    const config = makeConfig(front, '{meaning:en}\n{expression:de}\n{reading:ja}');
    const { io } = makeFakeIO(DICT, { translator: () => undefined });
    const { candidates } = await runEnrichment([makeCandidate()], config, io);
    const values = buildEpubMiningValues(candidates[0], config);
    const rendered = collapseEmptySegments(
      renderFieldTemplate('{meaning:en}\n{expression:de}\n{reading:ja}', values),
    );
    expect(rendered.split('\n')).toHaveLength(2); // de line vanished, no blank
  });
});

describe('buildEpubMiningValues', () => {
  it('reading style option converts hiragana to katakana', () => {
    const candidate = makeCandidate();
    const hira = buildEpubMiningValues(candidate, makeConfig('{reading:ja}', '{meaning:en}'));
    expect(hira['reading:ja']).toBe('にんげん');
    const kata = buildEpubMiningValues(
      candidate,
      makeConfig('{reading:ja}', '{meaning:en}', { readingStyle: 'katakana' }),
    );
    expect(kata['reading:ja']).toBe('ニンゲン');
  });

  it('{expression:lang} takes the first gloss segment (short word form)', () => {
    const candidate = makeCandidate({ glosses: { ru: 'человек; человеческое существо' } });
    const values = buildEpubMiningValues(candidate, makeConfig('{expression:ja}', '{expression:ru}'));
    expect(values['expression:ru']).toBe('человек');
  });

  it('bare {translation} falls back through translation → gloss for the target lang', () => {
    const candidate = makeCandidate({ glosses: { ru: 'человек' } });
    const values = buildEpubMiningValues(
      candidate,
      makeConfig('{expression:ja}', '{translation}', { translationTargetLang: 'ru' }),
    );
    expect(values.translation).toBe('человек');
  });
});
