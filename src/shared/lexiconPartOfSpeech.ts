/**
 * What each word in a passage *is*, so the Workbench stops calling を a word.
 *
 * The difficulty profile's own shipped note said this out loud: "Particles and
 * word endings are counted here as well: your dictionary entries carry no part
 * of speech, so this cannot tell them from vocabulary." That is measurably true
 * of the dictionary path — `parseTermBank` in `dictionary/yomitan.ts` reads a
 * Yomitan term row's glosses and drops the tag columns, so every legacy sense on
 * this installation carries `partsOfSpeech: []` — and it is why the profile
 * reported を at rank 4 and で at rank 8 as if they were vocabulary a reader
 * should be pleased to know.
 *
 * The part of speech therefore comes from where it actually exists: the bundled
 * kuromoji/IPADIC morphological analyser the app already loads for mining and
 * for Study analysis. That also makes it *contextual* rather than lexical — the
 * analyser says what a surface was doing in this sentence, which is the question
 * a passage-level profile is asking.
 *
 * Two rules this module holds to:
 *
 * - **It is narrowing-only.** A passage with no analysis attached scores exactly
 *   as it did before, and an unrecognised tag classifies as `other`, never as
 *   `function`. Nothing is ever dropped because the analyser had no opinion.
 * - **It classifies, it does not rank.** No difficulty, level, or ordering is
 *   derived here. The only judgement is "is this a word a learner studies, or is
 *   it the grammar holding the sentence together".
 */

import type {
  LexiconInterlinearResult,
  LexiconPartOfSpeech,
  LexiconWordClass,
} from './lexiconInterlinear';

/** One morpheme as the analyser emits it, before it is located in the text. */
export interface LexiconMorpheme {
  surface: string;
  pos: string;
  detail?: string;
}

/** A morpheme located in the passage, in the same code-unit offsets as `result.text`. */
export interface LexiconMorphemeSpan extends LexiconPartOfSpeech {
  start: number;
  end: number;
}

/**
 * Noun subtypes IPADIC marks as nouns but which are structure, not vocabulary:
 * numerals (一, 二), bound nouns (こと, ため as formal nouns), suffixes (さん, 的),
 * pronouns (私, これ), and the 特殊 class that holds そう in そうだ.
 *
 * Deliberately the same set the reader tokenizer, mining, and the media study
 * orchestrator already skip, so "not vocabulary" means one thing across the app
 * rather than four slightly different things.
 */
const STRUCTURAL_NOUN_DETAILS = new Set(['数', '非自立', '接尾', '代名詞', '特殊']);

/**
 * Classify one IPADIC tag pair.
 *
 * 連体詞 stays `content` on purpose. IPADIC files both この/その and 大きな/いろんな
 * under it, so calling the class grammar would quietly delete real adjectival
 * vocabulary from the count. Guessing between them would need a word list this
 * layer has no grounded source for, and the honest answer for a mixed tag is to
 * keep the word.
 */
export function lexiconWordClass(pos: string, detail?: string): LexiconWordClass {
  const sub = detail && detail !== '*' ? detail : '';
  switch (pos) {
    case '名詞':
      if (sub === '固有名詞') return 'name';
      return STRUCTURAL_NOUN_DETAILS.has(sub) ? 'function' : 'content';
    case '動詞':
    case '形容詞':
      // 非自立 is the auxiliary use of a real verb/adjective — the いる of
      // している, the ない of してない. It carries aspect, not meaning.
      return sub === '非自立' ? 'function' : 'content';
    case '副詞':
    case '感動詞':
    case '連体詞':
      return 'content';
    case '助詞':
    case '助動詞':
    case '接続詞':
    case '接頭詞':
    case '接尾辞':
      return 'function';
    case '記号':
    case 'フィラー':
    case 'その他':
      return 'other';
    default:
      return 'other';
  }
}

/**
 * Locate each morpheme in the passage it was analysed from.
 *
 * The offsets are found by scanning forward for the surface rather than by
 * accumulating its length or trusting the analyser's own position field. Two
 * reasons, both load-bearing: an analyser is free to drop whitespace between
 * morphemes, and a position counted in characters drifts from a JavaScript
 * string offset the moment the passage contains a surrogate pair — 𠮟る in a
 * novel is enough to shift every later token onto the wrong word. A morpheme
 * that cannot be found from the cursor is skipped rather than guessed at, so a
 * mismatch costs that one token its class and nothing else.
 */
export function alignLexiconMorphemes(
  text: string,
  morphemes: readonly LexiconMorpheme[],
): LexiconMorphemeSpan[] {
  const out: LexiconMorphemeSpan[] = [];
  let cursor = 0;

  for (const morpheme of morphemes) {
    const surface = morpheme.surface;
    if (!surface) continue;
    const start = text.indexOf(surface, cursor);
    if (start < 0) continue;
    const end = start + surface.length;
    cursor = end;
    const detail = morpheme.detail && morpheme.detail !== '*' ? morpheme.detail : undefined;
    out.push({
      start,
      end,
      tag: morpheme.pos,
      ...(detail ? { detail } : {}),
      wordClass: lexiconWordClass(morpheme.pos, detail),
    });
  }

  return out;
}

/**
 * Attach a part of speech to every interlinear token the analysis covers.
 *
 * An interlinear token is not always one morpheme: the lookup merges adjacent
 * segments when a longer dictionary entry exists, so 読んだ arrives as one token
 * over 読ん (動詞) + だ (助動詞). The token takes the class of its **first
 * meaningful morpheme**, because Japanese puts the stem first and the grammar
 * after it — a token that starts with a verb is a verb however many endings
 * trail it. Symbols are stepped over rather than allowed to win, so a token that
 * happens to begin with a bracket is still classified by the word inside it.
 *
 * Returns a new result; the input is not mutated, so a cached lookup can be
 * annotated without the cache changing underneath its other readers.
 */
export function attachLexiconPartOfSpeech(
  result: LexiconInterlinearResult,
  spans: readonly LexiconMorphemeSpan[],
): LexiconInterlinearResult {
  if (!spans.length) return result;

  // Parts and spans are both in passage order, so one forward pointer covers the
  // whole passage instead of a scan per token.
  let index = 0;
  const parts = result.parts.map((part) => {
    if (part.kind !== 'token') return part;
    while (index < spans.length && spans[index].end <= part.start) index += 1;

    let chosen: LexiconMorphemeSpan | undefined;
    for (let probe = index; probe < spans.length && spans[probe].start < part.end; probe += 1) {
      const span = spans[probe];
      if (!chosen) chosen = span;
      if (span.wordClass !== 'other') {
        chosen = span;
        break;
      }
    }
    if (!chosen) return part;

    return {
      ...part,
      pos: {
        tag: chosen.tag,
        ...(chosen.detail ? { detail: chosen.detail } : {}),
        wordClass: chosen.wordClass,
      },
    };
  });

  return { ...result, parts };
}
