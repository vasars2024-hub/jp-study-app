/**
 * Every Game Arena blurb says what the player actually does.
 *
 * Kana Sprint said "Pick the romaji" while the round is a typed answer box, and
 * Kanji Reading, Particle Panic and Counter Quiz said "choose"/"pick" for the same
 * typed round; the arcade blurbs described where the code came from ("adapted
 * from the linked Python version") instead of how to play. The rounds are built
 * here for real, per study language, and the blurb the list shows for that game
 * and language is checked against the round's kind, in all four UI languages.
 */
import { describe, expect, it } from 'vitest';
import { CATALOGS } from '../../shared/i18n/catalogs/all';
import { UI_LANGS, type UiLang } from '../../shared/i18n/core';
import type { StudyLang } from '../../shared/levelScale';
import { buildGameRound, GAME_DEFINITIONS } from '../games/engine';
import type { GameId } from '../games/types';

const PER_LANGUAGE = new Set<GameId>(['kana-sprint', 'kanji-reading', 'particle-panic', 'counter-quiz']);
const STUDY: StudyLang[] = ['ja', 'zh', 'ru'];

/** Mirrors `gameDescKey` in GameArenaContent.tsx for the language games. */
function descKey(id: GameId, lang: StudyLang): string {
  return lang !== 'ja' && PER_LANGUAGE.has(id) ? `games.def.${id}.${lang}.desc` : `games.def.${id}.desc`;
}

function text(ui: UiLang, key: string): string {
  const v = CATALOGS[ui][key];
  if (typeof v !== 'string') throw new Error(`${ui}: ${key} missing or plural`);
  return v;
}

/** A typed round's blurb names typing; none of them offers a choice that is not there. */
const TYPING: Record<UiLang, RegExp> = {
  en: /\btype\b/i,
  ja: /入力/,
  zh: /输入/,
  ru: /(введите|впишите|наберите)/i,
};
const CHOOSING: Record<UiLang, RegExp> = {
  en: /\b(pick|choose|select)\b/i,
  ja: /選(び|ん)/,
  zh: /选出|选择/,
  ru: /(Выберите|Подберите)/,
};

const languageGames = GAME_DEFINITIONS.filter((g) => g.mode === 'fast').map((g) => g.id as Exclude<GameId, 'mirror-writing'>);

describe('Game Arena blurbs match the round the game deals', () => {
  for (const study of STUDY) {
    for (const id of languageGames) {
      const round = buildGameRound(id, 3, 'en', 0, { vocab: [], cloze: [], sentences: [], studyLang: study });
      if (round.kind !== 'type') continue;
      it.each(UI_LANGS)(`${id} (${study}) is typed, and the %s blurb says so`, (ui) => {
        const blurb = text(ui, descKey(id, study));
        expect(blurb).toMatch(TYPING[ui]);
        expect(blurb).not.toMatch(CHOOSING[ui]);
      });
    }
  }

  it.each(UI_LANGS)('arcade and writing blurbs describe play, not provenance (%s)', (ui) => {
    for (const g of GAME_DEFINITIONS) {
      if (g.mode === 'fast' || g.id.startsWith('aero-')) continue;
      const blurb = text(ui, `games.def.${g.id}.desc`);
      expect(blurb).not.toMatch(/pygame|Python|open-source|открыт|オープンソース|开源|asynchron|非同期|异步|асинхрон/i);
    }
  });
});
