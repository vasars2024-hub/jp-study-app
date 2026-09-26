import type { StudyLang } from '../../../shared/levelScale';
import type {
  ClozePrompt,
  CounterPrompt,
  GradedSentence,
  KanaPrompt,
  KanjiReadingPrompt,
  ParticlePrompt,
  VocabPrompt,
} from '../gradedSentences';

/**
 * Everything the fast games draw on for one study language when the player's
 * own deck cannot fill a round. The slots keep the Japanese names the games
 * were built with, but each language fills them with its own skill:
 *
 *   sprint     ja kana → romaji · zh tone-marked syllable → tone number · ru letter → transliteration
 *   reading    ja kanji word → kana · zh hanzi word → pinyin · ru word → stressed vowel
 *   particles  ja particles · zh structural particles / coverbs · ru case endings
 *   counters   ja counters · zh measure words · ru number agreement
 */
export interface GamePack {
  lang: StudyLang;
  sentences: GradedSentence[];
  vocab: VocabPrompt[];
  cloze: ClozePrompt[];
  sprint: KanaPrompt[];
  reading: KanjiReadingPrompt[];
  particles: ParticlePrompt[];
  counters: CounterPrompt[];
}
