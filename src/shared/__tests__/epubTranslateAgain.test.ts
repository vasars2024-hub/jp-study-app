/**
 * EPUB "Translate again": a repeat download used to be able to return only the
 * answers it already had — candidates kept their engine-filled values, and the
 * cloud batch served its own cache. With `fresh`, engine values are dropped and
 * translated anew; dictionary values are kept.
 */
import { describe, expect, it } from 'vitest';
import { buildFieldValuesWithSources, dropEngineTranslations, runEnrichment } from '../fieldRouter';
import { makeCandidate, makeConfig, makeFakeIO, type FakeDict } from './testUtils';
import type { MiningCandidate } from '../miningTypes';

const DICT: FakeDict = { 人間: { en: 'human being / person' } };

describe('runEnrichment fresh', () => {
  const config = makeConfig('{expression:ja}', '{meaning:en}\n{expression:ru}');

  it('reuses earlier engine values without fresh, and asks again with it', async () => {
    const first = makeFakeIO(DICT, { translator: (job) => (job.target === 'ru' ? 'старый перевод' : undefined) });
    const { candidates } = await runEnrichment([makeCandidate()], config, first.io, { });
    expect(buildFieldValuesWithSources(candidates[0], config).values['expression:ru']).toBe('старый перевод');

    const again = makeFakeIO(DICT, { translator: (job) => (job.target === 'ru' ? 'новый перевод' : undefined) });
    const kept = await runEnrichment(candidates, config, again.io);
    expect(again.state.jobs).toHaveLength(0);
    expect(buildFieldValuesWithSources(kept.candidates[0], config).values['expression:ru']).toBe('старый перевод');

    const fresh = makeFakeIO(DICT, { translator: (job) => (job.target === 'ru' ? 'новый перевод' : undefined) });
    const redone = await runEnrichment(candidates, config, fresh.io, { fresh: true });
    expect(fresh.state.jobs.some((job) => job.target === 'ru')).toBe(true);
    const { values, sources } = buildFieldValuesWithSources(redone.candidates[0], config);
    expect(values['expression:ru']).toBe('новый перевод');
    // The dictionary gloss is not an engine value: kept, not re-asked.
    expect(sources['meaning:en']).toBe('dict');
    expect(fresh.state.jobs.some((job) => job.target === 'en')).toBe(false);
    // The input candidates are not mutated.
    expect(buildFieldValuesWithSources(candidates[0], config).values['expression:ru']).toBe('старый перевод');
  });
});

describe('dropEngineTranslations', () => {
  it('drops qwen/api values and their gloss copies, keeps dict and mined ones', () => {
    const candidate: MiningCandidate = makeCandidate({
      translations: { 'expression:ru': 'api', 'expression:en': 'dict', translation: 'q', 'translation:de': 'q' },
      glosses: { en: 'dict gloss', zh: 'api gloss' },
      fieldSources: {
        'expression:ru': 'api',
        'expression:en': 'dict',
        translation: 'qwen',
        'translation:de': 'qwen',
        'meaning:zh': 'api',
        'meaning:en': 'dict',
      },
    });
    dropEngineTranslations(candidate);
    expect(candidate.translations).toEqual({ 'expression:en': 'dict' });
    expect(candidate.glosses).toEqual({ en: 'dict gloss' });
    expect(candidate.fieldSources).toEqual({ 'expression:en': 'dict', 'meaning:en': 'dict' });
  });
});
