/**
 * The Agent's study coach: the five core study requests, answered from the learner's own data
 * by deterministic tools, and planned without a language model.
 *
 * A 1.7B local model is a poor router for "what should I study now?": it invents operation
 * ids, drops required arguments, and takes 10-30 s to load before it says anything. These
 * requests are also the ones a learner makes every day. So each has:
 *
 *   - **a recipe** (`detectAgentStudyIntent` + `studyRecipeSteps`): the request is recognised
 *     in any of the four UI languages and turned straight into a plan of approved tool steps.
 *     It runs with no model installed, instantly, and through the same queue, permission check
 *     and Run / Confirm buttons as a model's plan — nothing about governance is skipped.
 *   - **a tool** that reads the app's data and answers with **citations**: every line of the
 *     answer says which store it came from (deck, review log, statistics, calendar, known
 *     words, mining history, grammar library), so the learner can check it.
 *
 * Pure: data in, decisions and answer structures out. Answers carry catalog KEYS, never
 * English, so a persisted answer re-renders in whatever language the UI is in.
 */
import type { AgentTaskStepInput, AgentToolOperationId } from './localAgent';

/* ------------------------------------------------------------------ *
 * Answers with citations.
 * ------------------------------------------------------------------ */

export type AgentCitationSource =
  | 'deck'
  | 'review-log'
  | 'stats'
  | 'calendar'
  | 'known-words'
  | 'mined'
  | 'grammar'
  | 'dictionary'
  | 'arena';

export type AgentAnswerVars = Record<string, string | number>;

export interface AgentAnswerLine {
  key: string;
  vars?: AgentAnswerVars;
  /** Study content shown verbatim beside the line (a word, a sentence, a title). Never translated. */
  study?: string;
}

export interface AgentCitation {
  source: AgentCitationSource;
  key: string;
  vars?: AgentAnswerVars;
}

/** Something the learner can do from the answer. Navigation only: nothing here writes data. */
export type AgentAnswerAction =
  | { kind: 'open-section'; section: string; labelKey: string }
  | { kind: 'arena'; gameId: string; material?: string; rounds?: number; labelKey: string }
  | { kind: 'deck-search'; search: string; labelKey: string };

export interface AgentStudyAnswer {
  kind: 'agent2-answer';
  titleKey: string;
  titleVars?: AgentAnswerVars;
  lines: AgentAnswerLine[];
  citations: AgentCitation[];
  actions?: AgentAnswerAction[];
}

export function agentStudyAnswer(
  titleKey: string,
  lines: AgentAnswerLine[],
  citations: AgentCitation[],
  actions: AgentAnswerAction[] = [],
  titleVars?: AgentAnswerVars,
): AgentStudyAnswer {
  return {
    kind: 'agent2-answer',
    titleKey,
    ...(titleVars ? { titleVars } : {}),
    lines,
    citations,
    ...(actions.length ? { actions } : {}),
  };
}

/** A tool result that carries a study answer (results are persisted, so this is checked, not assumed). */
export function studyAnswerOf(result: unknown): AgentStudyAnswer | null {
  if (!result || typeof result !== 'object') return null;
  const answer = (result as { answer?: unknown }).answer;
  if (!answer || typeof answer !== 'object') return null;
  const candidate = answer as Partial<AgentStudyAnswer>;
  if (candidate.kind !== 'agent2-answer' || typeof candidate.titleKey !== 'string') return null;
  if (!Array.isArray(candidate.lines) || !Array.isArray(candidate.citations)) return null;
  return candidate as AgentStudyAnswer;
}

/* ------------------------------------------------------------------ *
 * Recipes: the core requests, recognised and planned without a model.
 * ------------------------------------------------------------------ */

export type AgentStudyIntent = 'recommend' | 'cards-from-text' | 'explain-grammar' | 'quiz-mined' | 'plan-week';

export interface DetectedStudyIntent {
  intent: AgentStudyIntent;
  /** The study text the request is about (after a colon, in quotes, or on the next line). */
  text?: string;
}

const PATTERNS: Array<[AgentStudyIntent, RegExp]> = [
  [
    'cards-from-text',
    /\b(make|create|generate|build|turn)\b[^.?!]{0,40}\b(flash ?)?cards?\b|カードを?(作|つく)|カード化|(做|制作|生成)[^。？]{0,8}(卡片|闪卡)|карточк[иау]?\s*(из|по)|(сделай|создай)[^.?!]{0,20}карточк/i,
  ],
  [
    'explain-grammar',
    /\b(explain|break down|analy[sz]e)\b[^.?!]{0,40}\b(grammar|sentence)\b|\bgrammar of\b|文法を?(説明|解説|教えて)|この文の文法|(解释|讲解|分析)[^。？]{0,10}(语法|句子)|(объясни|разбери)[^.?!]{0,30}(грамматик|предложени)/i,
  ],
  [
    'quiz-mined',
    /\b(quiz|test|drill)\b[^.?!]{0,30}\b(today|mined|new)\b|今日[^。？]{0,10}(クイズ|テスト|覚えた|採掘|マイニング)|(クイズ|テスト)[^。？]{0,10}今日|今天[^。？]{0,10}(测验|测试|考|挖)|(测验|考考)我[^。？]{0,10}今天|(проверь|протестируй|погоняй|экзамен)[^.?!]{0,30}сегодня|сегодняшн[^.?!]{0,20}(слов|карточ)/i,
  ],
  [
    'plan-week',
    /\bplan\b[^.?!]{0,20}\b(my|the|this|next)?\s*week\b|\bweek(ly)? (study )?plan\b|\bstudy schedule\b|(今週|一週間|来週)[^。？]{0,10}(計画|予定|プラン)|(本周|这周|一周|下周)[^。？]{0,10}(计划|安排)|(规划|计划|安排)[^。？]{0,10}(周|星期)|(план|расписани)[^.?!]{0,20}недел|спланируй[^.?!]{0,20}недел/i,
  ],
  [
    'recommend',
    /\bwhat (should|do|can) i (study|learn|review|do)\b|\bwhat('?s| is) next\b|\bstudy (now|today)\b|\bwhere (should|do) i start\b|何を?(勉強|学習|復習)(すれば|したら|しよう)|今(何|なに)を|(该|应该)(学|复习)什么|学什么|现在学|что (мне )?(учить|повторить|изучать|делать)|с чего начать/i,
  ],
];

/** The study text a request names: after a colon, inside quotes or brackets, or on the next line. */
export function recipeText(objective: string): string {
  const text = objective.trim();
  const quoted = text.match(/[「『“"«]([\s\S]+?)[」』”"»]/);
  if (quoted?.[1]?.trim()) return quoted[1].trim();
  const newline = text.indexOf('\n');
  if (newline >= 0 && text.slice(newline + 1).trim()) return text.slice(newline + 1).trim();
  const colon = text.search(/[:：]/);
  if (colon >= 0 && text.slice(colon + 1).trim()) return text.slice(colon + 1).trim();
  return '';
}

/**
 * Which core request this is, if any. Requests that need a text (cards, grammar) only match
 * when they carry one; without it the request is left to the model planner, which can ask.
 */
export function detectAgentStudyIntent(objective: string): DetectedStudyIntent | null {
  const text = objective.trim();
  if (!text) return null;
  // Match on the instruction, not on the study text inside it: a pasted sentence that happens
  // to contain "week" must not turn a grammar request into a week plan.
  const studyText = recipeText(text);
  const head = studyText ? text.replace(studyText, ' ') : text;
  for (const [intent, pattern] of PATTERNS) {
    if (!pattern.test(head)) continue;
    if (intent === 'cards-from-text' || intent === 'explain-grammar') {
      if (!studyText) return null;
      return { intent, text: studyText.slice(0, 2000) };
    }
    return { intent };
  }
  return null;
}

/** The operations each recipe needs, so a caller can check them against the profile first. */
export const STUDY_RECIPE_OPERATIONS: Readonly<Record<AgentStudyIntent, readonly AgentToolOperationId[]>> = {
  recommend: ['study.recommend-next'],
  'cards-from-text': ['study.cards-from-text', 'flashcard.add-cards'],
  'explain-grammar': ['dictionary.analyze-sentence'],
  'quiz-mined': ['study.quiz-mined-today'],
  'plan-week': ['study.plan-week', 'calendar.schedule-sessions'],
};

export interface RecipeCard {
  word: string;
  reading?: string;
  meaning?: string;
  sentence?: string;
}

export interface RecipeSession {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
}

type Label = (key: string, vars?: AgentAnswerVars) => string;

/**
 * The plan for a recipe. Read steps come first, so the learner sees what the tool found
 * before any step that writes; a write step is planned only when there is something to
 * write, and it carries exactly what will be written, visible in the plan before Run.
 */
export function studyRecipeSteps(
  detected: DetectedStudyIntent,
  label: Label,
  taskId: string,
  extra: { cards?: readonly RecipeCard[]; sessions?: readonly RecipeSession[]; folder?: string } = {},
): AgentTaskStepInput[] {
  const step = (index: number, operation: AgentToolOperationId, key: string, args: Record<string, unknown>, vars?: AgentAnswerVars) => ({
    id: `${taskId}-step-${index}`,
    label: label(key, vars),
    request: { callId: `${taskId}-call-${index}`, operation, arguments: args },
  });
  switch (detected.intent) {
    case 'recommend':
      return [step(1, 'study.recommend-next', 'agent2.step.recommend', {})];
    case 'explain-grammar':
      return [step(1, 'dictionary.analyze-sentence', 'agent2.step.analyze', { term: detected.text ?? '' })];
    case 'quiz-mined':
      return [step(1, 'study.quiz-mined-today', 'agent2.step.quiz', {})];
    case 'cards-from-text': {
      const steps = [step(1, 'study.cards-from-text', 'agent2.step.findWords', { text: detected.text ?? '' })];
      const cards = (extra.cards ?? []).slice(0, 25);
      if (cards.length) {
        steps.push(step(2, 'flashcard.add-cards', 'agent2.step.addCards', {
          cards: cards.map((card) => ({
            word: card.word,
            ...(card.reading ? { reading: card.reading } : {}),
            ...(card.meaning ? { meaning: card.meaning } : {}),
            ...(card.sentence ? { sentence: card.sentence } : {}),
            ...(extra.folder ? { folder: extra.folder } : {}),
          })),
        }, { count: cards.length }));
      }
      return steps;
    }
    case 'plan-week': {
      const steps = [step(1, 'study.plan-week', 'agent2.step.planWeek', {})];
      const sessions = (extra.sessions ?? []).slice(0, 14);
      if (sessions.length) {
        steps.push(step(2, 'calendar.schedule-sessions', 'agent2.step.schedule', { sessions }, { count: sessions.length }));
      }
      return steps;
    }
    default:
      return [];
  }
}

/* ------------------------------------------------------------------ *
 * "What should I study now?"
 * ------------------------------------------------------------------ */

export interface RecommendInput {
  dueNow: number;
  learning: number;
  newAvailable: number;
  minedToday: number;
  reviewsToday: number;
  /** Average reviews per day over the last two weeks. */
  dailyAverage: number;
  warmUpDone: boolean;
  /** Most recently read book, when one exists and how much was read today. */
  book?: { title: string; minutesToday: number };
  /** Seconds a review takes on average (for the time estimate). */
  secondsPerReview?: number;
}

export interface Recommendation {
  id: 'reviews' | 'mined' | 'warm-up' | 'learning' | 'new-cards' | 'reading' | 'rest';
  key: string;
  vars: AgentAnswerVars;
  study?: string;
  action?: AgentAnswerAction;
}

/**
 * The next things to study, most important first. Due reviews always lead (they decay);
 * today's mined words next (fresh memories are cheapest to fix); then the daily warm-up,
 * the words still being learned, new cards, and reading. With nothing at all to do, a rest.
 */
export function recommendNextStudy(input: RecommendInput): Recommendation[] {
  const perReview = input.secondsPerReview && input.secondsPerReview > 0 ? input.secondsPerReview : 8;
  const out: Recommendation[] = [];
  if (input.dueNow > 0) {
    out.push({
      id: 'reviews',
      key: 'agent2.rec.reviews',
      vars: { count: input.dueNow, minutes: Math.max(1, Math.round((input.dueNow * perReview) / 60)) },
      action: { kind: 'open-section', section: 'flashcards', labelKey: 'agent2.action.reviews' },
    });
  }
  if (input.minedToday > 0) {
    out.push({
      id: 'mined',
      key: 'agent2.rec.mined',
      vars: { count: input.minedToday },
      action: { kind: 'arena', gameId: 'reverse-recall', material: 'mined-today', rounds: Math.min(10, Math.max(3, input.minedToday)), labelKey: 'agent2.action.quiz' },
    });
  }
  if (!input.warmUpDone) {
    out.push({ id: 'warm-up', key: 'agent2.rec.warmUp', vars: {}, action: { kind: 'open-section', section: 'games', labelKey: 'agent2.action.games' } });
  }
  if (input.learning > 0 && input.dueNow === 0) {
    out.push({
      id: 'learning',
      key: 'agent2.rec.learning',
      vars: { count: input.learning },
      action: { kind: 'arena', gameId: 'word-match', material: 'due', labelKey: 'agent2.action.practice' },
    });
  }
  if (input.newAvailable > 0 && input.dueNow < 50) {
    out.push({ id: 'new-cards', key: 'agent2.rec.newCards', vars: { count: Math.min(input.newAvailable, 10) } });
  }
  if (input.book && input.book.minutesToday < 10) {
    out.push({
      id: 'reading',
      key: 'agent2.rec.reading',
      vars: {},
      study: input.book.title,
      action: { kind: 'open-section', section: 'library', labelKey: 'agent2.action.read' },
    });
  }
  if (!out.length) out.push({ id: 'rest', key: 'agent2.rec.rest', vars: { reviews: input.reviewsToday } });
  return out;
}

/* ------------------------------------------------------------------ *
 * "Plan my week."
 * ------------------------------------------------------------------ */

export interface WeekPlanInput {
  /** Local `YYYY-MM-DD` of today. */
  today: string;
  /** Reviews due on each of the next seven days (today first, overdue included in today). */
  duePerDay: readonly number[];
  /** Reviews per day recently, for how long a review session should be. */
  dailyAverage: number;
  /** Days that already have a study event, which are left alone. */
  busyDays: ReadonlySet<string>;
  /** Preferred start, `HH:MM`. */
  startTime?: string;
  secondsPerReview?: number;
  /** New cards per day the profile allows. */
  newPerDay?: number;
}

export interface WeekPlanDay {
  date: string;
  due: number;
  minutes: number;
  focus: 'reviews' | 'reviews-new' | 'light' | 'skip';
}

function addDaysKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const next = new Date(y, (m || 1) - 1, (d || 1) + days);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + minutes));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Seven days of study: each day's session sized to its due reviews plus new cards (15 to 60
 * minutes), the lightest-load day marked light (a short session, no new cards), and any day
 * that already has a study event in the calendar skipped rather than doubled.
 */
export function planStudyWeek(input: WeekPlanInput): WeekPlanDay[] {
  const perReview = input.secondsPerReview && input.secondsPerReview > 0 ? input.secondsPerReview : 8;
  const newPerDay = Math.max(0, input.newPerDay ?? 10);
  const days = Array.from({ length: 7 }, (_, i) => ({
    date: addDaysKey(input.today, i),
    due: Math.max(0, Math.round(input.duePerDay[i] ?? 0)),
  }));
  const open = days.filter((day) => !input.busyDays.has(day.date));
  const lightest = open.length > 2
    ? open.reduce((low, day) => (day.due < low.due ? day : low), open[0]).date
    : null;
  return days.map((day) => {
    if (input.busyDays.has(day.date)) return { ...day, minutes: 0, focus: 'skip' as const };
    const light = day.date === lightest;
    const reviewMinutes = (day.due * perReview) / 60;
    const newMinutes = light ? 0 : (newPerDay * perReview * 3) / 60;
    const minutes = Math.min(60, Math.max(light ? 10 : 15, Math.round((reviewMinutes + newMinutes) / 5) * 5));
    return { ...day, minutes, focus: light ? 'light' as const : newPerDay > 0 ? 'reviews-new' as const : 'reviews' as const };
  });
}

/** The calendar sessions a week plan becomes (skipped days have none). */
export function weekPlanSessions(plan: readonly WeekPlanDay[], startTime: string, title: (day: WeekPlanDay) => string): RecipeSession[] {
  const start = /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) ? startTime : '19:00';
  return plan
    .filter((day) => day.focus !== 'skip' && day.minutes > 0)
    .map((day) => ({ title: title(day), date: day.date, startTime: start, endTime: addMinutes(start, day.minutes) }));
}

/* ------------------------------------------------------------------ *
 * "Make cards from this text."
 * ------------------------------------------------------------------ */

export interface TextWord {
  /** The form in the text. */
  surface: string;
  /** Dictionary form. */
  lemma: string;
  reading?: string;
  /** Vocabulary worth a card (not a particle, symbol or proper noun). */
  content: boolean;
}

/** Sentences of a text, split on sentence-final punctuation and line breaks. */
export function splitStudySentences(text: string): string[] {
  return text
    .split(/(?<=[。！？!?．.])\s*|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * The words of a text worth a card: content words the learner does not know yet (known-word
 * level under 2) and does not already have in the deck, once each, most frequent first, then
 * in order of appearance. Each carries the sentence it first appeared in.
 */
export function cardCandidatesFromText(
  sentences: readonly { sentence: string; words: readonly TextWord[] }[],
  knownLevel: (lemma: string, surface: string) => number,
  inDeck: (lemma: string, surface: string) => boolean,
  limit = 12,
): { candidates: Array<{ word: string; reading?: string; sentence: string; count: number }>; known: number; inDeck: number } {
  const byLemma = new Map<string, { word: string; reading?: string; sentence: string; count: number; order: number }>();
  let known = 0;
  let deck = 0;
  const seenKnown = new Set<string>();
  const seenDeck = new Set<string>();
  let order = 0;
  for (const { sentence, words } of sentences) {
    for (const word of words) {
      if (!word.content) continue;
      const lemma = (word.lemma || word.surface).trim();
      if (!lemma || /^[\p{P}\p{S}\d\s]+$/u.test(lemma)) continue;
      if (knownLevel(lemma, word.surface) >= 2) {
        if (!seenKnown.has(lemma)) known += 1;
        seenKnown.add(lemma);
        continue;
      }
      if (inDeck(lemma, word.surface)) {
        if (!seenDeck.has(lemma)) deck += 1;
        seenDeck.add(lemma);
        continue;
      }
      const existing = byLemma.get(lemma);
      if (existing) existing.count += 1;
      else byLemma.set(lemma, { word: lemma, ...(word.reading ? { reading: word.reading } : {}), sentence, count: 1, order: order++ });
    }
  }
  const candidates = [...byLemma.values()]
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, Math.max(0, limit))
    .map((entry) => ({
      word: entry.word,
      ...(entry.reading ? { reading: entry.reading } : {}),
      sentence: entry.sentence,
      count: entry.count,
    }));
  return { candidates, known, inDeck: deck };
}

/* ------------------------------------------------------------------ *
 * "Explain this sentence's grammar."
 * ------------------------------------------------------------------ */

export interface GrammarPatternEntry {
  id: string;
  title: string;
  meaning: string;
  level: string;
  structure?: string;
}

/** The literal forms a pattern title names: 〜てください, ～たり～たりする, は／が → its pieces. */
export function grammarTitleForms(title: string): string[] {
  return title
    .replace(/[（(][^）)]*[）)]/g, '')
    .split(/[／/、・,|]|…|\.\.\./)
    .map((part) => part.replace(/[〜～~\s]/g, ''))
    .filter((part) => part.length >= 2);
}

/**
 * Grammar patterns that appear in a sentence: a pattern matches when one of its literal forms
 * is in the sentence as written or in its dictionary-form spelling (so ている matches
 * 食べています, whose lemmas read 食べる・て・いる・ます). Longer, more specific forms win, and a
 * pattern whose form is inside another match's form is dropped.
 */
export function matchSentenceGrammar(
  surface: string,
  lemmaText: string,
  patterns: readonly GrammarPatternEntry[],
  limit = 6,
): Array<GrammarPatternEntry & { form: string }> {
  const hits: Array<GrammarPatternEntry & { form: string }> = [];
  for (const pattern of patterns) {
    const forms = grammarTitleForms(pattern.title)
      .filter((form) => surface.includes(form) || lemmaText.includes(form))
      .sort((a, b) => b.length - a.length);
    if (forms.length) hits.push({ ...pattern, form: forms[0] });
  }
  hits.sort((a, b) => b.form.length - a.form.length);
  const kept: typeof hits = [];
  const seenTitles = new Set<string>();
  for (const hit of hits) {
    if (seenTitles.has(hit.title)) continue;
    if (kept.some((other) => other.form.includes(hit.form))) continue;
    seenTitles.add(hit.title);
    kept.push(hit);
    if (kept.length >= limit) break;
  }
  return kept;
}

/** The part-of-speech label key for an IPADIC part of speech. */
export function partOfSpeechKey(pos: string): string {
  const map: Record<string, string> = {
    名詞: 'noun',
    動詞: 'verb',
    形容詞: 'adjective',
    形容動詞: 'adjective',
    副詞: 'adverb',
    助詞: 'particle',
    助動詞: 'auxiliary',
    接続詞: 'conjunction',
    連体詞: 'prenominal',
    感動詞: 'interjection',
    記号: 'symbol',
    接頭詞: 'prefix',
  };
  return `agent2.pos.${map[pos] ?? 'other'}`;
}
