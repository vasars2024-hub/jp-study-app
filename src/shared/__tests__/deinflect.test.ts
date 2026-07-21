import { describe, expect, it } from 'vitest';
import { deinflect, describeReasons } from '../deinflect';

/** Terms produced for a surface form. */
function terms(surface: string): string[] {
  return deinflect(surface).map((d) => d.term);
}

/** Reasons attached to a specific candidate term, or null if not produced. */
function reasonsFor(surface: string, term: string): string[] | null {
  const hit = deinflect(surface).find((d) => d.term === term);
  return hit ? hit.reasons : null;
}

describe('deinflect — identity & ranking', () => {
  it('returns the surface form itself first, with no reasons', () => {
    expect(deinflect('食べる')[0]).toEqual({ term: '食べる', reasons: [] });
    expect(deinflect('猫')[0]).toEqual({ term: '猫', reasons: [] });
  });

  it('does not over-reduce a plain dictionary verb', () => {
    expect(terms('食べる')).toContain('食べる');
    expect(terms('高い')).toContain('高い');
  });

  it('terminates on empty / non-Japanese input without looping', () => {
    expect(deinflect('')).toEqual([{ term: '', reasons: [] }]);
    expect(terms('hello')).toEqual(['hello']);
  });
});

describe('deinflect — ichidan (v1)', () => {
  it('polite, past, te, negative', () => {
    expect(terms('食べます')).toContain('食べる');
    expect(terms('食べた')).toContain('食べる');
    expect(terms('食べて')).toContain('食べる');
    expect(terms('食べない')).toContain('食べる');
  });

  it('causative, passive, potential, volitional, imperative', () => {
    expect(terms('食べさせる')).toContain('食べる');
    expect(terms('食べられる')).toContain('食べる');
    expect(terms('食べよう')).toContain('食べる');
    expect(terms('食べろ')).toContain('食べる');
  });
});

describe('deinflect — godan (v5)', () => {
  it('handles every 音便 past class', () => {
    expect(terms('飲んだ')).toContain('飲む'); // ぬ/ぶ/む → んだ
    expect(terms('書いた')).toContain('書く'); // く → いた
    expect(terms('泳いだ')).toContain('泳ぐ'); // ぐ → いだ
    expect(terms('話した')).toContain('話す'); // す → した
    expect(terms('買った')).toContain('買う'); // う → った
    expect(terms('待った')).toContain('待つ'); // つ → った
    expect(terms('取った')).toContain('取る'); // る → った
  });

  it('te / negative / causative / passive / potential', () => {
    expect(terms('飲んで')).toContain('飲む');
    expect(terms('飲まない')).toContain('飲む');
    expect(terms('飲ませる')).toContain('飲む'); // causative
    expect(terms('飲まれる')).toContain('飲む'); // passive
    expect(terms('飲める')).toContain('飲む'); // potential
    expect(terms('飲もう')).toContain('飲む'); // volitional
    expect(terms('飲めば')).toContain('飲む'); // conditional
    expect(terms('飲め')).toContain('飲む'); // imperative
  });
});

describe('deinflect — i-adjectives', () => {
  it('past, te, negative, adverbial, conditional', () => {
    expect(terms('高かった')).toContain('高い');
    expect(terms('高くて')).toContain('高い');
    expect(terms('高くない')).toContain('高い');
    expect(terms('高く')).toContain('高い');
    expect(terms('高ければ')).toContain('高い');
  });
});

describe('deinflect — irregular する / 来る', () => {
  it('する: negative / past / te / passive / causative / potential', () => {
    expect(terms('しない')).toContain('する');
    expect(terms('した')).toContain('する');
    expect(terms('して')).toContain('する');
    expect(terms('される')).toContain('する');
    expect(terms('させる')).toContain('する');
    expect(terms('できる')).toContain('する'); // suppletive potential
    expect(terms('すれば')).toContain('する');
  });

  it('来る (kana form): negative / past / te / conditional', () => {
    expect(terms('こない')).toContain('くる');
    expect(terms('きた')).toContain('くる');
    expect(terms('きて')).toContain('くる');
    expect(terms('くれば')).toContain('くる');
  });
});

describe('deinflect — stacked forms (the point of the engine)', () => {
  it('causative + passive + past: 食べさせられた → 食べる with the full chain', () => {
    const r = reasonsFor('食べさせられた', '食べる');
    expect(r).not.toBeNull();
    // Inner (closest to stem) → outer (surface suffix).
    expect(r).toEqual(['causative', 'passive/potential', 'past']);
    expect(describeReasons(r ?? [])).toBe('causative · passive/potential · past');
  });

  it('godan causative-passive past: 飲まされた → 飲む', () => {
    expect(terms('飲まされた')).toContain('飲む');
  });

  it('progressive: 食べている / 飲んでいる / 食べてる', () => {
    expect(terms('食べている')).toContain('食べる');
    expect(terms('飲んでいる')).toContain('飲む');
    expect(terms('食べてる')).toContain('食べる');
  });

  it('～てしまう and its ちゃう contraction', () => {
    expect(terms('食べてしまう')).toContain('食べる');
    expect(terms('食べちゃう')).toContain('食べる');
    expect(terms('飲んじゃう')).toContain('飲む');
    expect(terms('食べちゃった')).toContain('食べる'); // contraction + past
  });

  it('desiderative + negative: 食べたくない → 食べる', () => {
    expect(terms('食べたくない')).toContain('食べる');
  });
});

describe('deinflect — ambiguity (return all candidates, not the first hit)', () => {
  // A pure kana-suffix engine cannot know that kanji 行 reads いく, so kanji-written
  // 行った only yields the reading-independent 行う; the 行く reading is recovered
  // from the tokenizer lemma at lookup time. Written in kana, though, いった is
  // exactly the 行く / 言う ambiguity the engine must keep both sides of.
  it('kana いった resolves to BOTH いく (行く) and いう (言う/行う)', () => {
    const t = terms('いった');
    expect(t).toContain('いく'); // irregular 音便 いった → いく
    expect(t).toContain('いう'); // regular った → う
  });

  it('kana いって likewise keeps both roots', () => {
    const t = terms('いって');
    expect(t).toContain('いく');
    expect(t).toContain('いう');
  });

  it('kanji 行った still recovers the reading-independent root 行う', () => {
    expect(terms('行った')).toContain('行う');
  });

  it('polite きます keeps both the kuru and godan readings', () => {
    const t = terms('きます');
    expect(t).toContain('くる'); // 来ます
    expect(t).toContain('きる'); // 着ます / 切ます stem — bare き + ます
  });
});

describe('deinflect — chains stay bounded', () => {
  it('never returns a chain longer than the depth cap', () => {
    for (const d of deinflect('食べさせられたくなかった')) {
      expect(d.reasons.length).toBeLessThanOrEqual(10);
    }
  });

  it('shorter chains rank ahead of longer ones', () => {
    const results = deinflect('食べさせられた');
    const idxBase = results.findIndex((d) => d.term === '食べる');
    const idxMid = results.findIndex((d) => d.term === '食べさせる');
    expect(idxMid).toBeGreaterThanOrEqual(0);
    expect(idxBase).toBeGreaterThan(idxMid); // 食べる (3 steps) after 食べさせる (2 steps)
  });
});
