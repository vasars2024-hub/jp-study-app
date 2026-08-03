// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildSession,
  canBuild,
  clozeCore,
  clozeFor,
  makeRng,
  parseSessionOptions,
  snapshotSessionOptions,
  DEFAULT_SESSION_OPTIONS,
  MASTERED_LEVEL,
  QUESTION_TYPES,
  SESSION_DIRECTIONS,
  TYPE_DIRECTION,
  type SessionOptions,
} from '../grammarSession';
import { GX_KNOWN_THRESHOLD, setFamiliarity, type FamiliarityState } from '../grammarFamiliarity';
import type { NormalizedGrammarPoint } from '../data/grammar/normalize';
import type { GrammarExample } from '../data/grammar/types';
import { GRAMMAR } from '../data/grammar';

function point(
  partial: Partial<NormalizedGrammarPoint> & Pick<NormalizedGrammarPoint, 'id'>,
): NormalizedGrammarPoint {
  return {
    lang: 'ja',
    level: 'N3',
    title: '〜テスト',
    meaning: 'test meaning',
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
      verification: 'partial',
      framework: 'jlpt',
      mappingConfidence: 1,
    },
    ...partial,
  } as NormalizedGrammarPoint;
}

/** A pool big enough that multiple-choice can always find 3 distinct wrongs. */
function pool(n: number): NormalizedGrammarPoint[] {
  return Array.from({ length: n }, (_, i) =>
    point({ id: `p${i}`, title: `〜patt${i}`, meaning: `meaning ${i}` }),
  );
}

const rng = (): (() => number) => makeRng(42);

describe('cloze eligibility is under-inclusive on purpose', () => {
  it('refuses a short all-kana core, as the importer does', () => {
    // んで / ずに are exactly the cases morpheme-boundary agreement could not
    // separate at build time; a runtime substring match must not be bolder.
    expect(clozeCore('〜んで')).toBe('');
    expect(clozeCore('〜ずに')).toBe('');
    // This bites common patterns too, and that is the intended cost: ながら is
    // three kana, so it is refused despite being perfectly ordinary grammar.
    // Under-inclusive beats a blank the user cannot trust.
    expect(clozeCore('〜ながら')).toBe('');
  });

  it('accepts a long kana core or anything containing a kanji', () => {
    expect(clozeCore('〜からには')).toBe('からには');
    expect(clozeCore('〜前に')).toBe('前に');
  });

  it('drops bracketed English annotations, unlike grammarTitleKey', () => {
    // grammarTitleKey keeps bracket contents because it builds a dedupe key;
    // that would yield "がsubjectparticle", which is not findable in a sentence.
    expect(clozeCore('〜が (subject particle)')).toBe('');
    expect(clozeCore('〜ものだから (because)')).toBe('ものだから');
  });

  it('takes only the first alternative from a title listing several', () => {
    // Blanking a concatenation of both forms would never match the sentence.
    expect(clozeCore('〜からには / 〜以上は')).toBe('からには');
  });

  it('needs the core to occur verbatim in an example', () => {
    const withHit = point({
      id: 'a',
      title: '〜からには',
      examples: [{ jp: '約束したからには守ります。', en: 'Since I promised, I will keep it.' }],
    });
    const material = clozeFor(withHit);
    expect(material?.core).toBe('からには');
    expect(material?.blanked).toBe('約束した＿＿＿守ります。');
    expect(material?.sentence).toBe('約束したからには守ります。');

    const noHit = point({
      id: 'b',
      title: '〜からには',
      examples: [{ jp: '全然ちがう文です。', en: 'A different sentence.' }],
    });
    expect(clozeFor(noHit)).toBeNull();
    expect(canBuild(noHit, 'cloze')).toBe(false);
  });
});

describe('direction gates the question types', () => {
  it('maps every declared type to a direction', () => {
    for (const t of QUESTION_TYPES) expect(TYPE_DIRECTION[t]).toBeTruthy();
    expect(SESSION_DIRECTIONS).toContain('mixed');
  });

  it('recognition deals no production questions and vice versa', () => {
    const opts: SessionOptions = {
      ...DEFAULT_SESSION_OPTIONS,
      count: 10,
      direction: 'recognition',
      types: [...QUESTION_TYPES],
    };
    const recog = buildSession(pool(30), {}, opts, rng());
    expect(recog.questions.length).toBeGreaterThan(0);
    expect(recog.questions.every((q) => TYPE_DIRECTION[q.type] === 'recognition')).toBe(true);

    const prod = buildSession(pool(30), {}, { ...opts, direction: 'production' }, rng());
    expect(prod.questions.every((q) => TYPE_DIRECTION[q.type] === 'production')).toBe(true);
  });

  it('returns an empty plan when direction and types cannot agree', () => {
    const plan = buildSession(
      pool(30),
      {},
      { ...DEFAULT_SESSION_OPTIONS, direction: 'production', types: ['meaning-choice'] },
      rng(),
    );
    expect(plan.delivered).toBe(0);
    expect(plan.unusableTypes).toEqual(['meaning-choice']);
  });
});

describe('mastered handling', () => {
  const points = pool(20);
  const mastered: FamiliarityState = setFamiliarity(
    setFamiliarity({}, 'p0', MASTERED_LEVEL),
    'p1',
    MASTERED_LEVEL,
  );

  it('excludes mastered points by default', () => {
    const plan = buildSession(points, mastered, { ...DEFAULT_SESSION_OPTIONS, count: 20 }, rng());
    expect(plan.poolSize).toBe(18);
    expect(plan.questions.some((q) => q.id === 'p0' || q.id === 'p1')).toBe(false);
  });

  it('can practise only the mastered ones', () => {
    const plan = buildSession(
      points,
      mastered,
      { ...DEFAULT_SESSION_OPTIONS, count: 20, mastered: 'only' },
      rng(),
    );
    expect(plan.poolSize).toBe(2);
    expect(plan.questions.every((q) => q.id === 'p0' || q.id === 'p1')).toBe(true);
  });

  it('include puts the whole pool back', () => {
    const plan = buildSession(
      points,
      mastered,
      { ...DEFAULT_SESSION_OPTIONS, count: 20, mastered: 'include' },
      rng(),
    );
    expect(plan.poolSize).toBe(20);
  });

  it('treats Familiar as still worth reviewing, unlike Known', () => {
    // MASTERED_LEVEL must not collapse into GX_KNOWN_THRESHOLD.
    expect(MASTERED_LEVEL).toBeGreaterThan(GX_KNOWN_THRESHOLD);
    const familiar = setFamiliarity({}, 'p0', GX_KNOWN_THRESHOLD);
    const plan = buildSession(points, familiar, { ...DEFAULT_SESSION_OPTIONS, count: 20 }, rng());
    expect(plan.poolSize).toBe(20);
  });
});

describe('the plan reports what it delivered, not what was asked', () => {
  it('reports a shortfall instead of padding the session', () => {
    const plan = buildSession(pool(5), {}, { ...DEFAULT_SESSION_OPTIONS, count: 20 }, rng());
    expect(plan.requested).toBe(20);
    expect(plan.delivered).toBe(5);
    expect(plan.questions.length).toBe(5);
  });

  it('never repeats a point within one session', () => {
    const plan = buildSession(pool(40), {}, { ...DEFAULT_SESSION_OPTIONS, count: 20 }, rng());
    const ids = plan.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reports the ratio it achieved when the pool cannot meet the target', () => {
    // Everything is already Familiar, so a 100%-new request cannot be met.
    let state: FamiliarityState = {};
    for (const p of pool(20)) state = setFamiliarity(state, p.id, GX_KNOWN_THRESHOLD);
    const plan = buildSession(
      pool(20),
      state,
      { ...DEFAULT_SESSION_OPTIONS, count: 10, newRatio: 1 },
      rng(),
    );
    expect(plan.ratioRequested).toBe(1);
    expect(plan.ratioDelivered).toBe(0);
    // Backfilled rather than returning nothing.
    expect(plan.delivered).toBe(10);
  });

  it('hits the ratio when the pool can support it', () => {
    const points = pool(40);
    let state: FamiliarityState = {};
    for (const p of points.slice(0, 20)) state = setFamiliarity(state, p.id, GX_KNOWN_THRESHOLD);
    const plan = buildSession(
      points,
      state,
      { ...DEFAULT_SESSION_OPTIONS, count: 10, newRatio: 0.5, mastered: 'include' },
      rng(),
    );
    expect(plan.delivered).toBe(10);
    expect(plan.ratioDelivered).toBe(0.5);
  });

  it('flags a requested type that no point could support', () => {
    // No examples anywhere, so cloze is unbuildable.
    const plan = buildSession(
      pool(20),
      {},
      { ...DEFAULT_SESSION_OPTIONS, count: 10, types: ['flip', 'cloze'] },
      rng(),
    );
    expect(plan.unusableTypes).toContain('cloze');
    expect(plan.questions.every((q) => q.type === 'flip')).toBe(true);
  });
});

describe('question construction', () => {
  it('never offers a choice question with fewer than three options', () => {
    const plan = buildSession(pool(30), {}, { ...DEFAULT_SESSION_OPTIONS, count: 20 }, rng());
    for (const q of plan.questions) {
      if (!q.choices) continue;
      expect(q.choices.length).toBeGreaterThanOrEqual(3);
      expect(q.choices).toContain(q.answer);
      expect(new Set(q.choices).size).toBe(q.choices.length);
    }
  });

  it('drops choice questions entirely when the pool is too small to be a test', () => {
    const plan = buildSession(
      pool(2),
      {},
      { ...DEFAULT_SESSION_OPTIONS, count: 5, types: ['meaning-choice'] },
      rng(),
    );
    expect(plan.delivered).toBe(0);
  });

  it('is reproducible for a given seed', () => {
    const opts = { ...DEFAULT_SESSION_OPTIONS, count: 10 };
    const a = buildSession(pool(40), {}, opts, makeRng(7));
    const b = buildSession(pool(40), {}, opts, makeRng(7));
    expect(a.questions).toEqual(b.questions);
  });
});

describe('options persistence', () => {
  it('does not share arrays with the module-level default', () => {
    // The exact trap from grammarPresets: merging over DEFAULT and handing back
    // its array leaves shared state one in-place edit from corruption.
    const defaultLength = DEFAULT_SESSION_OPTIONS.types.length;
    const a = parseSessionOptions(null);
    const b = parseSessionOptions(null);
    a.types.push('flip');
    // Neither the module default nor a sibling parse may see that push.
    expect(DEFAULT_SESSION_OPTIONS.types.length).toBe(defaultLength);
    expect(b.types.length).toBe(defaultLength);
    expect(a.types).not.toBe(DEFAULT_SESSION_OPTIONS.types);
    expect(a.types).not.toBe(b.types);
  });

  it('snapshot copies the types array', () => {
    const o = snapshotSessionOptions(DEFAULT_SESSION_OPTIONS);
    expect(o.types).not.toBe(DEFAULT_SESSION_OPTIONS.types);
    expect(o.types).toEqual(DEFAULT_SESSION_OPTIONS.types);
  });

  it('round-trips a valid payload', () => {
    const saved: SessionOptions = {
      count: 25,
      direction: 'production',
      types: ['cloze'],
      mastered: 'only',
      newRatio: 0.25,
    };
    expect(parseSessionOptions(JSON.stringify(saved))).toEqual(saved);
  });

  it('falls back rather than persisting an unescapable empty type list', () => {
    const parsed = parseSessionOptions(JSON.stringify({ types: [] }));
    expect(parsed.types).toEqual(DEFAULT_SESSION_OPTIONS.types);
  });

  it('rejects junk field by field without discarding the rest', () => {
    const parsed = parseSessionOptions(
      JSON.stringify({ count: -5, direction: 'sideways', newRatio: 9, mastered: 'nope', types: ['bogus', 'flip'] }),
    );
    expect(parsed.count).toBe(DEFAULT_SESSION_OPTIONS.count);
    expect(parsed.direction).toBe(DEFAULT_SESSION_OPTIONS.direction);
    expect(parsed.newRatio).toBe(DEFAULT_SESSION_OPTIONS.newRatio);
    expect(parsed.mastered).toBe(DEFAULT_SESSION_OPTIONS.mastered);
    expect(parsed.types).toEqual(['flip']);
  });

  it('survives junk input', () => {
    expect(parseSessionOptions('not json')).toEqual(DEFAULT_SESSION_OPTIONS);
    expect(parseSessionOptions('[1,2]')).toEqual(DEFAULT_SESSION_OPTIONS);
    expect(parseSessionOptions(null)).toEqual(DEFAULT_SESSION_OPTIONS);
  });
});

describe('against the shipped corpus', () => {
  it('builds a full session from real data', () => {
    const plan = buildSession(GRAMMAR, {}, { ...DEFAULT_SESSION_OPTIONS, count: 20 }, makeRng(1));
    expect(plan.delivered).toBe(20);
    expect(plan.poolSize).toBe(GRAMMAR.length);
    expect(plan.questions.every((q) => q.prompt && q.answer)).toBe(true);
  });

  it('deals cloze only where a real sentence contains the pattern', () => {
    const plan = buildSession(
      GRAMMAR,
      {},
      { ...DEFAULT_SESSION_OPTIONS, count: 40, types: ['cloze'], direction: 'production' },
      makeRng(3),
    );
    expect(plan.delivered).toBeGreaterThan(0);
    for (const q of plan.questions) {
      expect(q.sentence).toBeTruthy();
      expect(q.blanked).toContain('＿＿＿');
      // The blank must correspond to text that was genuinely in the sentence.
      expect(q.sentence).toContain(q.answer);
      expect(q.blanked).not.toContain(q.answer);
    }
  });

  it('does not deal a card the record cannot support', () => {
    // The supplemental pattern index is half the corpus and much of it has no
    // examples; none of it may produce a cloze card.
    const plan = buildSession(
      GRAMMAR,
      {},
      { ...DEFAULT_SESSION_OPTIONS, count: 100, types: [...QUESTION_TYPES] },
      makeRng(5),
    );
    for (const q of plan.questions) {
      if (q.type !== 'cloze') continue;
      const p = GRAMMAR.find((x) => x.id === q.id);
      expect(p?.examples.length).toBeGreaterThan(0);
    }
  });

  it('leaves the generated corpus untouched', () => {
    const before = JSON.stringify(GRAMMAR[0]);
    buildSession(GRAMMAR, {}, { ...DEFAULT_SESSION_OPTIONS, count: 30 }, makeRng(9));
    expect(JSON.stringify(GRAMMAR[0])).toBe(before);
  });
});
