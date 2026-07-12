import { describe, expect, it } from 'vitest';
import { runEnrichment, buildFieldValuesWithSources, decorateFsValues, computeFillReport, FS_MARKER } from '../fieldRouter';
import { buildEpubMiningValues, needsEnrichmentLookup } from '../epubEnrichment';
import { makeCandidate, makeConfig, makeFakeIO, type FakeDict } from './testUtils';

/** JMdict-style fake: 人間 covered in EN/RU/ZH, 葦 only in EN, 朧月 nowhere. */
const DICT: FakeDict = {
  人間: { en: 'human being / person', ru: 'человек; человеческое существо', zh: '人类' },
  葦: { en: 'reed' },
};

describe('router matrix — dictionary vs Qwen per base and language', () => {
  const langs = ['en', 'ru', 'zh', 'de'] as const;

  for (const lang of langs) {
    it(`{expression:${lang}} uses the dictionary when covered, Qwen otherwise`, async () => {
      const config = makeConfig('{expression:ja}', `{expression:${lang}}`);
      const { io, state } = makeFakeIO(DICT);
      const { candidates } = await runEnrichment([makeCandidate()], config, io);
      const values = buildEpubMiningValues(candidates[0], config);
      const covered = Boolean(DICT['人間'][lang]);
      expect(values[`expression:${lang}`]).toBeTruthy();
      if (covered) {
        // No LLM job for a dictionary-covered language.
        expect(state.jobs.filter((j) => j.target === lang)).toHaveLength(0);
      } else {
        expect(state.jobs.some((j) => j.target === lang)).toBe(true);
      }
    });

    it(`{meaning:${lang}} routes the same way`, async () => {
      const config = makeConfig('{expression:ja}', `{meaning:${lang}}`);
      const { io, state } = makeFakeIO(DICT);
      const { candidates } = await runEnrichment([makeCandidate()], config, io);
      const values = buildEpubMiningValues(candidates[0], config);
      expect(values[`meaning:${lang}`]).toBeTruthy();
      const covered = Boolean(DICT['人間'][lang]);
      expect(state.jobs.some((j) => j.target === lang)).toBe(!covered);
    });
  }

  it('{expression:ja} and {reading:ja} are raw mined data — never routed', async () => {
    const config = makeConfig('{expression:ja}\n{reading:ja}', '{meaning:en}');
    const { io, state } = makeFakeIO(DICT);
    const { candidates } = await runEnrichment([makeCandidate()], config, io);
    const values = buildEpubMiningValues(candidates[0], config);
    expect(values['expression:ja']).toBe('人間');
    expect(values['reading:ja']).toBe('にんげん');
    expect(state.jobs).toHaveLength(0);
  });

  it('non-JA reading refs are dropped as fluff (no jobs, no gloss langs)', () => {
    const needs = needsEnrichmentLookup('{expression:ja}', '{reading:ru}\n{reading:en}');
    expect(needs.translationRefs).toHaveLength(0);
    expect(needs.glossLangs).toHaveLength(0);
  });

  it('sentences always go to Qwen — dictionaries cannot translate sentences', async () => {
    const config = makeConfig('{expression:ja}', '{sentence:ja}\n{sentence-translation:en}', {
      translateSentences: true,
    });
    const { io, state } = makeFakeIO(DICT, {
      translator: (job) => (job.target === 'en' ? 'Man is a thinking reed.' : undefined),
    });
    const { candidates } = await runEnrichment([makeCandidate()], config, io);
    const sentJobs = state.jobs.filter((j) => j.text === '人間は考える葦である。');
    expect(sentJobs.length).toBeGreaterThan(0);
    const values = buildEpubMiningValues(candidates[0], config);
    expect(values['sentence-translation:en']).toBe('Man is a thinking reed.');
  });
});

describe('fail-switch chains', () => {
  it('word in JMdict-EN but not RU: {expression:ru} falls back to Qwen and is tagged qwen', async () => {
    const config = makeConfig('{expression:ja}', '{expression:ru}');
    const { io, state } = makeFakeIO(DICT, {
      translator: (job) => (job.target === 'ru' ? 'тростник' : undefined),
    });
    const { candidates } = await runEnrichment([makeCandidate({ expression: '葦', reading: 'あし' })], config, io);
    const { values, sources } = buildFieldValuesWithSources(candidates[0], config);
    expect(values['expression:ru']).toBe('тростник');
    expect(sources['expression:ru']).toBe('qwen');
    // Qwen job used the EN gloss as source, not the bare JA headword.
    const job = state.jobs.find((j) => j.target === 'ru');
    expect(job?.source).toBe('en');
    expect(job?.text).toContain('reed');
  });

  it('dictionary-covered slots are tagged dict and get no FS marker', async () => {
    const config = makeConfig('{expression:ja}', '{expression:ru}');
    const { io } = makeFakeIO(DICT);
    const { candidates } = await runEnrichment([makeCandidate()], config, io);
    const { values, sources } = buildFieldValuesWithSources(candidates[0], config);
    expect(sources['expression:ru']).toBe('dict');
    const decorated = decorateFsValues(values, sources);
    expect(decorated['expression:ru']).not.toContain('[FS]');
  });

  it('FS marker appears on Qwen fail-switch values when enabled', async () => {
    const config = makeConfig('{expression:ja}', '{expression:ru}');
    const { io } = makeFakeIO(DICT, { translator: () => 'тростник' });
    const { candidates } = await runEnrichment([makeCandidate({ expression: '葦', reading: 'あし' })], config, io);
    const { values, sources } = buildFieldValuesWithSources(candidates[0], config);
    const decorated = decorateFsValues(values, sources);
    expect(decorated['expression:ru']).toBe(`тростник${FS_MARKER}`);
  });

  it('word in no dictionary at all: whole card still generated from Qwen', async () => {
    const config = makeConfig('{expression:ja}', '{meaning:en}\n{expression:ru}');
    const { io } = makeFakeIO(DICT, {
      translator: (job) => (job.target === 'en' ? 'hazy moon' : job.target === 'ru' ? 'туманная луна' : undefined),
    });
    const rare = makeCandidate({ expression: '朧月', reading: 'おぼろづき' });
    const { candidates } = await runEnrichment([rare], config, io);
    const { values, sources } = buildFieldValuesWithSources(candidates[0], config);
    expect(values['meaning:en']).toBe('hazy moon');
    expect(values['expression:ru']).toBe('туманная луна');
    expect(sources['meaning:en']).toBe('qwen');
    expect(sources['expression:ru']).toBe('qwen');
  });

  it('Qwen also failing: slot flagged missing in the fill report, warning surfaced', async () => {
    const config = makeConfig('{expression:ja}', '{expression:ru}');
    const { io } = makeFakeIO(DICT, { translator: () => undefined });
    const rare = makeCandidate({ expression: '朧月', reading: 'おぼろづき' });
    const { candidates, warnings } = await runEnrichment([rare], config, io);
    const report = computeFillReport(candidates, config);
    const row = report.tokens.find((t) => t.token === 'expression:ru');
    expect(row?.missing).toBe(1);
    expect(report.incompleteCount).toBe(1);
    expect(warnings.some((w) => /could not be translated/i.test(w))).toBe(true);
  });
});

describe('Qwen failure modes — router degrades, never crashes', () => {
  it('model unavailable up-front: dictionary values kept, visible warning', async () => {
    const config = makeConfig('{expression:ja}', '{expression:ru}\n{expression:de}');
    const { io, state } = makeFakeIO(DICT, { translateAvailable: false });
    const { candidates, warnings } = await runEnrichment([makeCandidate()], config, io);
    expect(state.translateCalls).toBe(0);
    const values = buildEpubMiningValues(candidates[0], config);
    // RU came from the dictionary and survives; DE stays empty.
    expect(values['expression:ru']).toBeTruthy();
    expect(values['expression:de'] ?? '').toBe('');
    expect(warnings.some((w) => /not available/i.test(w))).toBe(true);
  });

  it('engine throwing repeatedly: aborts with a warning, dictionary values unaffected', async () => {
    const config = makeConfig('{expression:ja}', '{expression:ru}\n{expression:de}');
    const { io } = makeFakeIO(DICT, { translateThrows: true });
    const { candidates, warnings } = await runEnrichment(
      Array.from({ length: 100 }, (_, i) => makeCandidate({ expression: `語${i}`, sampleSentence: `語${i}の文。` })),
      config,
      io,
    );
    expect(warnings.some((w) => /failed repeatedly/i.test(w))).toBe(true);
    expect(candidates).toHaveLength(100);
  });

  it('id-echo output (t0 as text) is rejected, retried, then flagged missing', async () => {
    const config = makeConfig('{expression:ja}', '{expression:de}');
    const { io, state } = makeFakeIO(DICT, { translator: (job) => job.id });
    const { candidates } = await runEnrichment([makeCandidate()], config, io);
    const values = buildEpubMiningValues(candidates[0], config);
    expect(values['expression:de'] ?? '').toBe('');
    // A stricter retry was attempted after the invalid first pass.
    expect(state.jobs.some((j) => j.strict)).toBe(true);
  });

  it('partial batch (some ids absent) — present items land, absent ones retried then missing', async () => {
    const config = makeConfig('{expression:ja}', '{expression:de}');
    const { io } = makeFakeIO(DICT, {
      translator: (job) => (job.text.includes('human') ? 'Mensch' : undefined),
    });
    const covered = makeCandidate();
    const missing = makeCandidate({ expression: '朧月', reading: 'おぼろづき', sampleSentence: '朧月の夜。' });
    const { candidates } = await runEnrichment([covered, missing], config, io);
    const v0 = buildEpubMiningValues(candidates[0], config);
    const v1 = buildEpubMiningValues(candidates[1], config);
    expect(v0['expression:de']).toBe('Mensch');
    expect(v1['expression:de'] ?? '').toBe('');
  });

  it('wrong-script output (kana leak into RU) is rejected by validation', async () => {
    const config = makeConfig('{expression:ja}', '{expression:de}');
    const { io } = makeFakeIO({}, { translator: () => 'ニンゲン' });
    const { candidates } = await runEnrichment([makeCandidate()], config, io);
    const values = buildEpubMiningValues(candidates[0], config);
    expect(values['expression:de'] ?? '').toBe('');
  });
});

describe('glossOnly mode (analyze path)', () => {
  it('skips Qwen entirely when glossOnly is set', async () => {
    const config = makeConfig('{expression:ja}', '{expression:ru}\n{expression:de}');
    const { io, state } = makeFakeIO({}, { translator: () => 'should not run' });
    await runEnrichment([makeCandidate()], config, io, { glossOnly: true });
    expect(state.translateCalls).toBe(0);
    expect(state.jobs).toHaveLength(0);
  });

  it('still attaches dictionary glosses and fills expression slots in the fill report', async () => {
    const config = makeConfig('{expression:ja}', '{expression:ru}\n{expression:en}');
    const { io } = makeFakeIO(DICT);
    const { candidates } = await runEnrichment([makeCandidate()], config, io, { glossOnly: true });
    expect(candidates[0].glosses?.ru).toBe('человек; человеческое существо');
    const report = computeFillReport(candidates, config);
    const ru = report.tokens.find((t) => t.token === 'expression:ru');
    const en = report.tokens.find((t) => t.token === 'expression:en');
    expect(ru).toMatchObject({ dict: 1, qwen: 0, missing: 0, total: 1 });
    expect(en).toMatchObject({ dict: 1, qwen: 0, missing: 0, total: 1 });
  });
});

describe('cancellation', () => {
  it('cancel between gloss batches stops the run and reports cancelled', async () => {
    const config = makeConfig('{expression:ja}', '{meaning:en}');
    let calls = 0;
    const { io } = makeFakeIO(DICT, { shouldCancel: () => calls++ > 0 });
    const many = Array.from({ length: 1200 }, (_, i) =>
      makeCandidate({ expression: `語${i}`, sampleSentence: `語${i}の文。` }),
    );
    const outcome = await runEnrichment(many, config, io);
    expect(outcome.cancelled).toBe(true);
  });
});

describe('fill report', () => {
  it('groups counts by source: dict / qwen / mined / missing', async () => {
    const config = makeConfig('{expression:ja}', '{expression:ru}');
    const { io } = makeFakeIO(DICT, {
      translator: (job) => (job.text.includes('reed') ? 'тростник' : undefined),
    });
    const covered = makeCandidate(); // dict RU
    const fallback = makeCandidate({ expression: '葦', reading: 'あし', sampleSentence: '葦の原。' }); // qwen
    const missing = makeCandidate({ expression: '朧月', reading: 'おぼろづき', sampleSentence: '朧月の夜。' });
    const { candidates } = await runEnrichment([covered, fallback, missing], config, io);
    const report = computeFillReport(candidates, config);
    const ru = report.tokens.find((t) => t.token === 'expression:ru');
    expect(ru).toMatchObject({ dict: 1, qwen: 1, missing: 1, total: 3 });
    const ja = report.tokens.find((t) => t.token === 'expression:ja');
    expect(ja?.mined).toBe(3);
    expect(report.incompleteCount).toBe(1);
  });
});
