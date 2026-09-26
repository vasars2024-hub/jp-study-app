import type { LevelTier, StudyLang } from '../../shared/levelScale';

export type SourceLang = 'en' | 'ru' | 'zh';

export type GameId =
  | 'sentence-builder'
  | 'speed-type'
  | 'word-match'
  | 'kana-sprint'
  | 'kanji-reading'
  | 'cloze-blitz'
  | 'listening-flash'
  | 'particle-panic'
  | 'counter-quiz'
  | 'reverse-recall'
  | 'star-invaders'
  | 'comet-courier'
  | 'capsule-sorter'
  | 'signal-simon'
  | 'aero-breakout'
  | 'aero-blocks'
  | 'aero-pong'
  | 'aero-snake'
  | 'mirror-writing';

export interface GameDefinition {
  id: GameId;
  title: string;
  shortTitle: string;
  description: string;
  mode: 'fast' | 'writing' | 'arcade';
}

export interface ArenaMistake {
  gameId: GameId;
  prompt: string;
  expected: string;
  answer?: string;
  jp?: string;
  reading?: string;
  meaning?: string;
  level: LevelTier;
  sourceLang: SourceLang;
  /** The language studied in that round. Absent on mistakes saved before other languages existed. */
  studyLang?: StudyLang;
  /** The single word the round tested, when it tested one. */
  word?: string;
  createdAt: number;
}

export interface CompletionPayload {
  score: number;
  accuracy: number;
  mistakes: ArenaMistake[];
}
