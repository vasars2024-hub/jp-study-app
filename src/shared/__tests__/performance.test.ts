import { describe, expect, it } from 'vitest';
import { runEnrichment } from '../fieldRouter';
import { buildEpubDeckExport } from '../epubDeck';
import type { EpubMiningAnalysis, MiningCandidate } from '../mining';
import { makeCandidate, makeConfig, makeFakeIO, type FakeDict } from './testUtils';

const DECK_SIZE = 7000;

function makeBigDict(candidates: MiningCandidate[]): FakeDict {
  const dict: FakeDict = {};
  for (const c of candidates) {
    dict[c.expression] = {
      en: `meaning of ${c.expression}`,
      ru: `значение слова номер ${c.expression.length}`,
      zh: '词义',
    };
  }
  return dict;
}

describe(`large-deck performance (${DECK_SIZE} candidates)`, () => {
  it('fully dictionary-covered deck enriches in seconds with zero Qwen calls', async () => {
    const candidates = Array.from({ length: DECK_SIZE }, (_, i) =>
      makeCandidate({ expression: `語彙${i}`, reading: 'ごい', sampleSentence: `語彙${i}を使う文。` }),
    );
    const config = makeConfig(
      '{expression:ja}\n{reading:ja}',
      '{meaning:en}\n{expression:ru}\n{expression:zh}',
    );
    const { io, state } = makeFakeIO(makeBigDict(candidates));

    const start = Date.now();
    const outcome = await runEnrichment(candidates, config, io);
    const analysis: EpubMiningAnalysis = {
      itemId: 'perf',
      title: 'Perf',
      totalCharacters: 0,
      analyzer: 'kuromoji',
      candidates: outcome.candidates,
      generatedAt: Date.now(),
    };
    const deck = buildEpubDeckExport(analysis, config, undefined, { skipFilter: true });
    const elapsed = Date.now() - start;

    expect(state.translateCalls).toBe(0);
    expect(deck.cardCount).toBe(DECK_SIZE);
    expect(deck.rows[0].back).toContain('meaning of');
    expect(elapsed).toBeLessThan(10000);
  }, 30000);

  it('identical (text, source, target) jobs are deduped before hitting Qwen', async () => {
    // 200 candidates sharing 1 uncovered word each way — but same gloss text.
    const candidates = Array.from({ length: 200 }, (_, i) =>
      makeCandidate({ expression: '朧月', reading: 'おぼろづき', sampleSentence: `文${i}。` }),
    );
    const config = makeConfig('{expression:ja}', '{expression:ru}');
    const { io, state } = makeFakeIO({}, { translator: () => 'туманная луна' });
    await runEnrichment(candidates, config, io);
    expect(state.jobs.filter((j) => !j.strict)).toHaveLength(1);
  });
});
