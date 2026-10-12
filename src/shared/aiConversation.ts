/**
 * The conversation partner (docs/AI_AUDIT.md N20): the learner chats in the
 * study language with a partner pitched at their level.
 *
 * - The partner keeps to i+1: the request names the level and carries a sample
 *   of words the learner knows; the renderer then MEASURES each reply's
 *   unknown-word rate with the app's own tokenizer and knowledge store and shows
 *   it, so "at your level" is checked, not promised.
 * - Every learner message can get an inline correction (the corrected sentence
 *   and a short reason), shown as a diff beside the learner's own text and never
 *   replacing it.
 * - A known-word sample is study data: on the cloud engine it is only sent when
 *   the learner allowed study data to leave the device (Agent settings,
 *   `agentCloudStudyDataGate.ts`); main strips it otherwise and the partner
 *   still works.
 * - Fallback with AI off or unavailable: scripted drills — a few fixed partner
 *   lines per scene, so the view is never empty.
 *
 * Pure: the renderer, main and the tests share it.
 */
import {
  clipList,
  clipText,
  normalizeAiStudyRequestId,
  normalizeAnswerLang,
  plainModelText,
  PLAIN_TEXT_RULE,
  promptLanguageName,
} from './aiStudyCommon';
import { immerseTextInStudyLang } from './aiImmerseCommon';
import type { UiLang } from './i18n/core';
import { normalizeStudyLang, type StudyLang } from './studyLang';

export const CONVERSATION_PROMPT_VERSION = 1;

export const CONVERSATION_SCENARIOS = ['free', 'selfIntro', 'restaurant', 'shopping', 'directions', 'hobbies'] as const;
export type ConversationScenario = (typeof CONVERSATION_SCENARIOS)[number];

export type ConversationFormality = 'casual' | 'polite';

export const CONVERSATION_LEVELS: Readonly<Record<StudyLang, readonly string[]>> = {
  ja: ['N5', 'N4', 'N3', 'N2', 'N1'],
  zh: ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6'],
  ru: ['A1', 'A2', 'B1', 'B2', 'C1'],
};

export const DEFAULT_CONVERSATION_LEVEL: Readonly<Record<StudyLang, string>> = { ja: 'N4', zh: 'HSK2', ru: 'A2' };

/** Turns sent with a request; older ones stay in the stored history only. */
export const CONVERSATION_CONTEXT_TURNS = 12;
/** Turns kept in the stored history per study language. */
export const CONVERSATION_HISTORY_CAP = 40;
export const CONVERSATION_MESSAGE_MAX = 300;
export const CONVERSATION_KNOWN_SAMPLE_MAX = 80;
/** An i+1 reply has at most this share of unknown content words. */
export const CONVERSATION_I1_UNKNOWN_RATE = 0.15;

export interface ConversationTurn {
  role: 'user' | 'partner';
  text: string;
}

export interface ConversationRequest {
  requestId?: string;
  studyLang: StudyLang;
  answerLang: UiLang;
  scenario: ConversationScenario;
  formality: ConversationFormality;
  level: string;
  /** Words the learner knows (a sample). Emptied by main when it may not be sent. */
  knownWords: string[];
  /** The conversation so far, oldest first, without `message`. */
  history: ConversationTurn[];
  /** The learner's new message; '' asks the partner to open the conversation. */
  message: string;
  /** Ask for a correction of `message`. */
  correct: boolean;
  /** The Agent's study-data setting, as stored ('allow' | 'local-only' | 'unset'). */
  shareStudyData: string;
  refresh?: boolean;
}

export interface ConversationCorrection {
  corrected: string;
  explanation: string;
}

export interface ConversationReplyResult {
  /** The partner's reply, in the study language. */
  reply: string;
  /** Its meaning in the UI language. */
  translation: string;
  /** The learner's message corrected, or null when it needed nothing (or none was asked). */
  correction: ConversationCorrection | null;
  /** Whether a known-word sample went with the request. */
  knownSampleSent: boolean;
}

function isScenario(value: unknown): value is ConversationScenario {
  return (CONVERSATION_SCENARIOS as readonly unknown[]).includes(value);
}

export function normalizeConversationLevel(value: unknown, lang: StudyLang): string {
  return typeof value === 'string' && CONVERSATION_LEVELS[lang].includes(value) ? value : DEFAULT_CONVERSATION_LEVEL[lang];
}

export function normalizeConversationTurns(value: unknown, limit: number): ConversationTurn[] {
  if (!Array.isArray(value)) return [];
  const out: ConversationTurn[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const turn = raw as Record<string, unknown>;
    const role = turn.role === 'user' ? 'user' : turn.role === 'partner' ? 'partner' : null;
    const text = clipText(turn.text, CONVERSATION_MESSAGE_MAX);
    if (role && text) out.push({ role, text });
  }
  return out.slice(Math.max(0, out.length - limit));
}

export function normalizeConversationRequest(input: unknown): ConversationRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const studyLang = normalizeStudyLang(raw.studyLang);
  const history = normalizeConversationTurns(raw.history, CONVERSATION_CONTEXT_TURNS);
  const message = clipText(raw.message, CONVERSATION_MESSAGE_MAX);
  // Nothing new to answer: an empty message only opens a conversation that has not started.
  if (!message && history.length) return null;
  const requestId = normalizeAiStudyRequestId(raw.requestId);
  return {
    ...(requestId ? { requestId } : {}),
    studyLang,
    answerLang: normalizeAnswerLang(raw.answerLang),
    scenario: isScenario(raw.scenario) ? raw.scenario : 'free',
    formality: raw.formality === 'casual' ? 'casual' : 'polite',
    level: normalizeConversationLevel(raw.level, studyLang),
    knownWords: clipList(raw.knownWords, CONVERSATION_KNOWN_SAMPLE_MAX, 24),
    history,
    message,
    correct: raw.correct === true && Boolean(message),
    shareStudyData: typeof raw.shareStudyData === 'string' ? raw.shareStudyData : 'unset',
    ...(raw.refresh === true ? { refresh: true } : {}),
  };
}

export function conversationKeyParts(request: ConversationRequest): string[] {
  return [
    request.studyLang, request.answerLang, request.scenario, request.formality, request.level,
    request.knownWords.join('|'), request.history.map((turn) => `${turn.role}:${turn.text}`).join('\n'),
    request.message, request.correct ? 'c' : '-',
  ];
}

const SCENE_TEXT: Readonly<Record<ConversationScenario, string>> = {
  free: 'a friendly everyday chat about the learner\'s day and interests',
  selfIntro: 'meeting for the first time: introductions, where they are from, what they do',
  restaurant: 'a restaurant: you are the waiter, the learner is the customer ordering',
  shopping: 'a shop: you are the shop assistant, the learner is buying something',
  directions: 'on the street: the learner asks you for directions',
  hobbies: 'a chat about hobbies and free time',
};

export function buildConversationPrompt(request: ConversationRequest): string {
  const study = promptLanguageName(request.studyLang);
  const answer = promptLanguageName(request.answerLang);
  const register = request.formality === 'casual'
    ? 'casual speech (as between friends)'
    : request.studyLang === 'ja' ? 'polite です/ます speech' : 'polite, neutral speech';
  const lines = [
    `You are a conversation partner for a learner of ${study} at level ${request.level}.`,
    `Scene: ${SCENE_TEXT[request.scenario]}. Use ${register}.`,
    'Stay at the learner\'s level: short, natural sentences (one or two), common words, and at most ONE word they probably do not know yet.',
    request.knownWords.length ? `Words the learner already knows (prefer these): ${request.knownWords.join(', ')}` : '',
    'Usually end with a short question so the conversation continues. Stay in the scene and in character.',
    '',
    request.history.length ? 'The conversation so far:' : '',
    ...request.history.map((turn) => `${turn.role === 'user' ? 'Learner' : 'You'}: ${turn.text}`),
    request.message ? `Learner: ${request.message}` : 'Open the conversation with your first line.',
    '',
    'Reply with JSON:',
    `- "reply": your next line, in ${study} only.`,
    `- "translation": its meaning in ${answer}.`,
    request.correct
      ? `- "correction": check the learner's LAST message. If it has a grammar, word-choice or particle mistake, or sounds unnatural, give { "corrected": the whole message corrected in ${study}, "explanation": one short sentence in ${answer} naming the change }. If it is fine, give { "corrected": "", "explanation": "" }.`
      : '- "correction": { "corrected": "", "explanation": "" }.',
    PLAIN_TEXT_RULE,
  ];
  return lines.filter((line, index) => line !== '' || (index > 0 && lines[index - 1] !== '')).join('\n');
}

export const CONVERSATION_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    translation: { type: 'string' },
    correction: {
      type: 'object',
      properties: { corrected: { type: 'string' }, explanation: { type: 'string' } },
      required: ['corrected', 'explanation'],
    },
  },
  required: ['reply', 'translation', 'correction'],
} as const;

/** Text compared for "is this a change at all": no spaces or sentence punctuation. */
function comparable(text: string): string {
  return text.normalize('NFKC').replace(/[\s。、．，,.!?！？「」"'“”]/gu, '');
}

export function finalizeConversationReply(
  parsed: { reply: string; translation?: string; correction?: { corrected?: string; explanation?: string } | null },
  request: ConversationRequest,
): ConversationReplyResult | null {
  const reply = plainModelText(parsed.reply, CONVERSATION_MESSAGE_MAX).replace(/\s*\n\s*/g, ' ');
  // A reply outside the study language is no reply for a learner of it.
  if (!reply || !immerseTextInStudyLang(reply, request.studyLang)) return null;
  let correction: ConversationCorrection | null = null;
  if (request.correct && request.message) {
    const corrected = plainModelText(parsed.correction?.corrected ?? '', CONVERSATION_MESSAGE_MAX).replace(/\s*\n\s*/g, ' ');
    const explanation = plainModelText(parsed.correction?.explanation ?? '', 300).replace(/\s*\n\s*/g, ' ');
    if (corrected && explanation && immerseTextInStudyLang(corrected, request.studyLang)
      && comparable(corrected) !== comparable(request.message)) {
      correction = { corrected, explanation };
    }
  }
  return {
    reply,
    translation: plainModelText(parsed.translation ?? '', CONVERSATION_MESSAGE_MAX).replace(/\s*\n\s*/g, ' '),
    correction,
    knownSampleSent: request.knownWords.length > 0,
  };
}

export function isConversationReplyResult(value: unknown): value is ConversationReplyResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.reply !== 'string' || !v.reply || typeof v.translation !== 'string' || typeof v.knownSampleSent !== 'boolean') return false;
  if (v.correction === null) return true;
  const c = v.correction as Record<string, unknown> | undefined;
  return !!c && typeof c.corrected === 'string' && c.corrected.length > 0 && typeof c.explanation === 'string' && c.explanation.length > 0;
}

// ---- the stored conversation -------------------------------------------------------

export interface StoredConversationTurn extends ConversationTurn {
  /** Partner turns: the meaning in the UI language. */
  translation?: string;
  /** User turns: the inline correction, when one was asked for and needed. */
  correction?: ConversationCorrection;
  /** Partner turns written by the scripted drill rather than a model. */
  scripted?: boolean;
  at: number;
}

export interface StoredConversation {
  version: 1;
  scenario: ConversationScenario;
  formality: ConversationFormality;
  level: string;
  turns: StoredConversationTurn[];
}

export function emptyConversation(lang: StudyLang): StoredConversation {
  return { version: 1, scenario: 'free', formality: 'polite', level: DEFAULT_CONVERSATION_LEVEL[lang], turns: [] };
}

/** Re-reads a stored conversation: malformed turns are dropped, the history is capped. */
export function normalizeStoredConversation(raw: unknown, lang: StudyLang): StoredConversation {
  const base = emptyConversation(lang);
  if (!raw || typeof raw !== 'object') return base;
  const value = raw as Record<string, unknown>;
  const turns: StoredConversationTurn[] = [];
  for (const item of Array.isArray(value.turns) ? value.turns : []) {
    const [turn] = normalizeConversationTurns([item], 1);
    if (!turn) continue;
    const source = item as Record<string, unknown>;
    const at = typeof source.at === 'number' && Number.isFinite(source.at) ? source.at : 0;
    const out: StoredConversationTurn = { ...turn, at };
    const translation = clipText(source.translation, CONVERSATION_MESSAGE_MAX);
    if (turn.role === 'partner' && translation) out.translation = translation;
    if (turn.role === 'partner' && source.scripted === true) out.scripted = true;
    const correction = source.correction as Record<string, unknown> | undefined;
    if (turn.role === 'user' && correction && typeof correction === 'object') {
      const corrected = clipText(correction.corrected, CONVERSATION_MESSAGE_MAX);
      const explanation = clipText(correction.explanation, 300);
      if (corrected && explanation) out.correction = { corrected, explanation };
    }
    turns.push(out);
  }
  return {
    version: 1,
    scenario: isScenario(value.scenario) ? value.scenario : base.scenario,
    formality: value.formality === 'casual' ? 'casual' : 'polite',
    level: normalizeConversationLevel(value.level, lang),
    turns: capConversationTurns(turns),
  };
}

export function capConversationTurns<T>(turns: readonly T[], cap = CONVERSATION_HISTORY_CAP): T[] {
  return turns.slice(Math.max(0, turns.length - cap));
}

// ---- i+1, measured -------------------------------------------------------------------

export interface ConversationWordToken {
  lemma: string;
  content: boolean;
  proper?: boolean;
}

export interface UnknownWordRate {
  unknown: number;
  total: number;
  /** 0..1, 0 when there are no content words. */
  rate: number;
  unknownWords: string[];
  /** At or under the i+1 target. */
  onTarget: boolean;
}

/** A word counts as known at Familiar (2) and above, as everywhere else in the app. */
export function unknownWordRate(
  tokens: readonly ConversationWordToken[],
  levelOf: (lemma: string) => number,
): UnknownWordRate {
  let total = 0;
  const unknownWords: string[] = [];
  let unknown = 0;
  for (const token of tokens) {
    if (!token.content || token.proper || !token.lemma) continue;
    total += 1;
    if (levelOf(token.lemma) < 2) {
      unknown += 1;
      if (!unknownWords.includes(token.lemma)) unknownWords.push(token.lemma);
    }
  }
  const rate = total ? unknown / total : 0;
  return { unknown, total, rate, unknownWords, onTarget: rate <= CONVERSATION_I1_UNKNOWN_RATE };
}

// ---- scripted drills (the fallback) ------------------------------------------------------

/** Three fixed partner lines per scene and study language. Study content: never translated. */
export const CONVERSATION_DRILLS: Readonly<Record<ConversationScenario, Readonly<Record<StudyLang, readonly string[]>>>> = {
  free: {
    ja: ['こんにちは。今日は何をしましたか？', 'そうですか。楽しかったですか？', '週末は何をしますか？'],
    zh: ['你好！你今天做了什么？', '是吗？好玩吗？', '你周末打算做什么？'],
    ru: ['Привет! Что ты сегодня делал?', 'Правда? Было интересно?', 'Что ты будешь делать в выходные?'],
  },
  selfIntro: {
    ja: ['はじめまして。お名前は何ですか？', 'どこから来ましたか？', 'お仕事は何ですか？'],
    zh: ['你好，你叫什么名字？', '你是哪国人？', '你做什么工作？'],
    ru: ['Здравствуйте! Как вас зовут?', 'Откуда вы?', 'Кем вы работаете?'],
  },
  restaurant: {
    ja: ['いらっしゃいませ。何名様ですか？', 'ご注文はお決まりですか？', 'お飲み物はいかがですか？'],
    zh: ['欢迎光临！几位？', '您想点什么？', '要喝点什么吗？'],
    ru: ['Добрый вечер! Столик на сколько человек?', 'Вы уже выбрали?', 'Что будете пить?'],
  },
  shopping: {
    ja: ['いらっしゃいませ。何かお探しですか？', 'サイズはいかがですか？', 'お支払いはどうなさいますか？'],
    zh: ['欢迎光临！您想买什么？', '这个尺码合适吗？', '您怎么付款？'],
    ru: ['Здравствуйте! Что вы ищете?', 'Какой размер вам нужен?', 'Как будете платить?'],
  },
  directions: {
    ja: ['すみません、駅はどこですか？', 'ここから遠いですか？', '歩いて何分ぐらいですか？'],
    zh: ['请问，火车站在哪儿？', '离这儿远吗？', '走路要多长时间？'],
    ru: ['Извините, где вокзал?', 'Это далеко отсюда?', 'Сколько минут пешком?'],
  },
  hobbies: {
    ja: ['趣味は何ですか？', 'いつからそれをしていますか？', 'どうしてそれが好きですか？'],
    zh: ['你有什么爱好？', '你什么时候开始的？', '你为什么喜欢它？'],
    ru: ['Какое у тебя хобби?', 'Когда ты начал этим заниматься?', 'Почему тебе это нравится?'],
  },
};

/**
 * The scripted partner's next line: the drill line after the last scripted one
 * in this conversation, or null when the drill is finished.
 */
export function nextDrillLine(
  scenario: ConversationScenario,
  lang: StudyLang,
  turns: readonly { role: string; scripted?: boolean }[],
): string | null {
  const lines = CONVERSATION_DRILLS[scenario][lang];
  const asked = turns.filter((turn) => turn.role === 'partner' && turn.scripted).length;
  return asked < lines.length ? lines[asked] : null;
}
