import { describe, expect, it } from 'vitest';
import {
  applyCuration,
  clearVerdict,
  curationQueue,
  hasImportedExamples,
  issueCounts,
  issueFor,
  parseCurationState,
  popHistory,
  pushHistory,
  setVerdict,
  type CurationState,
} from '../grammarCuration';
import type { NormalizedGrammarPoint } from '../data/grammar/normalize';
import type { GrammarExample, GrammarVerification } from '../data/grammar/types';
import { GRAMMAR } from '../data/grammar';

function point(
  partial: Partial<NormalizedGrammarPoint> &
    Pick<NormalizedGrammarPoint, 'id'> & { verification?: GrammarVerification },
): NormalizedGrammarPoint {
  const { verification, ...rest } = partial;
  return {
    id: partial.id,
    lang: 'ja',
    level: 'N3',
    title: '〜テスト',
    meaning: 'test',
    structure: 'x',
    explanation: 'y',
    examples: [],
    functions: [],
    categories: [],
    register: 'neutral',
    provenance: {
      source: 'test',
      tagSource: 'heuristic',
      registerSource: 'heuristic',
      categorySource: 'heuristic',
      verification: verification ?? 'imported-unreviewed',
      framework: 'jlpt',
      mappingConfidence: 1,
    },
    ...rest,
  } as NormalizedGrammarPoint;
}

const imported: GrammarExample = {
  jp: '来週までに終わらせます。',
  en: "I'll finish it by next week.",
  source: 'tatoeba',
  sourceId: '12345',
};
const authoredEx: GrammarExample = { jp: '手で書く。', en: 'Write by hand.' };

describe('issue classification', () => {
  it('routes a record to exactly one queue, with review winning', () => {
    const withImport = point({ id: 'a', examples: [imported] });
    const noEx = point({ id: 'b', examples: [], verification: 'missing' });
    const noCat = point({ id: 'c', examples: [authoredEx], categories: [] });
    const categorised = point({ id: 'd', examples: [authoredEx], categories: ['time.point'] });

    expect(issueFor(withImport, {})).toBe('imported-unreviewed');
    expect(issueFor(noEx, {})).toBe('no-examples');
    expect(issueFor(noCat, {})).toBe('no-category');
    expect(issueFor(categorised, {})).toBeNull();

    // A ruled-on record leaves the work queue even though it still lacks categories.
    const state: CurationState = { c: { examples: 'approved', reviewedAt: 1 } };
    expect(issueFor(noCat, state)).toBe('reviewed');
  });

  it('counts and filters consistently', () => {
    const pts = [
      point({ id: 'a', examples: [imported] }),
      point({ id: 'b', examples: [imported] }),
      point({ id: 'c', examples: [] }),
    ];
    const counts = issueCounts(pts, {});
    expect(counts['imported-unreviewed']).toBe(2);
    expect(counts['no-examples']).toBe(1);
    expect(curationQueue(pts, {}, 'imported-unreviewed').map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('applyCuration', () => {
  it('approval is the only route to "verified"', () => {
    const p = point({ id: 'a', examples: [imported] });
    expect(p.provenance.verification).toBe('imported-unreviewed');
    const [out] = applyCuration([p], { a: { examples: 'approved', reviewedAt: 1 } });
    expect(out.provenance.verification).toBe('verified');
  });

  it('rejection strips the imported sentences and falls back to missing', () => {
    const p = point({ id: 'a', examples: [imported] });
    const [out] = applyCuration([p], { a: { examples: 'rejected', reviewedAt: 1 } });
    expect(out.examples).toEqual([]);
    expect(out.provenance.verification).toBe('missing');
  });

  it('rejection keeps authored examples and does not mark the record missing', () => {
    const p = point({ id: 'a', examples: [authoredEx, imported], verification: 'partial' });
    const [out] = applyCuration([p], { a: { examples: 'rejected', reviewedAt: 1 } });
    expect(out.examples).toEqual([authoredEx]);
    expect(out.provenance.verification).toBe('partial');
  });

  it('never promotes a record that has no imported examples to verified', () => {
    // A stray verdict must not launder an authored-but-unreviewed record.
    const p = point({ id: 'a', examples: [authoredEx], verification: 'partial' });
    const [out] = applyCuration([p], { a: { examples: 'approved', reviewedAt: 1 } });
    expect(out.provenance.verification).toBe('partial');
  });

  it('leaves the corpus untouched when nothing has been reviewed', () => {
    const pts = [point({ id: 'a', examples: [imported] })];
    expect(applyCuration(pts, {})).toBe(pts);
  });
});

describe('verdicts and undo', () => {
  it('records and clears verdicts without mutating the previous state', () => {
    const s0: CurationState = {};
    const s1 = setVerdict(s0, ['a', 'b'], 'approved', 5);
    expect(Object.keys(s0)).toEqual([]);
    expect(s1.a.examples).toBe('approved');
    expect(s1.b.reviewedAt).toBe(5);
    const s2 = clearVerdict(s1, ['a']);
    expect(s2.a).toBeUndefined();
    expect(s2.b).toBeDefined();
  });

  it('undo walks back through bulk decisions', () => {
    let state: CurationState = {};
    let history: CurationState[] = [];

    history = pushHistory(history, state);
    state = setVerdict(state, ['a', 'b', 'c'], 'approved', 1);
    history = pushHistory(history, state);
    state = setVerdict(state, ['d'], 'rejected', 2);

    expect(Object.keys(state)).toHaveLength(4);
    const first = popHistory(history);
    expect(Object.keys(first.state!)).toHaveLength(3);
    const second = popHistory(first.history);
    expect(Object.keys(second.state!)).toHaveLength(0);
    expect(popHistory(second.history).state).toBeNull();
  });
});

describe('parseCurationState', () => {
  it('drops anything that is not a recognised verdict', () => {
    const raw = JSON.stringify({
      good: { examples: 'approved', reviewedAt: 7 },
      bogusVerdict: { examples: 'maybe', reviewedAt: 1 },
      notAnObject: 'nope',
    });
    const parsed = parseCurationState(raw);
    expect(Object.keys(parsed)).toEqual(['good']);
    expect(parsed.good.reviewedAt).toBe(7);
  });

  it('survives absent and malformed storage', () => {
    expect(parseCurationState(null)).toEqual({});
    expect(parseCurationState('{{{')).toEqual({});
    expect(parseCurationState('[1,2]')).toEqual({});
  });
});

describe('against the shipped corpus', () => {
  it('the review queue is exactly the imported-example records', () => {
    const queue = curationQueue(GRAMMAR, {}, 'imported-unreviewed');
    expect(queue.length).toBeGreaterThan(500);
    expect(queue.every(hasImportedExamples)).toBe(true);
  });

  it('approving the whole queue verifies it and nothing else', () => {
    /*
     * Some modules ship `verified` before any review happens — hsk-extra is
     * authored against the canonical taxonomy with its own examples, so nothing
     * in it is waiting on a verdict. Curation must leave those alone, which is
     * why this compares id *sets* against that baseline rather than counting:
     * a count check would pass just as well if approval quietly re-verified a
     * record the queue never contained.
     */
    const alreadyVerified = GRAMMAR
      .filter((p) => p.provenance.verification === 'verified')
      .map((p) => p.id);

    const queue = curationQueue(GRAMMAR, {}, 'imported-unreviewed');
    const state = setVerdict({}, queue.map((p) => p.id), 'approved', 1);
    const applied = applyCuration(GRAMMAR, state);

    const verified = applied.filter((p) => p.provenance.verification === 'verified');
    expect(new Set(verified.map((p) => p.id))).toEqual(
      new Set([...alreadyVerified, ...queue.map((p) => p.id)]),
    );

    // Rejecting the same set must return the corpus to where it started.
    const rejected = applyCuration(
      GRAMMAR,
      setVerdict({}, queue.map((p) => p.id), 'rejected', 1),
    );
    expect(rejected.filter((p) => p.provenance.verification === 'verified').map((p) => p.id))
      .toEqual(alreadyVerified);
    expect(rejected.some((p) => p.examples.some((e) => e.source === 'tatoeba'))).toBe(false);
  });
});
