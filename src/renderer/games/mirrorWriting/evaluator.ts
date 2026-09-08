import type { MirrorText } from '../../data/mirrorTexts';
import type { GameArenaSettings } from '../settings';

export const MIRROR_EVALUATOR_ASSET_ID = 'mirror-writing-evaluator';

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
  | 'model-missing'
  | 'local-runtime-unavailable'
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

function buildPrompt(text: MirrorText, draft: string): string {
  const ideaMap = text.ideaMap.map((idea, index) => `${index + 1}. ${idea.concepts.en}`).join('\n');
  return [
    'Grade this Japanese active-recall writing exercise.',
    'Return strict JSON only with: evaluatorVersion, total, axes.grammar/vocabulary/flow/fidelity, summary.',
    'Each axis must have score 0-100 and tips [{span,message}].',
    'Do not invent a score if the draft is empty or not Japanese; use low scores with concrete tips.',
    '',
    `Idea map:\n${ideaMap}`,
    '',
    `Reference answer:\n${text.reference}`,
    '',
    `User draft:\n${draft}`,
  ].join('\n');
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function japaneseChars(value: string): string[] {
  return [...value].filter((ch) => /[\u3040-\u30ff\u3400-\u9fff]/.test(ch));
}

function contentTerms(value: string): string[] {
  const matches = value.match(/[\u3400-\u9fff]{2,}|[\u30a0-\u30ff]{2,}|[\u3040-\u309f]{3,}/g) ?? [];
  return [...new Set(matches.filter((term) => !['ています', 'ました', 'です', 'ます', 'ください'].includes(term)))];
}

function axis(score: number, tips: { span?: string; message: string }[]): MirrorAxisScore {
  return { score: clampPercent(score), tips: tips.slice(0, 4) };
}

function localRubricEvaluate(text: MirrorText, draft: string): MirrorEvaluation {
  const trimmed = draft.trim();
  const chars = [...trimmed];
  const jpChars = japaneseChars(trimmed);
  const jpRatio = chars.length ? jpChars.length / chars.length : 0;
  const sentenceCount = Math.max(1, (trimmed.match(/[。！？]/g) ?? []).length);
  const referenceTerms = contentTerms(text.reference);
  const draftTerms = contentTerms(trimmed);
  const coveredTerms = referenceTerms.filter((term) => trimmed.includes(term));
  const coverage = referenceTerms.length ? coveredTerms.length / referenceTerms.length : 0;
  const uniqueKanji = new Set([...trimmed].filter((ch) => /[\u3400-\u9fff]/.test(ch))).size;
  const hasPoliteEnding = /(です|ます|ました|ません|でしょう|ください)(。|$)/.test(trimmed);
  const hasConnective = /(ので|から|ただし|また|そして|しかし|ため|によって|として|ではなく)/.test(trimmed);
  const lengthRatio = Math.min(1.25, trimmed.length / Math.max(1, text.reference.length));

  const grammarTips: { span?: string; message: string }[] = [];
  if (jpRatio < 0.75) grammarTips.push({ message: 'Use mostly Japanese script in the answer.', messageKey: 'games.mirror.tip.grammar.script' });
  if (!hasPoliteEnding) grammarTips.push({ message: 'Add a clear sentence ending such as です, ます, ました, or ください where appropriate.', messageKey: 'games.mirror.tip.grammar.ending' });
  if (sentenceCount < Math.min(2, text.ideaMap.length)) grammarTips.push({ message: 'Split the ideas into clear Japanese sentences.', messageKey: 'games.mirror.tip.grammar.split' });
  if (grammarTips.length === 0) grammarTips.push({ message: 'Sentence endings and script balance look stable for this level.', messageKey: 'games.mirror.tip.grammar.ok' });

  const vocabularyTips: { span?: string; message: string }[] = [];
  if (draftTerms.length < Math.max(2, text.level)) vocabularyTips.push({ message: 'Use more content words from the idea map rather than only short function words.', messageKey: 'games.mirror.tip.vocabulary.contentWords' });
  if (uniqueKanji < Math.max(1, text.level - 1)) vocabularyTips.push({ message: 'Try using the core kanji vocabulary expected at this level.', messageKey: 'games.mirror.tip.vocabulary.kanji' });
  if (vocabularyTips.length === 0) vocabularyTips.push({ message: 'Vocabulary density is healthy for this prompt.', messageKey: 'games.mirror.tip.vocabulary.ok' });

  const flowTips: { span?: string; message: string }[] = [];
  if (!hasConnective && text.ideaMap.length >= 3) flowTips.push({ message: 'Connect ideas with words like ので, そして, ただし, or ため.', messageKey: 'games.mirror.tip.flow.connect' });
  if (sentenceCount > text.ideaMap.length + 2) flowTips.push({ message: 'The draft is fragmented; combine related clauses for a smoother paragraph.', messageKey: 'games.mirror.tip.flow.fragmented' });
  if (flowTips.length === 0) flowTips.push({ message: 'The draft has a readable paragraph shape.', messageKey: 'games.mirror.tip.flow.ok' });

  const fidelityTips: { span?: string; message: string }[] = [];
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
    evaluatorVersion: 'local-rubric-v1',
    total,
    axes: { grammar, vocabulary, flow, fidelity },
    summary:
      total >= 85
        ? 'Strong recall. The draft expresses the prompt with only light polish needed.'
        : total >= 65
          ? 'Solid draft. Tighten missing ideas and sentence flow before comparing with the reference.'
          : 'Early draft. Focus on covering every idea in clear Japanese sentences.',
    summaryKey: total >= 85 ? 'games.mirror.summary.strong' : total >= 65 ? 'games.mirror.summary.solid' : 'games.mirror.summary.early',
  };
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
    const response = await fetch(settings.mirrorApiUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.mirrorApiKey.trim()}`,
      },
      body: JSON.stringify({
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You are a strict Japanese writing evaluator. Return valid JSON matching the requested schema and nothing else.',
          },
          { role: 'user', content: buildPrompt(text, draft) },
        ],
      }),
    });
    if (!response.ok) {
      return {
        ok: false,
        reason: 'network',
        message: `Evaluator request failed (${response.status}).`,
        messageKey: 'games.mirror.error.network',
        messageVars: { status: response.status },
      };
    }
    const parsed = extractJson(await response.json());
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
      // A platform exception is not our prose, so it carries no key and stays
      // verbatim; only our own fallback sentence is translatable.
      message: err instanceof Error ? err.message : 'The evaluator request failed.',
      messageKey: err instanceof Error ? undefined : 'games.mirror.error.requestFailed',
    };
  }
}

export async function evaluateMirrorWriting(
  settings: GameArenaSettings,
  text: MirrorText,
  draft: string,
  localModelInstalled: boolean,
): Promise<MirrorEvaluationResult> {
  if (settings.mirrorBackend === 'api') {
    return callApi(settings, text, draft, false);
  }

  if (!localModelInstalled) {
    return {
      ok: false,
      reason: 'model-missing',
      message: 'Download the local Mirror Writing evaluator or switch to a configured API backend.',
      messageKey: 'games.mirror.error.modelMissing',
    };
  }

  return { ok: true, evaluation: localRubricEvaluate(text, draft) };
}
