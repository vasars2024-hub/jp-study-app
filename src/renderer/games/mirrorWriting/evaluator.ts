import type { MirrorText } from '../../data/mirrorTexts';
import type { GameArenaSettings } from '../settings';
import type { StudyLang } from '../../../shared/levelScale';

export type MirrorAxis = 'grammar' | 'vocabulary' | 'flow' | 'fidelity';

export interface MirrorTip {
  span?: string;
  /**
   * Free text. An API evaluator writes its own prose and there is nothing to
   * key it to, so this stays required and is also the fallback for a renderer
   * that does not know about `messageKey`.
   */
  message: string;
  /**
   * Set only by the LOCAL rubric, whose sentences are fixed app chrome. The
   * renderer resolves it and ignores `message` — D332: the labels around the
   * verdict were translated while the verdict itself stayed English.
   */
  messageKey?: string;
}

export interface MirrorAxisScore {
  score: number;
  tips: MirrorTip[];
}

export interface MirrorEvaluation {
  evaluatorVersion: string;
  total: number;
  axes: Record<MirrorAxis, MirrorAxisScore>;
  summary: string;
  /** Same contract as `MirrorTip.messageKey`, for the one-line verdict. */
  summaryKey?: string;
}

export type MirrorEvaluationFailure =
  | 'api-missing'
  | 'network'
  | 'schema-invalid';

export type MirrorEvaluationResult =
  | { ok: true; evaluation: MirrorEvaluation }
  | {
      ok: false;
      reason: MirrorEvaluationFailure;
      /** English fallback, and the only text available when the failure is a platform exception. */
      message: string;
      /** Set when the failure is the app's own prose rather than a platform string — D332. */
      messageKey?: string;
      messageVars?: Record<string, string | number>;
    };

function clampScore(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function validateTip(value: unknown): MirrorTip | null {
  if (!value || typeof value !== 'object') return null;
  const tip = value as { span?: unknown; message?: unknown };
  if (typeof tip.message !== 'string' || !tip.message.trim()) return null;
  return {
    span: typeof tip.span === 'string' && tip.span.trim() ? tip.span.trim() : undefined,
    message: tip.message.trim(),
  };
}

function validateAxis(value: unknown): MirrorAxisScore | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { score?: unknown; tips?: unknown };
  const score = clampScore(raw.score);
  if (score === null || !Array.isArray(raw.tips)) return null;
  const tips = raw.tips.map(validateTip).filter((tip): tip is MirrorTip => !!tip).slice(0, 4);
  return { score, tips };
}

export function validateMirrorEvaluation(value: unknown): MirrorEvaluation | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { evaluatorVersion?: unknown; total?: unknown; axes?: unknown; summary?: unknown };
  if (!raw.axes || typeof raw.axes !== 'object') return null;
  const axesRaw = raw.axes as Record<string, unknown>;
  const grammar = validateAxis(axesRaw.grammar);
  const vocabulary = validateAxis(axesRaw.vocabulary);
  const flow = validateAxis(axesRaw.flow);
  const fidelity = validateAxis(axesRaw.fidelity);
  if (!grammar || !vocabulary || !flow || !fidelity) return null;
  const computed = Math.round((grammar.score + vocabulary.score + flow.score + fidelity.score) / 4);
  return {
    evaluatorVersion: typeof raw.evaluatorVersion === 'string' ? raw.evaluatorVersion : 'api-v1',
    total: clampScore(raw.total) ?? computed,
    axes: { grammar, vocabulary, flow, fidelity },
    summary: typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : 'Evaluation complete.',
  };
}

function extractJson(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const maybeChoices = value as { choices?: unknown };
  if (Array.isArray(maybeChoices.choices) && maybeChoices.choices.length) {
    const choice = maybeChoices.choices[0] as { message?: { content?: unknown }; text?: unknown };
    const content = choice?.message?.content ?? choice?.text;
    if (typeof content === 'string') {
      try {
        return JSON.parse(content);
      } catch {
        return value;
      }
    }
  }
  return value;
}

const LANG_NAME: Record<StudyLang, string> = { ja: 'Japanese', zh: 'Chinese (Mandarin)', ru: 'Russian' };

function buildPrompt(text: MirrorText, draft: string): string {
  const lang = text.lang ?? 'ja';
  const ideaMap = text.ideaMap.map((idea, index) => `${index + 1}. ${idea.concepts.en}`).join('\n');
  return [
    `Grade this ${LANG_NAME[lang]} active-recall writing exercise.`,
    'Return strict JSON only with: evaluatorVersion, total, axes.grammar/vocabulary/flow/fidelity, summary.',
    'Each axis must have score 0-100 and tips [{span,message}].',
    `Do not invent a score if the draft is empty or not ${LANG_NAME[lang]}; use low scores with concrete tips.`,
    '',
    `Idea map:\n${ideaMap}`,
    '',
    `Reference answer:\n${text.reference}`,
    '',
    `User draft:\n${draft}`,
  ].join('\n');
}

/**
 * The same task as a request to the app's own AI (the Agent), for a learner who
 * has AI set up: the quick check scores coverage and shape; the Agent can say
 * what is actually wrong with a sentence.
 */
export function buildMirrorFeedbackRequest(text: MirrorText, draft: string): string {
  const lang = text.lang ?? 'ja';
  const ideaMap = text.ideaMap.map((idea, index) => `${index + 1}. ${idea.concepts.en}`).join('\n');
  return [
    `Please review my ${LANG_NAME[lang]} writing. I wrote it from this idea map:`,
    ideaMap,
    '',
    `My draft:\n${draft}`,
    '',
    `A model answer:\n${text.reference}`,
    '',
    'Point out grammar and word-choice mistakes with corrections, say which ideas I missed, and suggest one more natural way to phrase it.',
  ].join('\n');
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

interface ScriptProfile {
  /** Characters that count as the study language's script. */
  script: RegExp;
  sentenceEnd: RegExp;
  /** A finished sentence ending (ja: です/ます…; zh/ru: terminal punctuation). */
  politeOrFinal: RegExp;
  connective: RegExp;
  terms: (value: string) => string[];
  /** Level-appropriate vocabulary signal (distinct kanji / hanzi, long words). */
  richness: (value: string) => number;
  /** i18n key suffix for the tips that name language-specific things. */
  keySuffix: string;
}

const JA_STOP = ['ています', 'ました', 'です', 'ます', 'ください'];
const RU_STOP = new Set(['который', 'которая', 'которое', 'потому', 'только', 'очень', 'также', 'этого', 'чтобы']);
const HAN = /[\u3400-\u9fff]/;

const PROFILES: Record<StudyLang, ScriptProfile> = {
  ja: {
    script: /[\u3040-\u30ff\u3400-\u9fff]/,
    sentenceEnd: /[。！？]/g,
    politeOrFinal: /(です|ます|ました|ません|でしょう|ください)(。|$)/,
    connective: /(ので|から|ただし|また|そして|しかし|ため|によって|として|ではなく)/,
    terms: (value) => [
      ...new Set((value.match(/[\u3400-\u9fff]{2,}|[\u30a0-\u30ff]{2,}|[\u3040-\u309f]{3,}/g) ?? []).filter((t) => !JA_STOP.includes(t))),
    ],
    richness: (value) => new Set([...value].filter((ch) => HAN.test(ch))).size,
    keySuffix: '',
  },
  zh: {
    script: HAN,
    sentenceEnd: /[。！？]/g,
    politeOrFinal: /[。！？]$/,
    connective: /(因为|所以|但是|而且|然后|虽然|如果|不过|因此|并且)/,
    // Hanzi bigrams stand in for words: Chinese is written without spaces.
    terms: (value) => {
      const han = [...value].filter((ch) => HAN.test(ch));
      const out = new Set<string>();
      for (let i = 0; i + 1 < han.length; i += 1) out.add(han[i] + han[i + 1]);
      return [...out];
    },
    richness: (value) => new Set([...value].filter((ch) => HAN.test(ch))).size / 2,
    keySuffix: '.zh',
  },
  ru: {
    script: /[а-яё]/i,
    sentenceEnd: /[.!?…]/g,
    politeOrFinal: /[.!?…]$/,
    connective: /(потому что|поэтому|однако|кроме того|так как|если|хотя|а также|\bно\b)/i,
    // A five-letter stem stands in for the lemma, so книга / книгу / книги meet.
    terms: (value) => [
      ...new Set((value.toLowerCase().match(/[а-яё]{4,}/g) ?? []).filter((w) => !RU_STOP.has(w)).map((w) => w.slice(0, 5))),
    ],
    richness: (value) => (value.match(/[а-яё]{7,}/gi) ?? []).length,
    keySuffix: '.ru',
  },
};

function axis(score: number, tips: MirrorTip[]): MirrorAxisScore {
  return { score: clampPercent(score), tips: tips.slice(0, 4) };
}

export function localRubricEvaluate(text: MirrorText, draft: string): MirrorEvaluation {
  const profile = PROFILES[text.lang ?? 'ja'];
  const k = (key: string) => `${key}${profile.keySuffix}`;
  const trimmed = draft.trim();
  const letters = [...trimmed].filter((ch) => /\S/.test(ch) && !/[\p{P}\d]/u.test(ch));
  const jpRatio = letters.length ? letters.filter((ch) => profile.script.test(ch)).length / letters.length : 0;
  const sentenceCount = Math.max(1, (trimmed.match(profile.sentenceEnd) ?? []).length);
  const referenceTerms = profile.terms(text.reference);
  const draftTerms = profile.terms(trimmed);
  const draftTermSet = new Set(draftTerms);
  const coveredTerms = referenceTerms.filter((term) => draftTermSet.has(term) || trimmed.includes(term));
  const coverage = referenceTerms.length ? coveredTerms.length / referenceTerms.length : 0;
  const uniqueKanji = profile.richness(trimmed);
  const hasPoliteEnding = profile.politeOrFinal.test(trimmed);
  const hasConnective = profile.connective.test(trimmed);
  const lengthRatio = Math.min(1.25, trimmed.length / Math.max(1, text.reference.length));

  const grammarTips: MirrorTip[] = [];
  if (jpRatio < 0.75) grammarTips.push({ message: 'Use mostly Japanese script in the answer.', messageKey: k('games.mirror.tip.grammar.script') });
  if (!hasPoliteEnding) grammarTips.push({ message: 'Add a clear sentence ending such as です, ます, ました, or ください where appropriate.', messageKey: k('games.mirror.tip.grammar.ending') });
  if (sentenceCount < Math.min(2, text.ideaMap.length)) grammarTips.push({ message: 'Split the ideas into clear Japanese sentences.', messageKey: k('games.mirror.tip.grammar.split') });
  if (grammarTips.length === 0) grammarTips.push({ message: 'Sentence endings and script balance look stable for this level.', messageKey: 'games.mirror.tip.grammar.ok' });

  const vocabularyTips: MirrorTip[] = [];
  if (draftTerms.length < Math.max(2, text.level)) vocabularyTips.push({ message: 'Use more content words from the idea map rather than only short function words.', messageKey: 'games.mirror.tip.vocabulary.contentWords' });
  if (uniqueKanji < Math.max(1, text.level - 1)) vocabularyTips.push({ message: 'Try using the core kanji vocabulary expected at this level.', messageKey: k('games.mirror.tip.vocabulary.kanji') });
  if (vocabularyTips.length === 0) vocabularyTips.push({ message: 'Vocabulary density is healthy for this prompt.', messageKey: 'games.mirror.tip.vocabulary.ok' });

  const flowTips: MirrorTip[] = [];
  if (!hasConnective && text.ideaMap.length >= 3) flowTips.push({ message: 'Connect ideas with words like ので, そして, ただし, or ため.', messageKey: k('games.mirror.tip.flow.connect') });
  if (sentenceCount > text.ideaMap.length + 2) flowTips.push({ message: 'The draft is fragmented; combine related clauses for a smoother paragraph.', messageKey: 'games.mirror.tip.flow.fragmented' });
  if (flowTips.length === 0) flowTips.push({ message: 'The draft has a readable paragraph shape.', messageKey: 'games.mirror.tip.flow.ok' });

  const fidelityTips: MirrorTip[] = [];
  if (coverage < 0.45) fidelityTips.push({ message: 'Several core ideas from the prompt are missing or expressed too indirectly.', messageKey: 'games.mirror.tip.fidelity.missing' });
  if (lengthRatio < 0.45) fidelityTips.push({ message: 'The answer is much shorter than the reference, so it likely omits required meaning.', messageKey: 'games.mirror.tip.fidelity.short' });
  if (coveredTerms[0]) fidelityTips.push({ span: coveredTerms[0], message: 'This key idea is represented clearly.', messageKey: 'games.mirror.tip.fidelity.covered' });
  if (fidelityTips.length === 0) fidelityTips.push({ message: 'The main ideas appear to be covered.', messageKey: 'games.mirror.tip.fidelity.ok' });

  const grammar = axis(jpRatio * 42 + (hasPoliteEnding ? 26 : 8) + Math.min(32, sentenceCount * 11), grammarTips);
  const vocabulary = axis(Math.min(42, draftTerms.length * 6) + Math.min(30, uniqueKanji * 5) + Math.min(28, lengthRatio * 22), vocabularyTips);
  const flow = axis((hasConnective ? 35 : 16) + Math.min(35, sentenceCount * 10) + Math.min(30, Math.max(0, 1 - Math.abs(1 - lengthRatio)) * 30), flowTips);
  const fidelity = axis(coverage * 72 + Math.min(28, lengthRatio * 28), fidelityTips);
  const total = Math.round((grammar.score + vocabulary.score + flow.score + fidelity.score) / 4);

  return {
    evaluatorVersion: 'quick-check-v2',
    total,
    axes: { grammar, vocabulary, flow, fidelity },
    summary:
      total >= 85
        ? 'Strong recall. The draft expresses the prompt with only light polish needed.'
        : total >= 65
          ? 'Solid draft. Tighten missing ideas and sentence flow before comparing with the reference.'
          : 'Early draft. Focus on covering every idea in clear Japanese sentences.',
    summaryKey: total >= 85 ? 'games.mirror.summary.strong' : total >= 65 ? 'games.mirror.summary.solid' : k('games.mirror.summary.early'),
  };
}

/** The request body an OpenAI-compatible chat endpoint is sent. */
function requestBody(text: MirrorText, draft: string): unknown {
  return {
    temperature: 0,
    messages: [
      {
        role: 'system',
        content:
          `You are a strict ${LANG_NAME[text.lang ?? 'ja']} writing evaluator. Return valid JSON matching the requested schema and nothing else.`,
      },
      { role: 'user', content: buildPrompt(text, draft) },
    ],
  };
}

type ApiReply = { ok: true; data: unknown } | { ok: false; status?: number; detail?: string };

/**
 * One POST to the configured endpoint. In the app it is sent by main
 * (`window.api.gamesMirrorEvaluate`): the packaged CSP's `connect-src` refuses a
 * renderer `fetch` to any endpoint a user can type here, so a direct fetch failed with
 * "Failed to fetch" in every packaged build (round-4 console sweep). The direct fetch
 * is kept only for a page with no preload bridge (tests, harness pages).
 */
async function postToEndpoint(settings: GameArenaSettings, body: unknown): Promise<ApiReply> {
  const url = settings.mirrorApiUrl.trim();
  const apiKey = settings.mirrorApiKey.trim();
  const bridge = typeof window !== 'undefined' ? window.api?.gamesMirrorEvaluate : undefined;
  if (bridge) {
    const reply = await bridge({ url, apiKey, body });
    if (reply.ok) return { ok: true, data: reply.data };
    return { ok: false, status: reply.reason === 'http' ? reply.status : undefined, detail: reply.detail };
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) return { ok: false, status: response.status };
  return { ok: true, data: await response.json() };
}

async function callApi(settings: GameArenaSettings, text: MirrorText, draft: string, retry: boolean): Promise<MirrorEvaluationResult> {
  if (!settings.mirrorApiUrl.trim() || !settings.mirrorApiKey.trim()) {
    return {
      ok: false,
      reason: 'api-missing',
      message: 'Configure an API endpoint and key in Game Arena settings.',
      messageKey: 'games.mirror.error.apiMissing',
    };
  }

  try {
    const reply = await postToEndpoint(settings, requestBody(text, draft));
    if (!reply.ok) {
      if (reply.status !== undefined) {
        return {
          ok: false,
          reason: 'network',
          message: `Evaluator request failed (${reply.status}).`,
          messageKey: 'games.mirror.error.network',
          messageVars: { status: reply.status },
        };
      }
      return {
        ok: false,
        reason: 'network',
        // A platform exception is not our prose, so it carries no key and stays
        // verbatim; only our own fallback sentence is translatable.
        message: reply.detail ?? 'The evaluator request failed.',
        messageKey: reply.detail ? undefined : 'games.mirror.error.requestFailed',
      };
    }
    const parsed = extractJson(reply.data);
    const evaluation = validateMirrorEvaluation(parsed);
    if (evaluation) return { ok: true, evaluation };
    if (!retry) return callApi(settings, text, draft, true);
    return {
      ok: false,
      reason: 'schema-invalid',
      message: 'The evaluator response did not match the score schema.',
      messageKey: 'games.mirror.error.schemaInvalid',
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'network',
      message: err instanceof Error ? err.message : 'The evaluator request failed.',
      messageKey: err instanceof Error ? undefined : 'games.mirror.error.requestFailed',
    };
  }
}

/**
 * Score a draft. `local` is the quick check: a rubric over script, sentence
 * shape, connectives and idea coverage, instant and with nothing to download
 * (a 28.9 MB "evaluator" download used to gate it, and that model was never
 * run). `api` sends the draft to the endpoint set in Game Arena settings.
 * Detailed feedback from the app's own AI goes through the Agent instead.
 */
export async function evaluateMirrorWriting(
  settings: GameArenaSettings,
  text: MirrorText,
  draft: string,
): Promise<MirrorEvaluationResult> {
  if (settings.mirrorBackend === 'api') {
    return callApi(settings, text, draft, false);
  }
  return { ok: true, evaluation: localRubricEvaluate(text, draft) };
}
