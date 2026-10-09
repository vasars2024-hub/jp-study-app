/**
 * The study coach's tool adapters: the Agent's five everyday requests, answered from the
 * learner's own data (`shared/agentStudyCoach.ts` holds every decision; this reads the stores
 * and writes through their owners).
 *
 *   study.recommend-next      what to study now, from the deck's queue, the review log and Statistics
 *   study.cards-from-text     unknown words in a text, with readings and meanings, ready to add
 *   study.quiz-mined-today    today's mined words, played in the Game Arena
 *   study.plan-week           seven days of sessions sized to the reviews coming due
 *   calendar.schedule-sessions  the planned sessions, added to the calendar (confirmed step)
 *   dictionary.analyze-sentence / dictionary.explain-grammar   the grammar library, applied
 *
 * Every read answer carries citations — which store each figure came from — so the learner
 * can check what the Agent based its answer on.
 */
import type { AgentToolHandlers } from '../shared/localAgent';
import {
  agentStudyAnswer,
  cardCandidatesFromText,
  matchSentenceGrammar,
  partOfSpeechKey,
  planStudyWeek,
  recommendNextStudy,
  splitStudySentences,
  weekPlanSessions,
  type AgentAnswerLine,
  type AgentCitation,
  type GrammarPatternEntry,
  type RecipeCard,
  type RecipeSession,
  type TextWord,
  type WeekPlanDay,
} from '../shared/agentStudyCoach';
import { summarizeReviewLog } from '../shared/reviewLog';
import { localDueForecast } from '../shared/reviewForecast';
import { normalizeStudyLang } from '../shared/studyLang';
import { segmentStudyText, studyWordKey } from '../shared/studySegmentation';
import { studyWordStatus } from '../shared/gameStudyMix';
import type { TVars } from '../shared/i18n/core';
import { dueDeckCards, loadDeck, type DeckFlashcard } from './flashcardDeck';
import { getLevel } from './knownWords';
import { getStudyLang } from './studyEnvironment';
import { getSummary, getStudyDayActivity, todayDayKey } from './stats';
import { loadReviewLog } from './reviewLog';
import { addEvent, CATEGORY_COLORS, expandOccurrences, loadEvents } from './calendar';
import { getActiveProfile } from './profileState';
import { getTokenizer, tokenizeSync } from './tokenizer';
import { requestArenaGame } from './games/arenaIntent';
import { warmUpDoneToday } from './games/warmUp';
import { GRAMMAR } from './data/grammar';

type Translate = (key: string, vars?: TVars) => string;

const SECONDS_PER_REVIEW = 8;
const MAX_TEXT = 2000;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function studyCards(): DeckFlashcard[] {
  const lang = getStudyLang();
  return loadDeck().filter((card) => normalizeStudyLang(card.studyLang) === lang);
}

function startOfToday(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function toHiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

function textArgument(t: Translate, args: Readonly<Record<string, unknown>>, name: string): string {
  const value = args[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(t('blanc.agent.error.needsArgument', { name }));
  return value.trim().slice(0, MAX_TEXT);
}

/* ------------------------------------------------------------------ *
 * What to study now.
 * ------------------------------------------------------------------ */

async function recommendNow() {
  const now = Date.now();
  const cards = studyCards();
  const due = dueDeckCards(cards, now).length;
  let learning = 0;
  let newAvailable = 0;
  for (const card of cards) {
    const status = studyWordStatus(card.srs, 0, now);
    if (!card.srs) newAvailable += 1;
    else if (status === 'learning') learning += 1;
  }
  const minedToday = cards.filter((card) => card.addedAt >= startOfToday(now)).length;
  const summary = getSummary();
  const log = summarizeReviewLog(await loadReviewLog().catch(() => []), 14, now);
  const book = summary.books[0];
  const todayBooks = getStudyDayActivity(todayDayKey())?.books ?? {};
  const recommendations = recommendNextStudy({
    dueNow: due,
    learning,
    newAvailable,
    minedToday,
    reviewsToday: summary.todayReviews,
    dailyAverage: log.dailyAverage,
    warmUpDone: warmUpDoneToday(),
    ...(book ? { book: { title: book.title, minutesToday: Math.round((todayBooks[book.id]?.seconds ?? 0) / 60) } } : {}),
    secondsPerReview: SECONDS_PER_REVIEW,
  });
  const citations: AgentCitation[] = [
    { source: 'deck', key: 'agent2.cite.deckQueue', vars: { due, learning, fresh: newAvailable } },
    { source: 'review-log', key: 'agent2.cite.reviewLog', vars: { count: log.reviews, average: log.dailyAverage } },
    { source: 'stats', key: 'agent2.cite.statsToday', vars: { reviews: summary.todayReviews, minutes: Math.round(summary.todayStudySeconds / 60) } },
  ];
  if (minedToday > 0) citations.push({ source: 'mined', key: 'agent2.cite.minedToday', vars: { count: minedToday } });
  return {
    recommendations: recommendations.map((rec) => ({ id: rec.id, ...rec.vars })),
    answer: agentStudyAnswer(
      'agent2.answer.recommend',
      recommendations.map((rec) => ({ key: rec.key, vars: rec.vars, ...(rec.study ? { study: rec.study } : {}) })),
      citations,
      recommendations.flatMap((rec) => (rec.action ? [rec.action] : [])).slice(0, 3),
    ),
  };
}

/* ------------------------------------------------------------------ *
 * Cards from a text.
 * ------------------------------------------------------------------ */

/** The words of a text, per sentence, as the study language segments them. */
async function textWords(text: string): Promise<{ sentence: string; words: TextWord[] }[]> {
  const lang = getStudyLang();
  const sentences = splitStudySentences(text);
  if (lang === 'ja') {
    await getTokenizer();
    return sentences.map((sentence) => ({
      sentence,
      words: tokenizeSync(sentence).map((token) => ({
        surface: token.surface,
        lemma: token.lemma,
        ...(token.reading ? { reading: toHiragana(token.reading) } : {}),
        content: token.content && !token.proper,
      })),
    }));
  }
  return sentences.map((sentence) => ({
    sentence,
    words: segmentStudyText(sentence, lang)
      .filter((part) => part.wordLike)
      .map((part) => ({ surface: part.text, lemma: part.text, content: true })),
  }));
}

/** A dictionary meaning and reading for a word, or nothing (offline, or not in the dictionary). */
async function lookupGloss(word: string): Promise<{ reading?: string; meaning?: string }> {
  try {
    const lang = getStudyLang();
    const result = await window.api.lookupTerm(word, 1, lang);
    const entry = result?.entries?.[0];
    if (!entry) return {};
    const meaning = entry.senses?.[0]?.definitions?.slice(0, 3).join('; ');
    return { ...(entry.reading ? { reading: entry.reading } : {}), ...(meaning ? { meaning } : {}) };
  } catch {
    return {};
  }
}

/** Unknown words of `text` not yet in the deck, with readings and meanings. Shared with the recipe planner. */
export async function findCardCandidates(text: string, limit = 12): Promise<{
  cards: RecipeCard[];
  known: number;
  inDeck: number;
}> {
  const lang = getStudyLang();
  const deckWords = new Set<string>();
  for (const card of studyCards()) {
    deckWords.add(card.word);
    deckWords.add(studyWordKey(card.word, lang));
  }
  const level = (lemma: string, surface: string): number =>
    Math.max(getLevel(lemma), getLevel(surface), lang === 'ja' ? 0 : getLevel(studyWordKey(surface, lang)));
  const found = cardCandidatesFromText(
    await textWords(text.slice(0, MAX_TEXT)),
    level,
    (lemma, surface) => deckWords.has(lemma) || deckWords.has(surface) || deckWords.has(studyWordKey(surface, lang)),
    Math.min(25, Math.max(1, Math.round(limit))),
  );
  const glosses = await Promise.all(found.candidates.map((candidate) => lookupGloss(candidate.word)));
  return {
    cards: found.candidates.map((candidate, i) => ({
      word: candidate.word,
      ...(glosses[i].reading || candidate.reading ? { reading: glosses[i].reading ?? candidate.reading } : {}),
      ...(glosses[i].meaning ? { meaning: glosses[i].meaning } : {}),
      sentence: candidate.sentence,
    })),
    known: found.known,
    inDeck: found.inDeck,
  };
}

async function cardsFromText(t: Translate, args: Readonly<Record<string, unknown>>) {
  const text = textArgument(t, args, 'text');
  const limit = typeof args.limit === 'number' ? args.limit : 12;
  const found = await findCardCandidates(text, limit);
  const lines: AgentAnswerLine[] = found.cards.length
    ? found.cards.map((card) => ({
        key: card.meaning ? 'agent2.cards.line' : 'agent2.cards.lineNoMeaning',
        vars: { reading: card.reading ?? '', meaning: card.meaning ?? '' },
        study: card.word,
      }))
    : [{ key: 'agent2.cards.none' }];
  return {
    cards: found.cards,
    answer: agentStudyAnswer('agent2.answer.cards', lines, [
      { source: 'known-words', key: 'agent2.cite.knownSkipped', vars: { count: found.known } },
      { source: 'deck', key: 'agent2.cite.deckSkipped', vars: { count: found.inDeck } },
      { source: 'dictionary', key: 'agent2.cite.dictionary', vars: { count: found.cards.filter((card) => card.meaning).length } },
    ], [], { count: found.cards.length }),
  };
}

/* ------------------------------------------------------------------ *
 * Today's mined words, played.
 * ------------------------------------------------------------------ */

function quizMinedToday() {
  const today = startOfToday();
  const cards = studyCards().filter((card) => card.addedAt >= today && card.word.trim() && card.meaning.trim());
  if (!cards.length) {
    return {
      words: [],
      answer: agentStudyAnswer('agent2.answer.quiz', [{ key: 'agent2.quiz.none' }], [
        { source: 'deck', key: 'agent2.cite.minedToday', vars: { count: 0 } },
      ], [{ kind: 'open-section', section: 'flashcards', labelKey: 'agent2.action.deck' }]),
    };
  }
  const withSentence = cards.filter((card) => card.sentence && card.sentence.includes(card.word)).length;
  const gameId = withSentence >= 3 ? 'cloze-blitz' : cards.length >= 4 ? 'word-match' : 'reverse-recall';
  const rounds = Math.min(10, Math.max(3, cards.length));
  requestArenaGame({ gameId, autostart: true, material: 'mined-today', rounds });
  return {
    words: cards.slice(0, 20).map((card) => card.word),
    gameId,
    answer: agentStudyAnswer(
      'agent2.answer.quiz',
      [
        { key: `agent2.quiz.started.${gameId}`, vars: { count: cards.length, rounds } },
        ...cards.slice(0, 8).map((card) => ({ key: 'agent2.quiz.word', vars: { meaning: card.meaning }, study: card.word })),
      ],
      [{ source: 'mined', key: 'agent2.cite.minedToday', vars: { count: cards.length } }],
    ),
  };
}

/* ------------------------------------------------------------------ *
 * A week of study.
 * ------------------------------------------------------------------ */

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Seven days of sessions from the deck's schedule, around the calendar's own study events. Shared with the recipe planner. */
export async function computeWeekPlan(t: Translate, startTime = '19:00'): Promise<{
  days: WeekPlanDay[];
  sessions: RecipeSession[];
  average: number;
  busy: number;
}> {
  const now = new Date();
  const cards = studyCards();
  const forecast = localDueForecast(cards, 7, now.getTime());
  const duePerDay = forecast.days.map((day, i) => (i === 0 ? dueDeckCards(cards, now.getTime()).length : day.due));
  const log = summarizeReviewLog(await loadReviewLog().catch(() => []), 14, now.getTime());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6);
  const busyDays = new Set(
    expandOccurrences(loadEvents(), now, end)
      .filter((occurrence) => occurrence.category === 'study')
      .map((occurrence) => occurrence.occurrenceDate),
  );
  const days = planStudyWeek({
    today: dateKey(now),
    duePerDay,
    dailyAverage: log.dailyAverage,
    busyDays,
    startTime,
    secondsPerReview: SECONDS_PER_REVIEW,
    newPerDay: getActiveProfile().deckParams.newPerDay,
  });
  const sessions = weekPlanSessions(days, startTime, (day) =>
    day.focus === 'light'
      ? t('agent2.plan.sessionLight', { minutes: day.minutes })
      : t('agent2.plan.sessionTitle', { minutes: day.minutes, count: day.due }),
  );
  return { days, sessions, average: log.dailyAverage, busy: busyDays.size };
}

async function planWeek(t: Translate, args: Readonly<Record<string, unknown>>) {
  const startTime = typeof args.startTime === 'string' && TIME.test(args.startTime) ? args.startTime : '19:00';
  const plan = await computeWeekPlan(t, startTime);
  const lines: AgentAnswerLine[] = plan.days.map((day) => ({
    key: `agent2.plan.day.${day.focus}`,
    vars: { date: day.date, minutes: day.minutes, count: day.due },
  }));
  return {
    days: plan.days,
    sessions: plan.sessions,
    answer: agentStudyAnswer('agent2.answer.plan', lines, [
      { source: 'deck', key: 'agent2.cite.forecast', vars: { count: plan.days.reduce((sum, day) => sum + day.due, 0) } },
      { source: 'review-log', key: 'agent2.cite.average', vars: { average: plan.average } },
      { source: 'calendar', key: 'agent2.cite.busyDays', vars: { count: plan.busy } },
    ]),
  };
}

function scheduleSessions(t: Translate, args: Readonly<Record<string, unknown>>) {
  if (!Array.isArray(args.sessions) || !args.sessions.length) {
    throw new Error(t('blanc.agent.error.needsArgument', { name: 'sessions' }));
  }
  const existing = loadEvents();
  const created: string[] = [];
  let skipped = 0;
  for (const raw of args.sessions.slice(0, 14)) {
    if (!raw || typeof raw !== 'object') continue;
    const session = raw as Record<string, unknown>;
    const title = typeof session.title === 'string' ? session.title.trim().slice(0, 200) : '';
    const date = typeof session.date === 'string' ? session.date : '';
    const startTime = typeof session.startTime === 'string' && TIME.test(session.startTime) ? session.startTime : undefined;
    const endTime = typeof session.endTime === 'string' && TIME.test(session.endTime) ? session.endTime : undefined;
    if (!title || !DATE.test(date)) {
      skipped += 1;
      continue;
    }
    // Running the same plan twice must not double the week.
    if (existing.some((event) => event.date === date && event.title === title && event.startTime === startTime)) {
      skipped += 1;
      continue;
    }
    const event = addEvent({
      title,
      date,
      ...(startTime ? { startTime } : {}),
      ...(endTime ? { endTime } : {}),
      allDay: !startTime,
      color: CATEGORY_COLORS.study,
      category: 'study',
      reminder: 'none',
      recurrence: 'none',
    });
    created.push(event.id);
  }
  return {
    createdIds: created,
    answer: agentStudyAnswer('agent2.answer.scheduled', [
      { key: 'agent2.schedule.created', vars: { count: created.length } },
      ...(skipped ? [{ key: 'agent2.schedule.skipped', vars: { count: skipped } }] : []),
    ], [{ source: 'calendar', key: 'agent2.cite.calendarWrite', vars: { count: created.length } }], [
      { kind: 'open-section', section: 'calendar', labelKey: 'agent2.action.calendar' },
    ]),
  };
}

/* ------------------------------------------------------------------ *
 * Grammar.
 * ------------------------------------------------------------------ */

function grammarEntries(): GrammarPatternEntry[] {
  const lang = getStudyLang();
  return GRAMMAR
    .filter((point) => (point.lang ?? 'ja') === lang)
    .map((point) => ({ id: point.id, title: point.title, meaning: point.meaning, level: String(point.level), structure: point.structure }));
}

async function analyzeSentence(t: Translate, args: Readonly<Record<string, unknown>>) {
  const sentence = textArgument(t, args, 'term').slice(0, 400);
  const lang = getStudyLang();
  let tokens: Array<{ surface: string; lemma: string; reading?: string; posKey: string; known: number }> = [];
  if (lang === 'ja') {
    await getTokenizer();
    tokens = tokenizeSync(sentence).map((token) => ({
      surface: token.surface,
      lemma: token.lemma,
      ...(token.reading ? { reading: toHiragana(token.reading) } : {}),
      posKey: partOfSpeechKey(token.pos),
      known: Math.max(getLevel(token.lemma), getLevel(token.surface)),
    }));
  } else {
    tokens = segmentStudyText(sentence, lang)
      .filter((part) => part.wordLike)
      .map((part) => ({
        surface: part.text,
        lemma: part.text,
        posKey: 'agent2.pos.other',
        known: Math.max(getLevel(part.text), getLevel(studyWordKey(part.text, lang))),
      }));
  }
  const lemmaText = tokens.map((token) => token.lemma).join('');
  const grammar = matchSentenceGrammar(sentence, lemmaText, grammarEntries());
  const unknown = tokens.filter((token) => token.known < 2 && token.posKey !== 'agent2.pos.particle' && token.posKey !== 'agent2.pos.symbol' && token.posKey !== 'agent2.pos.auxiliary');
  const lines: AgentAnswerLine[] = [
    ...grammar.map((hit) => ({ key: 'agent2.grammar.hit', vars: { level: hit.level, meaning: hit.meaning }, study: hit.title })),
    ...(grammar.length ? [] : [{ key: 'agent2.grammar.none' }]),
    ...tokens.slice(0, 30).map((token) => ({
      key: token.reading && token.reading !== token.surface ? 'agent2.grammar.tokenReading' : 'agent2.grammar.token',
      vars: { reading: token.reading ?? '', pos: t(token.posKey), lemma: token.lemma },
      study: token.surface,
    })),
  ];
  return {
    tokens: tokens.slice(0, 60),
    grammar,
    answer: agentStudyAnswer('agent2.answer.analyze', lines, [
      { source: 'grammar', key: 'agent2.cite.grammar', vars: { count: grammar.length } },
      { source: 'known-words', key: 'agent2.cite.unknownWords', vars: { count: unknown.length } },
    ], grammar.length
      ? [{ kind: 'open-section', section: 'grammar', labelKey: 'agent2.action.grammar' }]
      : []),
  };
}

function explainGrammar(t: Translate, args: Readonly<Record<string, unknown>>) {
  const term = textArgument(t, args, 'term').slice(0, 200);
  const bare = term.replace(/[〜～~\s]/g, '');
  const entries = grammarEntries();
  // A pattern named directly first; else the patterns the text contains.
  const direct = entries.filter((entry) => entry.title.replace(/[〜～~\s]/g, '') === bare);
  const hits = direct.length ? direct.slice(0, 3) : matchSentenceGrammar(term, term, entries, 3);
  const points = hits
    .map((hit) => GRAMMAR.find((point) => point.id === hit.id))
    .filter((point): point is (typeof GRAMMAR)[number] => point !== undefined);
  const lines: AgentAnswerLine[] = points.length
    ? points.flatMap((point): AgentAnswerLine[] => [
        { key: 'agent2.grammar.hit', vars: { level: String(point.level), meaning: point.meaning }, study: point.title },
        ...(point.structure ? [{ key: 'agent2.grammar.structure', vars: { structure: point.structure } }] : []),
        ...(point.examples?.[0]?.jp ? [{ key: 'agent2.grammar.example', study: point.examples[0].jp }] : []),
      ])
    : [{ key: 'agent2.grammar.none' }];
  return {
    points: points.map((point) => ({ id: point.id, title: point.title, level: point.level, meaning: point.meaning })),
    answer: agentStudyAnswer('agent2.answer.explain', lines, [
      { source: 'grammar', key: 'agent2.cite.grammar', vars: { count: points.length } },
    ], points.length ? [{ kind: 'open-section', section: 'grammar', labelKey: 'agent2.action.grammar' }] : []),
  };
}

export function createStudyCoachAgentHandlers(t: Translate): AgentToolHandlers {
  return {
    'study.recommend-next': () => recommendNow(),
    'study.cards-from-text': (args) => cardsFromText(t, args),
    'study.quiz-mined-today': () => quizMinedToday(),
    'study.plan-week': (args) => planWeek(t, args),
    'calendar.schedule-sessions': (args) => scheduleSessions(t, args),
    'dictionary.analyze-sentence': (args) => analyzeSentence(t, args),
    'dictionary.explain-grammar': (args) => explainGrammar(t, args),
  };
}
