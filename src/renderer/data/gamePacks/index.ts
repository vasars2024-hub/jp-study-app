/**
 * The fallback material for the fast games, per study language.
 *
 * The games used to be Japanese-only: a Chinese or Russian learner opening the
 * Arena with an empty deck drilled Japanese kana and particles. Each study
 * language now has its own pack, and the player's own imported lists extend
 * whichever pack is active (see gameItemImport.ts).
 */
import type { StudyLang } from '../../../shared/levelScale';
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
import { ZH_PACK } from './zh';
import { RU_PACK } from './ru';
import type { GamePack } from './types';

export type { GamePack } from './types';

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

export const GAME_PACKS: Readonly<Record<StudyLang, GamePack>> = {
  ja: JA_PACK,
  zh: ZH_PACK,
  ru: RU_PACK,
};

/** The bundled pack for a study language, extended by the player's imported items. */
export function packFor(lang: StudyLang, extra?: Partial<Omit<GamePack, 'lang'>>): GamePack {
  const base = GAME_PACKS[lang] ?? JA_PACK;
  if (!extra) return base;
  return {
    lang: base.lang,
    sentences: [...base.sentences, ...(extra.sentences ?? [])],
    vocab: [...base.vocab, ...(extra.vocab ?? [])],
    cloze: [...base.cloze, ...(extra.cloze ?? [])],
    sprint: [...base.sprint, ...(extra.sprint ?? [])],
    reading: [...base.reading, ...(extra.reading ?? [])],
    particles: [...base.particles, ...(extra.particles ?? [])],
    counters: [...base.counters, ...(extra.counters ?? [])],
  };
}

/** Total bundled items per language, for the audit and the tests. */
export function packSize(pack: GamePack): number {
  return (
    pack.sentences.length +
    pack.vocab.length +
    pack.cloze.length +
    pack.sprint.length +
    pack.reading.length +
    pack.particles.length +
    pack.counters.length
  );
}
