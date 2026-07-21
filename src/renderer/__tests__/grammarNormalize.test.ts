import { describe, expect, it } from 'vitest';
import {
  deriveRegister,
  hasTrustworthyRegister,
  normalizeGrammarPoint,
  type ModuleProvenance,
} from '../data/grammar/normalize';
import type { GrammarPoint } from '../data/grammar/types';

/*
 * The morphology tables had no direct coverage at all before this file: every
 * register test in the suite set `registerSource` on its fixture and so never
 * exercised derivation. That mattered, because the tables encode a specific
 * discipline — under-inclusive on purpose, since a rule that also matches an
 * ordinary verb is worse than no rule — and nothing was checking it held.
 *
 * The negative cases below are therefore the point of this file, not padding.
 * Each one is a word the comments in normalize.ts name as a trap.
 */

const AUTHORED: ModuleProvenance = {
  source: 'test',
  tagSource: 'authored',
  verification: 'partial',
};

const IMPORTED: ModuleProvenance = {
  source: 'test-import',
  tagSource: 'heuristic',
  verification: 'imported-unreviewed',
};

function point(over: Partial<GrammarPoint> = {}): GrammarPoint {
  return {
    id: 'p',
    level: 'N3',
    title: '〜テスト',
    meaning: 'test',
    structure: 'V + テスト',
    explanation: 'explanation',
    examples: [{ jp: 'テスト。', en: 'Test.' }],
    ...over,
  };
}

describe('deriveRegister', () => {
  describe('does not fire on ordinary vocabulary', () => {
    /*
     * Each of these contains the exact kana a rule looks for. If any starts
     * returning a register, the rule that changed has become over-inclusive
     * and is now mislabelling real records.
     */
    it.each([
      ['死ぬ', 'V + 死ぬ', 'the 〜ぬ classical negative'],
      ['当たる', 'N + に当たる', 'the 〜たる classical attributive'],
      ['〜な (na-adjective)', 'な-adj + な + N', 'the prohibitive な'],
      ['〜なので', 'N + なので', 'the prohibitive な'],
      ['〜Vた + せつな', 'V-ta + せつな', 'the prohibitive な (刹那 is a noun)'],
      ['なんとしても', 'なんとしても + V', 'classical 〜んとする'],
      ['ちゃんとする', 'ちゃんと + する', 'classical 〜んとする'],
      ['〜さ', 'い-adj stem + さ', 'the casual sentence-final さ'],
      ['立てる', 'V + 立てる', 'the casual 〜てる contraction'],
      ['特に', '特に + V', 'the casual 〜とく contraction'],
    ])('leaves %s alone (%s would be a false %s)', (title, structure) => {
      expect(deriveRegister('ja', title, structure)).toBeNull();
    });

    /*
     * 〜つつ is a literary conjunction but 〜つつある is ordinary progressive
     * aspect, so the literary rule has to stop at the longer form. Neutral —
     * not null — is the right answer here: the whitelist recognises it as
     * aspect machinery, which is a decision rather than a shrug.
     */
    it('reads 〜つつある as aspect, not as literary 〜つつ', () => {
      expect(deriveRegister('ja', '〜つつある', 'V stem + つつある')).toBe('neutral');
    });

    it.each([
      ['之后', 'N + 之后'],
      ['或者', 'A + 或者 + B'],
      ['关于', '关于 + N'],
    ])('leaves the everyday Chinese word %s alone', (title, structure) => {
      expect(deriveRegister('zh', title, structure)).toBeNull();
    });

    /*
     * Politeness is not register. Treating 〜ます as "business" is close to the
     * exact mistake this module was rewritten to remove, so it must stay
     * classified as ordinary neutral machinery rather than formal speech.
     */
    it('does not read plain politeness as formal', () => {
      expect(deriveRegister('ja', '〜ます / 〜ません', 'V stem + ます')).toBe('neutral');
      expect(deriveRegister('ja', '〜です', 'N + です')).toBe('neutral');
    });
  });

  describe('fires on decisive morphology', () => {
    it.each([
      ['お〜になる', 'business'],
      ['ございます', 'business'],
      ['させていただく', 'business'],
      ['お〜願います', 'business'],
      ['〜じゃん', 'casual'],
      ['〜なきゃ', 'casual'],
      ['〜っこない', 'casual'],
      ['〜するな', 'casual'],
      ['〜べからず', 'literary'],
      ['〜の極み', 'literary'],
      ['〜んがため', 'literary'],
      ['〜ごとし', 'literary'],
    ] as const)('reads %s as %s', (title, expected) => {
      expect(deriveRegister('ja', title, '')).toBe(expected);
    });

    it.each([
      ['岂不', 'literary'],
      ['倘若', 'literary'],
      ['呗', 'casual'],
      ['干嘛', 'casual'],
    ] as const)('reads the Chinese pattern %s as %s', (title, expected) => {
      expect(deriveRegister('zh', title, '')).toBe(expected);
    });
  });

  describe('anchored rules match against each field separately', () => {
    /*
     * Regression guard. Derivation used to run against one concatenated
     * `title + ' ' + structure` string, which disabled every $-anchored rule
     * in the tables — `だろ$` cannot match when the structure column has been
     * appended after it. Four of the original fourteen rules were dead this
     * way, and it went unnoticed because nothing tested derivation directly.
     */
    it('applies a $-anchored rule to the title despite a trailing structure', () => {
      expect(deriveRegister('ja', '〜だろ', 'V plain + だろ')).toBe('casual');
      expect(deriveRegister('ja', '〜でしょ', 'V plain + でしょ')).toBe('casual');
    });

    it('splits a multi-variant title on the slash', () => {
      // Neither half matches while the two are joined into one string.
      expect(deriveRegister('ja', '〜ものか / 〜もんか', '')).toBe('casual');
    });

    it('ignores a parenthetical English gloss in the title', () => {
      expect(deriveRegister('ja', '〜は (topic particle)', 'N + は')).toBe('neutral');
    });
  });

  describe('positive neutral', () => {
    /*
     * The whitelist exists so "checked, and this pattern carries no register"
     * is distinguishable from "never looked at". Both were stored as
     * `register: 'neutral'` before, which made the distinction unrecoverable.
     */
    it('asserts neutral for core connectives rather than staying silent', () => {
      expect(deriveRegister('ja', '〜ながら', 'V stem + ながら')).toBe('neutral');
      expect(deriveRegister('ja', '〜から', 'V plain + から')).toBe('neutral');
      expect(deriveRegister('ja', '〜ている', 'V te-form + いる')).toBe('neutral');
    });

    it('still lets a register-bearing rule win over the whitelist', () => {
      // Runs last in the table, so anything decisive above it takes precedence.
      expect(deriveRegister('ja', '〜てくださる', 'V te-form + くださる')).toBe('business');
    });

    it('leaves an unrecognised pattern unresolved', () => {
      expect(deriveRegister('ja', '〜ものだから', 'V plain + ものだから')).toBeNull();
    });
  });
});

describe('normalizeGrammarPoint register provenance', () => {
  it('lets an authored register win over a derived one', () => {
    /*
     * Previously-fixed regression: the authored branch excluded 'neutral', so
     * the derived rules intercepted a hand-written neutral and overrode the
     * author. A pattern containing 亦 or 则 silently became literary.
     */
    const p = normalizeGrammarPoint(
      point({ lang: 'zh', level: 'HSK5', title: '亦', register: 'neutral' }),
      AUTHORED,
    );
    expect(p.register).toBe('neutral');
    expect(p.provenance.registerSource).toBe('authored');
  });

  it('marks an uncorroborated imported register heuristic without erasing it', () => {
    const p = normalizeGrammarPoint(point({ title: '〜ものだから', register: 'business' }), IMPORTED);
    expect(p.register).toBe('business');
    expect(p.provenance.registerSource).toBe('heuristic');
    expect(hasTrustworthyRegister(p)).toBe(false);
  });

  it('keeps a classified register visible but untrusted', () => {
    const p = normalizeGrammarPoint(
      point({
        title: '〜ものだから',
        register: 'casual',
        provenance: { registerSource: 'classified' },
      }),
      IMPORTED,
    );
    expect(p.register).toBe('casual');
    expect(p.provenance.registerSource).toBe('classified');
    // The whole point of the tier: attributable, but never presented as fact.
    expect(hasTrustworthyRegister(p)).toBe(false);
  });

  it('upgrades a classified register when a morphology rule also fires', () => {
    /*
     * A rule reading the pattern itself is better evidence than a model
     * reading the gloss, so derivation overwrites the model's answer rather
     * than deferring to it.
     */
    const p = normalizeGrammarPoint(
      point({
        title: '〜べからず',
        register: 'casual',
        provenance: { registerSource: 'classified' },
      }),
      IMPORTED,
    );
    expect(p.register).toBe('literary');
    expect(p.provenance.registerSource).toBe('derived');
    expect(hasTrustworthyRegister(p)).toBe(true);
  });
});
