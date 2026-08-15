// The two filters that decide quality and that the service-level test cannot
// reach: which particles are allowed to form a row at all, and the bare-kana
// tail rule. Both exist because of specific wrong rows the real 697,837-headword
// database produced — 傘はり, 手がける, 心がけ — so both are asserted by name.
import { describe, expect, it } from 'vitest';
import {
  COLLOCATION_PARTICLES,
  collocationPattern,
  draftLexiconCollocations,
  parseCollocations,
  renderCollocationPattern,
  selectLexiconCollocations,
  type LexiconCollocationCandidate,
} from '../lexiconCollocations';

const candidate = (text: string): LexiconCollocationCandidate => ({
  lang: 'ja', text, reading: '', dictId: 'jmdict-en', dictTitle: 'JMdict',
});

describe('parseCollocations', () => {
  it('anchors at the phrase edges rather than anywhere inside', () => {
    expect(parseCollocations('猫に小判', '猫')).toHaveLength(1);
    // 撫で contains で; a containment test calls this a collocation and it is not.
    expect(parseCollocations('猫撫で声', '猫')).toEqual([]);
    // 猫 is present and adjacent to の, but neither at the start nor at the end.
    expect(parseCollocations('野良猫の話', '猫')).toEqual([]);
  });

  it('reads both directions and reconstructs the phrase exactly', () => {
    const [first] = parseCollocations('猫の目', '猫');
    expect(first).toMatchObject({ order: 'head-first', particle: 'の', partner: '目' });
    const [last] = parseCollocations('核の傘', '傘');
    expect(last).toMatchObject({ order: 'head-last', particle: 'の', partner: '核' });
    for (const parsed of [first, last]) {
      expect(renderCollocationPattern(
        collocationPattern(parsed.particle, parsed.order), parsed.head, parsed.partner,
      )).toBe(parsed.order === 'head-first' ? '猫の目' : '核の傘');
    }
  });

  it('rejects a short bare-kana tail, which is an inflection and not a partner', () => {
    // The particle scan cuts these in the wrong place; the partner it produces
    // ("ける", "がけ" -> "け") is not a word.
    expect(parseCollocations('手がける', '手')).toEqual([]);
    expect(parseCollocations('心がけ', '心')).toEqual([]);
    // Three kana is long enough to be a real verb, and this one is.
    expect(parseCollocations('猫をかぶる', '猫')).toHaveLength(1);
    // Kanji is never a bare-kana tail, however short.
    expect(parseCollocations('猫の目', '猫')).toHaveLength(1);
  });

  it('excludes the three particles that produced false rows', () => {
    for (const noisy of ['は', 'で', 'も']) {
      expect(COLLOCATION_PARTICLES).not.toContain(noisy);
      expect(parseCollocations(`傘${noisy}張り`, '傘')).toEqual([]);
    }
    expect(COLLOCATION_PARTICLES).toContain('が');
  });

  it('never treats the query as a collocation of itself', () => {
    expect(parseCollocations('猫', '猫')).toEqual([]);
  });
});

describe('draftLexiconCollocations', () => {
  it('counts attesting entries instead of repeating the row', () => {
    const drafts = draftLexiconCollocations('風邪', [
      candidate('風邪を引く'), candidate('風邪を引く'), candidate('風邪を移す'),
    ]);
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({ partner: '引く', count: 2 });
    expect(drafts[1]).toMatchObject({ partner: '移す', count: 1 });
  });
});

describe('selectLexiconCollocations', () => {
  const drafts = draftLexiconCollocations('猫', [candidate('猫に小判'), candidate('猫に蒲鉾')]);

  it('keeps only the drafts whose partner the dictionaries attest', () => {
    const kept = selectLexiconCollocations(drafts, new Set(['小判']));
    expect(kept.map((d) => d.partner)).toEqual(['小判']);
  });

  it('returns nothing when nothing is attested', () => {
    expect(selectLexiconCollocations(drafts, new Set())).toEqual([]);
  });

  it('honours the cap and its floor', () => {
    expect(selectLexiconCollocations(drafts, new Set(['小判', '蒲鉾']), 1)).toHaveLength(1);
    expect(selectLexiconCollocations(drafts, new Set(['小判', '蒲鉾']), 0)).toHaveLength(1);
  });
});
