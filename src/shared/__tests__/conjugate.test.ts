import { describe, expect, it } from 'vitest';
import {
  allForms,
  checkAnswer,
  conjugate,
  DRILL_WORDS,
  FORMS,
  type ConjugationForm,
} from '../conjugate';
import { deinflect } from '../deinflect';

describe('godan', () => {
  const forms: [ConjugationForm, string][] = [
    ['polite', '飲みます'],
    ['negative', '飲まない'],
    ['politeNegative', '飲みません'],
    ['past', '飲んだ'],
    ['pastNegative', '飲まなかった'],
    ['politePast', '飲みました'],
    ['te', '飲んで'],
    ['potential', '飲める'],
    ['passive', '飲まれる'],
    ['causative', '飲ませる'],
    ['volitional', '飲もう'],
    ['imperative', '飲め'],
    ['conditional', '飲めば'],
  ];
  it.each(forms)('飲む → %s', (form, expected) => {
    expect(conjugate('飲む', 'godan', form)).toBe(expected);
  });

  it('applies the right 音便 per ending', () => {
    expect(conjugate('書く', 'godan', 'past')).toBe('書いた');
    expect(conjugate('泳ぐ', 'godan', 'past')).toBe('泳いだ');
    expect(conjugate('話す', 'godan', 'past')).toBe('話した');
    expect(conjugate('待つ', 'godan', 'te')).toBe('待って');
    expect(conjugate('死ぬ', 'godan', 'te')).toBe('死んで');
    expect(conjugate('遊ぶ', 'godan', 'te')).toBe('遊んで');
  });

  it('uses わ for the negative of an う-ending verb', () => {
    // 買う → 買わない, not 買あない.
    expect(conjugate('買う', 'godan', 'negative')).toBe('買わない');
    expect(conjugate('買う', 'godan', 'past')).toBe('買った');
  });

  it('treats 帰る as godan despite the -eru shape', () => {
    expect(conjugate('帰る', 'godan', 'te')).toBe('帰って');
    expect(conjugate('帰る', 'godan', 'negative')).toBe('帰らない');
  });

  it('handles 行く, whose 音便 is irregular', () => {
    // The regular く rule would give 行いた; the real forms are 行った/行って.
    expect(conjugate('行く', 'godan', 'past')).toBe('行った');
    expect(conjugate('行く', 'godan', 'te')).toBe('行って');
    // Non-past forms stay regular.
    expect(conjugate('行く', 'godan', 'polite')).toBe('行きます');
  });
});

describe('ichidan', () => {
  const forms: [ConjugationForm, string][] = [
    ['polite', '食べます'],
    ['negative', '食べない'],
    ['past', '食べた'],
    ['pastNegative', '食べなかった'],
    ['te', '食べて'],
    ['potential', '食べられる'],
    ['passive', '食べられる'],
    ['causative', '食べさせる'],
    ['volitional', '食べよう'],
    ['imperative', '食べろ'],
    ['conditional', '食べれば'],
  ];
  it.each(forms)('食べる → %s', (form, expected) => {
    expect(conjugate('食べる', 'ichidan', form)).toBe(expected);
  });

  it('gives ichidan the same surface for potential and passive', () => {
    // This is a genuine ambiguity in the language, not a bug: 見られる is both.
    expect(conjugate('見る', 'ichidan', 'potential')).toBe('見られる');
    expect(conjugate('見る', 'ichidan', 'passive')).toBe('見られる');
  });
});

describe('する and 来る', () => {
  it('conjugates する suppletively', () => {
    expect(conjugate('する', 'suru', 'polite')).toBe('します');
    expect(conjugate('する', 'suru', 'negative')).toBe('しない');
    expect(conjugate('する', 'suru', 'past')).toBe('した');
    expect(conjugate('する', 'suru', 'te')).toBe('して');
    expect(conjugate('する', 'suru', 'passive')).toBe('される');
    expect(conjugate('する', 'suru', 'causative')).toBe('させる');
    expect(conjugate('する', 'suru', 'volitional')).toBe('しよう');
    expect(conjugate('する', 'suru', 'conditional')).toBe('すれば');
  });

  it('uses できる for する\'s potential rather than a regular stem', () => {
    expect(conjugate('する', 'suru', 'potential')).toBe('できる');
    expect(conjugate('勉強する', 'suru', 'potential')).toBe('勉強できる');
  });

  it('carries the prefix through compound suru verbs', () => {
    expect(conjugate('勉強する', 'suru', 'polite')).toBe('勉強します');
    expect(conjugate('勉強する', 'suru', 'te')).toBe('勉強して');
  });

  it('conjugates 来る with the shifting reading behind the kanji', () => {
    expect(conjugate('来る', 'kuru', 'polite')).toBe('来ます');
    expect(conjugate('来る', 'kuru', 'negative')).toBe('来ない');
    expect(conjugate('来る', 'kuru', 'te')).toBe('来て');
    expect(conjugate('来る', 'kuru', 'volitional')).toBe('来よう');
    expect(conjugate('来る', 'kuru', 'conditional')).toBe('来れば');
  });

  it('conjugates kana くる with the explicit reading changes', () => {
    expect(conjugate('くる', 'kuru', 'polite')).toBe('きます');
    expect(conjugate('くる', 'kuru', 'negative')).toBe('こない');
    expect(conjugate('くる', 'kuru', 'te')).toBe('きて');
    expect(conjugate('くる', 'kuru', 'conditional')).toBe('くれば');
  });
});

describe('i-adjectives', () => {
  it('conjugates a regular i-adjective', () => {
    expect(conjugate('高い', 'i-adj', 'negative')).toBe('高くない');
    expect(conjugate('高い', 'i-adj', 'past')).toBe('高かった');
    expect(conjugate('高い', 'i-adj', 'pastNegative')).toBe('高くなかった');
    expect(conjugate('高い', 'i-adj', 'te')).toBe('高くて');
    expect(conjugate('高い', 'i-adj', 'polite')).toBe('高いです');
    expect(conjugate('高い', 'i-adj', 'conditional')).toBe('高ければ');
  });

  it('handles いい suppletively', () => {
    // いい inflects on よ: よくない, よかった — never いくない.
    expect(conjugate('いい', 'i-adj', 'negative')).toBe('よくない');
    expect(conjugate('いい', 'i-adj', 'past')).toBe('よかった');
    expect(conjugate('いい', 'i-adj', 'te')).toBe('よくて');
  });

  it('has no verb-only forms', () => {
    expect(conjugate('高い', 'i-adj', 'causative')).toBe('');
    expect(conjugate('高い', 'i-adj', 'potential')).toBe('');
    expect(conjugate('高い', 'i-adj', 'imperative')).toBe('');
  });

  it('omits verb-only forms from allForms', () => {
    const ids = allForms('高い', 'i-adj').map((f) => f.form);
    expect(ids).not.toContain('causative');
    expect(ids).toContain('past');
  });
});

describe('guards', () => {
  it('returns empty for malformed input', () => {
    expect(conjugate('', 'godan', 'past')).toBe('');
    expect(conjugate('る', 'ichidan', 'past')).toBe('');
    expect(conjugate('高い', 'suru', 'past')).toBe('');
  });

  it('trusts the caller\'s word class, because the string cannot decide it', () => {
    // 食べる is ichidan, but nothing in the spelling says so — 帰る has the same
    // shape and is godan. Told 'godan', the function applies godan rules and
    // returns 食べった. That is the caller's error to avoid, not something this
    // module can detect, so it is documented rather than guarded.
    expect(conjugate('食べる', 'godan', 'past')).toBe('食べった');
    expect(conjugate('食べる', 'ichidan', 'past')).toBe('食べた');
  });
});

describe('checkAnswer', () => {
  it('accepts an exact match and tolerates surrounding space', () => {
    expect(checkAnswer('飲んだ', '飲んだ')).toBe(true);
    expect(checkAnswer('  飲んだ  ', '飲んだ')).toBe(true);
  });

  it('normalises composition so an IME dakuten still matches', () => {
    expect(checkAnswer('飲んだ'.normalize('NFD'), '飲んだ')).toBe(true);
  });

  it('rejects a wrong or empty answer', () => {
    expect(checkAnswer('飲みた', '飲んだ')).toBe(false);
    expect(checkAnswer('', '飲んだ')).toBe(false);
    expect(checkAnswer('   ', '飲んだ')).toBe(false);
  });
});

describe('round-trip against deinflect', () => {
  // The real guarantee: every form this module generates must peel back to the
  // dictionary form it came from. This is what keeps the two directions honest,
  // since both read the same godan tables — and it is what caught the missing
  // kanji 行った/行って and 来い rules in deinflect.ts.
  //
  // Two exclusions, both because deinflect's scope is narrower than this
  // module's, not because the forms are wrong:
  //
  // - です forms. です is a copula, not an inflection of the adjective, and
  //   deinflect does not peel it (高いです stays 高いです). The drill still
  //   teaches them; they just cannot be round-tripped.
  // - いい. Its inflected forms are built on よ, so よかった legitimately peels
  //   to よい — the same word under its other spelling. Asserting いい would be
  //   asserting a spelling choice, not a conjugation.
  const COPULA_FORMS = new Set<ConjugationForm>(['polite', 'politeNegative', 'politePast']);

  for (const w of DRILL_WORDS) {
    for (const spec of FORMS) {
      if (w.wordClass === 'i-adj' && COPULA_FORMS.has(spec.id)) continue;
      if (w.dict === 'いい') continue;
      const surface = conjugate(w.dict, w.wordClass, spec.id);
      if (!surface) continue;
      it(`${w.dict} ${spec.id} → ${surface} → ${w.dict}`, () => {
        const terms = deinflect(surface).map((d) => d.term);
        expect(terms).toContain(w.dict);
      });
    }
  }

  it('round-trips いい onto its よい spelling', () => {
    expect(deinflect(conjugate('いい', 'i-adj', 'past')).map((d) => d.term)).toContain('よい');
  });
});

describe('deinflect gaps this module surfaced', () => {
  // Regression tests for the rules added to deinflect.ts alongside this file.
  // 行った is one of the most common verb forms in the language and previously
  // resolved only to 行う / 行つ / 行る, so a dictionary lookup on it missed 行く.
  it('peels the kanji spelling of 行く\'s irregular 音便', () => {
    expect(deinflect('行った').map((d) => d.term)).toContain('行く');
    expect(deinflect('行って').map((d) => d.term)).toContain('行く');
  });

  it('peels the kanji imperative of 来る', () => {
    expect(deinflect('来い').map((d) => d.term)).toContain('来る');
  });

  it('still peels the kana spellings', () => {
    expect(deinflect('いった').map((d) => d.term)).toContain('いく');
    expect(deinflect('こい').map((d) => d.term)).toContain('くる');
  });
});

describe('DRILL_WORDS', () => {
  it('produces at least one form for every entry', () => {
    for (const w of DRILL_WORDS) {
      expect(allForms(w.dict, w.wordClass).length).toBeGreaterThan(0);
    }
  });

  it('covers every word class', () => {
    const classes = new Set(DRILL_WORDS.map((w) => w.wordClass));
    expect([...classes].sort()).toEqual(['godan', 'i-adj', 'ichidan', 'kuru', 'suru']);
  });
});
