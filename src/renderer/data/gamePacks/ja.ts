/**
 * The Japanese game pack: the graded tables plus the extra Japanese material.
 *
 * Its own module so the registry can keep it eager (it is the engine's default,
 * and the engine already needs `data/gradedSentences` for kana) while the
 * Chinese and Russian packs load only for a learner of that language.
 */
import {
  CLOZE_PROMPTS,
  COUNTER_PROMPTS,
  GRADED_SENTENCES,
  KANA_PROMPTS,
  KANJI_READING_PROMPTS,
  PARTICLE_PROMPTS,
  VOCAB_PROMPTS,
} from '../gradedSentences';
import { JA_EXTRA } from './jaExtra';
import type { GamePack } from './types';

export const JA_PACK: GamePack = {
  lang: 'ja',
  sentences: [...GRADED_SENTENCES, ...JA_EXTRA.sentences],
  vocab: [...VOCAB_PROMPTS, ...JA_EXTRA.vocab],
  cloze: [...CLOZE_PROMPTS, ...JA_EXTRA.cloze],
  sprint: KANA_PROMPTS,
  reading: [...KANJI_READING_PROMPTS, ...JA_EXTRA.reading],
  particles: [...PARTICLE_PROMPTS, ...JA_EXTRA.particles],
  counters: [...COUNTER_PROMPTS, ...JA_EXTRA.counters],
};
