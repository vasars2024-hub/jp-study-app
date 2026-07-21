import type { LevelTier } from '../../shared/levelScale';

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
  createdAt: number;
}

export interface CompletionPayload {
  score: number;
  accuracy: number;
  mistakes: ArenaMistake[];
}
