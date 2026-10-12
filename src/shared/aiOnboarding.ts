/**
 * Onboarding and Settings helpers (docs/AI_AUDIT.md N25, N26):
 *
 * - Placement quiz: the model writes ~8 short multiple-choice items spread
 *   across the study language's levels, each with its answer key. The
 *   learner's answers are graded HERE against that key, and the suggested
 *   starting level comes from a fixed rule over per-level accuracy — the model
 *   never decides the level. The learner applies it or keeps their own pick;
 *   the words they got right can be marked known only through
 *   `setInferredLevel`, which never overrides a level they set by hand.
 * - Settings help: when the keyword search finds nothing, the model may name
 *   which settings answer the question — but only by ids from the list it was
 *   given, and the renderer checks each id against the registry again.
 */
import {
  clipText,
  normalizeAiStudyRequestId,
  normalizeAnswerLang,
  plainModelText,
  PLAIN_TEXT_RULE,
  promptLanguageName,
} from './aiStudyCommon';
import { tutorTextInStudyLang } from './aiTutorCommon';
import type { UiLang } from './i18n/core';
import { normalizeStudyLang, type StudyLang } from './studyLang';

export const PLACEMENT_QUIZ_PROMPT_VERSION = 1;
export const SETTINGS_HELP_PROMPT_VERSION = 1;

// ---- placement quiz ------------------------------------------------------------

/** Five levels per language, easiest first; index 0-4 matches the onboarding bands. */
export const PLACEMENT_LEVELS: Readonly<Record<StudyLang, readonly string[]>> = {
  ja: ['N5', 'N4', 'N3', 'N2', 'N1'],
  zh: ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5'],
  ru: ['A1', 'A2', 'B1', 'B2', 'C1'],
};

export const PLACEMENT_MIN_ITEMS = 6;
export const PLACEMENT_MAX_ITEMS = 10;

export interface PlacementItem {
  /** 0 (easiest) … 4. */
  level: number;
  /** The word or pattern tested, in the study language. */
  word: string;
  /** The question, in the UI language, quoting the study-language text. */
  prompt: string;
  choices: string[];
  /** Index of the right choice. */
  answer: number;
}

export interface PlacementQuizRequest {
  requestId?: string;
  studyLang: StudyLang;
  answerLang: UiLang;
  count: number;
  refresh?: boolean;
}

export interface PlacementQuizResult {
  items: PlacementItem[];
}

export function normalizePlacementQuizRequest(input: unknown): PlacementQuizRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const requestId = normalizeAiStudyRequestId(raw.requestId);
  const count = typeof raw.count === 'number' && Number.isFinite(raw.count)
    ? Math.max(PLACEMENT_MIN_ITEMS, Math.min(PLACEMENT_MAX_ITEMS, Math.trunc(raw.count)))
    : 8;
  return {
    ...(requestId ? { requestId } : {}),
    studyLang: normalizeStudyLang(raw.studyLang),
    answerLang: normalizeAnswerLang(raw.answerLang),
    count,
    ...(raw.refresh === true ? { refresh: true } : {}),
  };
}

export function placementQuizKeyParts(request: PlacementQuizRequest): string[] {
  return [request.studyLang, request.answerLang, String(request.count)];
}

export function buildPlacementQuizPrompt(request: PlacementQuizRequest): string {
  const study = promptLanguageName(request.studyLang);
  const answer = promptLanguageName(request.answerLang);
  const levels = PLACEMENT_LEVELS[request.studyLang];
  return [
    `Write a short placement check for a new learner of ${study}: ${request.count} multiple-choice items, spread across these levels from easiest to hardest: ${levels.join(', ')}. Use every level at least once.`,
    'Each item tests one common word or grammar pattern of its level.',
    'Reply with JSON {"items": [{"level", "word", "prompt", "choices", "answer"}]}:',
    `- "level": one of ${levels.map((l) => `"${l}"`).join(', ')}.`,
    `- "word": the tested word or pattern, written in ${study}.`,
    `- "prompt": a short question in ${answer} that quotes the ${study} word or a short ${study} sentence, e.g. "What does 「…」 mean?".`,
    `- "choices": exactly 4 short options in ${answer}, only one correct, no "all of the above".`,
    '- "answer": the index (0-3) of the correct choice. Vary its position between items.',
    PLAIN_TEXT_RULE,
  ].join('\n');
}

export const PLACEMENT_QUIZ_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          level: { type: 'string' },
          word: { type: 'string' },
          prompt: { type: 'string' },
          choices: { type: 'array', items: { type: 'string' } },
          answer: { type: 'integer' },
        },
        required: ['level', 'word', 'prompt', 'choices', 'answer'],
      },
    },
  },
  required: ['items'],
} as const;

/** "N4", "n 4", "HSK 2", "hsk2", "A2" → the level's index, or -1. */
export function placementLevelIndex(label: unknown, lang: StudyLang): number {
  if (typeof label !== 'string' && typeof label !== 'number') return -1;
  const clean = String(label).toUpperCase().replace(/[\s_-]+/g, '');
  return PLACEMENT_LEVELS[lang].indexOf(clean);
}

/**
 * Items are checked one by one (study-language text present, four distinct
 * options, a valid key) and duplicates dropped; the quiz is only usable with at
 * least six items that cover at least three levels.
 */
export function finalizePlacementQuizResult(
  parsed: { items: Array<{ level: string | number; word: string; prompt: string; choices: string[]; answer: number }> },
  request: PlacementQuizRequest,
): PlacementQuizResult | null {
  const lang = request.studyLang;
  const items: PlacementItem[] = [];
  const words = new Set<string>();
  for (const raw of parsed.items) {
    const level = placementLevelIndex(raw.level, lang);
    const word = plainModelText(raw.word, 40).replace(/\s*\n\s*/g, ' ');
    const prompt = plainModelText(raw.prompt, 200).replace(/\s*\n\s*/g, ' ');
    const choices = (Array.isArray(raw.choices) ? raw.choices : []).map((c) => plainModelText(c, 80).replace(/\s*\n\s*/g, ' '));
    if (level < 0 || !word || !prompt || words.has(word)) continue;
    if (!tutorTextInStudyLang(word, lang) || !tutorTextInStudyLang(prompt, lang)) continue;
    if (choices.length !== 4 || choices.some((c) => !c) || new Set(choices).size !== 4) continue;
    if (!Number.isInteger(raw.answer) || raw.answer < 0 || raw.answer > 3) continue;
    words.add(word);
    items.push({ level, word, prompt, choices, answer: raw.answer });
    if (items.length >= PLACEMENT_MAX_ITEMS) break;
  }
  if (items.length < PLACEMENT_MIN_ITEMS || new Set(items.map((i) => i.level)).size < 3) return null;
  return { items: items.sort((a, b) => a.level - b.level) };
}

export function isPlacementQuizResult(value: unknown): value is PlacementQuizResult {
  if (!value || typeof value !== 'object') return false;
  const items = (value as Record<string, unknown>).items;
  return Array.isArray(items) && items.length >= PLACEMENT_MIN_ITEMS && items.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const i = item as PlacementItem;
    return Number.isInteger(i.level) && i.level >= 0 && i.level <= 4 && typeof i.word === 'string' && i.word.length > 0
      && typeof i.prompt === 'string' && Array.isArray(i.choices) && i.choices.length === 4
      && Number.isInteger(i.answer) && i.answer >= 0 && i.answer <= 3;
  });
}

export interface PlacementLevelScore {
  level: number;
  right: number;
  total: number;
}

export interface PlacementGrade {
  right: number;
  total: number;
  perLevel: PlacementLevelScore[];
  /** 0 (beginner) … 4 (advanced). */
  band: number;
  /** The words answered correctly — what may be marked known, with approval. */
  knownWords: string[];
}

/**
 * Graded against the quiz's own key. The suggested band is the hardest level L
 * such that, over every item at L or easier, at least 60% were right AND at
 * least half of L's own items were right. Below that at the easiest level, the
 * band is 0. An unanswered item counts as wrong.
 */
export function gradePlacementQuiz(items: readonly PlacementItem[], picks: ReadonlyArray<number | null | undefined>): PlacementGrade {
  const perLevel: PlacementLevelScore[] = [0, 1, 2, 3, 4].map((level) => ({ level, right: 0, total: 0 }));
  const knownWords: string[] = [];
  let right = 0;
  items.forEach((item, index) => {
    const row = perLevel[item.level];
    if (!row) return;
    row.total += 1;
    if (picks[index] === item.answer) {
      row.right += 1;
      right += 1;
      knownWords.push(item.word);
    }
  });
  let band = 0;
  let cumRight = 0;
  let cumTotal = 0;
  for (const row of perLevel) {
    cumRight += row.right;
    cumTotal += row.total;
    if (!row.total) continue;
    if (cumTotal && cumRight / cumTotal >= 0.6 && row.right / row.total >= 0.5) band = row.level;
    else break;
  }
  return { right, total: items.length, perLevel: perLevel.filter((row) => row.total > 0), band, knownWords };
}

/** A text-sample estimate (`estimateLevelFromText`: JLPT 5…1, HSK 1…6) as a band 0-4. */
export function placementBandFromExamLevel(scheme: string, level: number): number | null {
  if (!Number.isFinite(level)) return null;
  if (/jlpt/i.test(scheme)) return Math.max(0, Math.min(4, 5 - Math.round(level)));
  if (/hsk/i.test(scheme)) return Math.max(0, Math.min(4, Math.round(level) - 1));
  return null;
}

// ---- settings help ---------------------------------------------------------------

export interface SettingsHelpCandidate {
  id: string;
  title: string;
}

export interface SettingsHelpRequest {
  requestId?: string;
  question: string;
  candidates: SettingsHelpCandidate[];
  answerLang: UiLang;
  refresh?: boolean;
}

export interface SettingsHelpMatch {
  id: string;
  reason: string;
}

export interface SettingsHelpResult {
  /** At most three; empty means "no setting does this". */
  matches: SettingsHelpMatch[];
}

const SETTING_ID = /^[A-Za-z0-9_.:-]{1,80}$/;
export const SETTINGS_HELP_MAX_CANDIDATES = 400;

export function normalizeSettingsHelpRequest(input: unknown): SettingsHelpRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const question = clipText(raw.question, 200);
  if (!question || !Array.isArray(raw.candidates)) return null;
  const candidates: SettingsHelpCandidate[] = [];
  const ids = new Set<string>();
  for (const entry of raw.candidates) {
    if (candidates.length >= SETTINGS_HELP_MAX_CANDIDATES) break;
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const id = typeof e.id === 'string' && SETTING_ID.test(e.id) ? e.id : '';
    const title = clipText(e.title, 60);
    if (!id || !title || ids.has(id)) continue;
    ids.add(id);
    candidates.push({ id, title });
  }
  if (!candidates.length) return null;
  const requestId = normalizeAiStudyRequestId(raw.requestId);
  return {
    ...(requestId ? { requestId } : {}),
    question,
    candidates,
    answerLang: normalizeAnswerLang(raw.answerLang),
    ...(raw.refresh === true ? { refresh: true } : {}),
  };
}

export function settingsHelpKeyParts(request: SettingsHelpRequest): string[] {
  return [request.question.toLowerCase(), request.answerLang, request.candidates.map((c) => `${c.id}=${c.title}`).join('\u0001')];
}

export function buildSettingsHelpPrompt(request: SettingsHelpRequest): string {
  const answer = promptLanguageName(request.answerLang);
  return [
    'A user of a language-learning app asked where to find a setting. Here is every setting, as "id: title":',
    ...request.candidates.map((c) => `${c.id}: ${c.title}`),
    '',
    `Question: ${request.question}`,
    '',
    'Reply with JSON {"matches": [{"id", "reason"}]}: up to 3 settings that answer the question, best first.',
    `Use ONLY ids from the list above, copied exactly. "reason" is one short sentence in ${answer}. If no setting fits, reply {"matches": []}.`,
    PLAIN_TEXT_RULE,
  ].join('\n');
}

export const SETTINGS_HELP_SCHEMA = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, reason: { type: 'string' } },
        required: ['id', 'reason'],
      },
    },
  },
  required: ['matches'],
} as const;

/** Only ids that were offered survive; a reply naming nothing real is an honest "none". */
export function finalizeSettingsHelpResult(
  parsed: { matches: Array<{ id: string; reason?: string }> },
  request: SettingsHelpRequest,
): SettingsHelpResult | null {
  const offered = new Set(request.candidates.map((c) => c.id));
  const matches: SettingsHelpMatch[] = [];
  for (const match of parsed.matches) {
    const id = String(match.id).trim();
    if (!offered.has(id) || matches.some((m) => m.id === id)) continue;
    matches.push({ id, reason: plainModelText(match.reason ?? '', 200).replace(/\s*\n\s*/g, ' ') });
    if (matches.length >= 3) break;
  }
  // Ids were named but none was real: the reply is unusable, not a "none".
  if (!matches.length && parsed.matches.length > 0) return null;
  return { matches };
}

export function isSettingsHelpResult(value: unknown): value is SettingsHelpResult {
  if (!value || typeof value !== 'object') return false;
  const matches = (value as Record<string, unknown>).matches;
  return Array.isArray(matches) && matches.length <= 3 && matches.every((m) => !!m && typeof m === 'object'
    && typeof (m as SettingsHelpMatch).id === 'string' && SETTING_ID.test((m as SettingsHelpMatch).id)
    && typeof (m as SettingsHelpMatch).reason === 'string');
}
