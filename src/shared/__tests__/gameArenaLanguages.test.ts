import { describe, expect, it } from 'vitest';
import {
  GAME_DEFINITIONS,
  buildGameRound,
  buildSessionRounds,
  evaluateRound,
  gamePoolSize,
  type GameContent,
  type TypeRound,
} from '../../renderer/games/engine';
import { GAME_PACKS, packSize } from '../../renderer/data/gamePacks';
import { parseGameList, packExtrasFromLists, tierOf, type GameList } from '../../renderer/games/gameItemImport';
import { parseMirrorTexts } from '../../renderer/games/mirrorTextImport';
import type { StudyLang } from '../levelScale';

const LANGS: StudyLang[] = ['ja', 'zh', 'ru'];
const FAST = GAME_DEFINITIONS.filter((g) => g.mode === 'fast').map((g) => g.id) as Array<
  Parameters<typeof buildGameRound>[0]
>;
const content = (lang: StudyLang): GameContent => ({ vocab: [], cloze: [], sentences: [], studyLang: lang });
const STRESS = String.fromCharCode(0x301);

describe('Game Arena content per study language', () => {
  it('has a full pack for every study language', () => {
    for (const lang of LANGS) {
      const pack = GAME_PACKS[lang];
      expect(pack.lang).toBe(lang);
      for (const slot of ['sentences', 'vocab', 'cloze', 'sprint', 'reading', 'particles', 'counters'] as const) {
        expect(pack[slot].length, `${lang} ${slot}`).toBeGreaterThanOrEqual(18);
      }
      // Every tier has sentences, so a level never falls back to another level's only item.
      for (let tier = 1; tier <= 7; tier += 1) {
        expect(pack.sentences.filter((s) => s.level === tier).length, `${lang} tier ${tier}`).toBeGreaterThanOrEqual(2);
      }
    }
    expect(packSize(GAME_PACKS.ja)).toBeGreaterThan(240);
  });

  it('keeps the authoring rules: tokens rebuild the sentence, blanks do not give the answer away', () => {
    for (const lang of LANGS) {
      const pack = GAME_PACKS[lang];
      for (const s of pack.sentences) {
        expect(s.tokens.join('').replace(/\s/g, ''), s.id).toBe(s.jp.replace(/\s/g, ''));
      }
      for (const c of [...pack.cloze, ...pack.particles]) {
        expect(c.prompt, c.id).toContain('___');
        expect(c.prompt.replace('___', ''), c.id).not.toContain(c.answer);
      }
      const ids = [...pack.sentences, ...pack.vocab, ...pack.cloze, ...pack.reading, ...pack.particles, ...pack.counters].map((x) => x.id);
      expect(new Set(ids).size, `${lang} ids unique`).toBe(ids.length);
    }
  });

  it('builds every fast game in every language, in that language', () => {
    for (const lang of LANGS) {
      for (const id of FAST) {
        for (const level of [1, 4, 7] as const) {
          const round = buildGameRound(id, level, 'en', 0, content(lang), { salt: 7 });
          expect(round.studyLang).toBe(lang);
          expect(round.jp.length, `${lang} ${id}`).toBeGreaterThan(0);
        }
        expect(gamePoolSize(id, 3, content(lang)), `${lang} ${id} pool`).toBeGreaterThan(0);
      }
    }
    const zhKana = buildGameRound('kana-sprint', 1, 'en', 0, content('zh')) as TypeRound;
    expect(zhKana.answerMode).toBe('pinyin-tone');
    const ruReading = buildGameRound('kanji-reading', 1, 'en', 0, content('ru')) as TypeRound;
    expect(ruReading.answerMode).toBe('stress');
    expect(ruReading.promptLang).toBe('ru');
  });

  it('grades pinyin, tone numbers and Russian stress the way a learner types them', () => {
    const zhRead = buildGameRound('kanji-reading', 1, 'en', 0, content('zh')) as TypeRound;
    const toneless = zhRead.reading!.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s/g, '');
    expect(evaluateRound(zhRead, toneless).correct).toBe(true);
    expect(evaluateRound(zhRead, zhRead.reading!).correct).toBe(true);
    expect(evaluateRound(zhRead, 'xxxx').correct).toBe(false);

    const sprint: TypeRound = { ...(buildGameRound('kana-sprint', 1, 'en', 0, content('zh')) as TypeRound), answer: 'ma1', acceptable: ['ma1'], jp: 'mā', prompt: 'mā' };
    expect(evaluateRound(sprint, 'ma1').correct).toBe(true);
    expect(evaluateRound(sprint, 'mā').correct).toBe(true);
    expect(evaluateRound(sprint, 'ma2').correct).toBe(false);
    expect(evaluateRound(sprint, 'ma').correct).toBe(false);

    const stress: TypeRound = {
      ...(buildGameRound('kanji-reading', 1, 'en', 0, content('ru')) as TypeRound),
      answer: 'водА',
      acceptable: [`вода${STRESS}`],
    };
    expect(evaluateRound(stress, 'водА').correct).toBe(true);
    expect(evaluateRound(stress, `вода${STRESS}`).correct).toBe(true);
    expect(evaluateRound(stress, 'вОда').correct).toBe(false);
    expect(evaluateRound(stress, 'вода').correct).toBe(false);

    const counter = buildGameRound('counter-quiz', 2, 'en', 3, content('ru')) as TypeRound;
    expect(evaluateRound(counter, counter.answer).correct).toBe(true);
  });

  it('deals a different session each time, and never repeats an item while others remain', () => {
    const a = buildSessionRounds('sentence-builder', 3, 'en', 5, content('ja'), { salt: 1 }).map((r) => r.jp);
    const b = buildSessionRounds('sentence-builder', 3, 'en', 5, content('ja'), { salt: 99991 }).map((r) => r.jp);
    expect(new Set(a).size).toBe(5);
    expect(a).not.toEqual(b);
    // Deterministic for a given salt, so a session can be reproduced in a test.
    expect(buildSessionRounds('sentence-builder', 3, 'en', 5, content('ja'), { salt: 1 }).map((r) => r.jp)).toEqual(a);
  });

  it('prefers unseen items, and brings recently missed ones back', () => {
    const pool = GAME_PACKS.ja.sentences.filter((s) => Math.abs(s.level - 3) <= 1).map((s) => s.jp);
    const seen = new Set(pool.slice(0, pool.length - 3));
    const rounds = buildSessionRounds('speed-type', 3, 'en', 3, content('ja'), { salt: 5, seen }).map((r) => r.jp);
    for (const jp of rounds) expect(seen.has(jp)).toBe(false);

    const weak = new Set([pool[0]]);
    const many = Array.from({ length: 12 }, (_, i) => buildSessionRounds('speed-type', 3, 'en', 3, content('ja'), { salt: i, weak }));
    expect(many.some((rounds) => rounds.some((r) => r.jp === pool[0]))).toBe(true);
  });
});

describe('importing game word lists', () => {
  it('reads CSV with a header, and headerless TSV positionally', () => {
    const csv = parseGameList('word,reading,meaning,level,sentence,sentence_translation\n学习,xuéxí,to study,HSK1,我在学习汉语。,I am studying Chinese.\n,,,\n', 'list.csv', 'ja');
    expect(csv.rows).toHaveLength(1);
    expect(csv.skipped).toBe(1);
    expect(csv.lang).toBe('zh');
    expect(csv.rows[0].level).toBe(1);
    const tsv = parseGameList('книга\tкнига\tbook\tA2', 'list.tsv', 'ru');
    expect(tsv.rows[0]).toMatchObject({ word: 'книга', meaning: 'book', level: 2 });
    expect(tierOf('N3')).toBe(4);
  });

  it('reads JSON and turns rows into game items', () => {
    const parsed = parseGameList(JSON.stringify({ items: [{ word: '猫', reading: 'ねこ', meaning: 'cat', sentence: '猫が好きです。', sentenceTranslation: 'I like cats.' }] }), 'x.json', 'ja');
    const list: GameList = { id: 'l1', name: 'Mine', lang: parsed.lang, createdAt: 0, rows: parsed.rows };
    const extras = packExtrasFromLists([list]);
    expect(extras.vocab).toHaveLength(1);
    expect(extras.reading).toHaveLength(1);
    expect(extras.cloze?.[0].prompt).toBe('___が好きです。');
    expect(extras.sentences?.[0].tokens.join('')).toBe('猫が好きです。');
  });

  it('reads Mirror Writing texts with their ideas', () => {
    const { rows, skipped } = parseMirrorTexts(
      'title,level,lang,ideas,reference\nWeekend,2,zh,Say you went to the park | Say it was sunny,周末我去了公园。天气很好。\nBroken,1,ja,,\n',
      'm.csv',
      'ja',
    );
    expect(skipped).toBe(1);
    expect(rows[0]).toMatchObject({ lang: 'zh', level: 2, userImported: true });
    expect(rows[0].ideaMap).toHaveLength(2);
  });
});
