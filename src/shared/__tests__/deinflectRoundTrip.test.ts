// Broad round-trip gate: every form `conjugate()` can generate must peel back to
// its dictionary form through `deinflect()`.
//
// `conjugate.test.ts` round-trips the 21 drill words. This file widens that to 80
// words chosen to cover every godan ending in its *kanji* spelling, because the
// two bugs found on 2026-07-21 were both rules written for kana only (いった → いく
// existed, 行った → 行く did not). A kana-only rule is invisible to a kana-only
// test, so the vocabulary here is deliberately kanji-first.
//
// Result of that widening: **no further gaps.** The 行く and 来い rules were the
// only two, not the tip of a pile — worth recording, since the opposite was
// assumed at the time.
//
// This is a gate, not an audit script: if a future deinflect rule change breaks
// a spelling, this fails with the exact forms.

import { describe, expect, it } from 'vitest';
import { conjugate, FORMS, type ConjugationForm, type WordClass } from '../conjugate';
import { deinflect } from '../deinflect';

/** Kanji-spelled, covering all nine godan endings plus every other class. */
const WORDS: [string, WordClass][] = [
  // godan う
  ['買う', 'godan'], ['会う', 'godan'], ['使う', 'godan'], ['歌う', 'godan'], ['思う', 'godan'], ['言う', 'godan'], ['洗う', 'godan'],
  // godan く (行く is the irregular 音便)
  ['書く', 'godan'], ['聞く', 'godan'], ['歩く', 'godan'], ['働く', 'godan'], ['泣く', 'godan'], ['置く', 'godan'], ['行く', 'godan'],
  // godan ぐ
  ['泳ぐ', 'godan'], ['急ぐ', 'godan'], ['脱ぐ', 'godan'], ['騒ぐ', 'godan'],
  // godan す
  ['話す', 'godan'], ['出す', 'godan'], ['返す', 'godan'], ['貸す', 'godan'], ['探す', 'godan'], ['消す', 'godan'],
  // godan つ / ぬ
  ['待つ', 'godan'], ['立つ', 'godan'], ['持つ', 'godan'], ['勝つ', 'godan'], ['死ぬ', 'godan'],
  // godan ぶ
  ['遊ぶ', 'godan'], ['呼ぶ', 'godan'], ['飛ぶ', 'godan'], ['選ぶ', 'godan'], ['運ぶ', 'godan'],
  // godan む
  ['飲む', 'godan'], ['読む', 'godan'], ['休む', 'godan'], ['住む', 'godan'], ['頼む', 'godan'],
  // godan る — the shape that looks ichidan
  ['帰る', 'godan'], ['入る', 'godan'], ['走る', 'godan'], ['知る', 'godan'], ['取る', 'godan'],
  ['作る', 'godan'], ['売る', 'godan'], ['降る', 'godan'], ['切る', 'godan'], ['座る', 'godan'],
  // ichidan
  ['食べる', 'ichidan'], ['見る', 'ichidan'], ['起きる', 'ichidan'], ['教える', 'ichidan'], ['寝る', 'ichidan'],
  ['出る', 'ichidan'], ['借りる', 'ichidan'], ['開ける', 'ichidan'], ['閉める', 'ichidan'], ['忘れる', 'ichidan'],
  ['覚える', 'ichidan'], ['着る', 'ichidan'], ['考える', 'ichidan'], ['答える', 'ichidan'],
  // irregular
  ['する', 'suru'], ['勉強する', 'suru'], ['掃除する', 'suru'], ['練習する', 'suru'], ['運動する', 'suru'],
  ['来る', 'kuru'], ['くる', 'kuru'],
  // i-adjectives
  ['高い', 'i-adj'], ['新しい', 'i-adj'], ['楽しい', 'i-adj'], ['安い', 'i-adj'], ['早い', 'i-adj'],
  ['忙しい', 'i-adj'], ['面白い', 'i-adj'], ['良い', 'i-adj'], ['大きい', 'i-adj'], ['小さい', 'i-adj'],
];

// です is a copula, not an inflection, and deinflect does not peel it. Same
// exclusion as conjugate.test.ts.
const COPULA_FORMS = new Set<ConjugationForm>(['polite', 'politeNegative', 'politePast']);

function roundTripFailures(): { failures: string[]; checked: number } {
  const failures: string[] = [];
  let checked = 0;
  for (const [word, cls] of WORDS) {
    for (const spec of FORMS) {
      if (cls === 'i-adj' && COPULA_FORMS.has(spec.id)) continue;
      const surface = conjugate(word, cls, spec.id);
      if (!surface) continue;
      checked += 1;
      if (!deinflect(surface).some((d) => d.term === word)) {
        failures.push(`${spec.id}: ${word} → ${surface}`);
      }
    }
  }
  return { failures, checked };
}

describe('conjugate → deinflect round-trip, kanji-first vocabulary', () => {
  it('peels every generated form back to its dictionary form', () => {
    const { failures } = roundTripFailures();
    expect(failures).toEqual([]);
  });

  it('actually exercises a broad surface', () => {
    const { checked } = roundTripFailures();
    // Guards against the vocabulary or FORMS list silently shrinking and making
    // the gate above vacuous.
    expect(checked).toBeGreaterThanOrEqual(900);
  });
});
