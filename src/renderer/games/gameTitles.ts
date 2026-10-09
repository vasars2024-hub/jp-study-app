/**
 * The catalog keys that name each Arena game, in one place: the Arena's list, the Calendar's
 * day view, the warm-up card and Statistics all say the same name for the same game.
 */
import type { StudyLang } from '../../shared/levelScale';
import type { GameId } from './types';

/** The Aero-only games reuse the Special page's names for them. */
const AERO_GAME_KEYS: Partial<Record<GameId, string>> = {
  'aero-breakout': 'special.game.aero.breakout',
  'aero-blocks': 'special.game.aero.blocks',
  'aero-pong': 'special.game.aero.pong',
  'aero-snake': 'special.game.aero.snake',
};

/**
 * Four games test a different skill per study language (kana → pinyin tones / the Cyrillic
 * alphabet; kanji readings → pinyin / stress; particles → Chinese particles / Russian case
 * endings; counters → measure words / number agreement), so they carry their own names there.
 */
const PER_LANGUAGE_GAMES = new Set<GameId>(['kana-sprint', 'kanji-reading', 'particle-panic', 'counter-quiz']);

export function arenaGameTitleKey(id: GameId, lang: StudyLang = 'ja'): string {
  if (AERO_GAME_KEYS[id]) return `${AERO_GAME_KEYS[id]}.title`;
  return lang !== 'ja' && PER_LANGUAGE_GAMES.has(id) ? `games.def.${id}.${lang}.title` : `games.def.${id}.title`;
}

export function arenaGameDescKey(id: GameId, lang: StudyLang = 'ja'): string {
  if (AERO_GAME_KEYS[id]) return `${AERO_GAME_KEYS[id]}.desc`;
  return lang !== 'ja' && PER_LANGUAGE_GAMES.has(id) ? `games.def.${id}.${lang}.desc` : `games.def.${id}.desc`;
}
