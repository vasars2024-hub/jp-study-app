// What a surface needs to render Contextual Explain, and nothing it needs to run it.
//
// The producer (`dict:explain`) lives in main and the renderer only ever hands
// it a policy, a word and its grounding. Everything in this module is the pure
// half of that hand-off: which provider the request goes to, what grounding one
// dictionary entry yields, and which translated label each part of the answer
// is rendered under. No IPC, no React, no database — so the decisions here are
// testable without any of them.
//
// The label maps in particular are the reason this file exists rather than a
// literal inside the component. A section kind is a closed set that main already
// enforces, and a surface that invents its own mapping is how a heading ends up
// untranslated for exactly the kind the model happened to return.

import { defaultAgentExecutionPolicy } from './agentExecutionBridge';
import type { AgentProviderPolicy } from './agentWorkspace';
import {
  DEFAULT_AI_PROVIDER_ID,
  providerKeyBucket,
  type AiApiKeysSet,
  type AiProviderId,
} from './aiProviders';
import type { AiEngineKind } from './miningTypes';
import {
  EXPLAIN_GLOSS_MAX_CHARS,
  EXPLAIN_MAX_GLOSSES,
  type LexiconExplainGrounding,
} from './lexiconExplainPrompt';
import type { LexiconExplanationSectionKind } from './lexiconExplanations';

/**
 * The translated heading each section kind is rendered under.
 *
 * Keyed on the kind rather than looked up by string concatenation so a kind
 * added to `EXPLANATION_SECTION_KINDS` without a label is a type error here
 * instead of a `lexicon.wordExplain.section.whatever` printed raw at a reader.
 */
export const EXPLANATION_SECTION_LABEL_KEYS: Record<LexiconExplanationSectionKind, string> = {
  nuance: 'lexicon.wordExplain.section.nuance',
  contrast: 'lexicon.wordExplain.section.contrast',
  register: 'lexicon.wordExplain.section.register',
  collocation: 'lexicon.wordExplain.section.collocation',
  mistake: 'lexicon.wordExplain.section.mistake',
  etymology: 'lexicon.wordExplain.section.etymology',
  grammar: 'lexicon.wordExplain.section.grammar',
  mnemonic: 'lexicon.wordExplain.section.mnemonic',
  example: 'lexicon.wordExplain.section.example',
};

/**
 * The message shown for each way `dict:explain` can fail.
 *
 * Deliberately keyed by the raw string rather than by the handler's own union:
 * that union is declared in main, and a renderer module importing a main type to
 * build a runtime value is the wrong direction. `explainErrorLabelKey` falls back
 * to a generic message, so a failure code this build does not know about still
 * says something true instead of rendering nothing at all.
 */
const EXPLAIN_ERROR_LABEL_KEYS: Record<string, string> = {
  'invalid-request': 'lexicon.wordExplain.failedRequest',
  'provider-failed': 'lexicon.wordExplain.failedProvider',
  unparsable: 'lexicon.wordExplain.failedUnparsable',
  'not-stored': 'lexicon.wordExplain.failedStore',
};

export function explainErrorLabelKey(error: string | undefined): string {
  return (error && EXPLAIN_ERROR_LABEL_KEYS[error]) || 'lexicon.wordExplain.failedUnknown';
}

/**
 * Why the configured engine cannot answer.
 *
 * Both are states the user can fix themselves, which is why they are named
 * rather than folded into a generic "unavailable": one needs an API key, the
 * other needs the local model downloaded, and the copy for each says so.
 */
export type ExplainEngineBlock = 'cloud-key' | 'local-model';

export type ExplainEngineResolution =
  | { ok: true; policy: AgentProviderPolicy }
  | { ok: false; blocked: ExplainEngineBlock };

/** The parts of the app's AI engine configuration this decision reads. */
export interface ExplainEngineConfig {
  engine: AiEngineKind;
  providerId?: AiProviderId;
  apiKeysSet?: AiApiKeysSet;
  localModelAvailable?: boolean;
}

/**
 * The provider this surface explains with, taken from the app's own AI engine
 * configuration rather than from a second picker.
 *
 * A per-panel provider control would be a third place the user selects a model,
 * and the two that already exist (AI Card Studio's engine, the Agent
 * workspace's per-conversation target) are enough. More to the point, the cache
 * key contains the model: a panel that quietly used a different provider than
 * the one the app is configured with would miss the cache on every lookup and
 * pay for it, with nothing on screen saying why.
 *
 * The refusals are checked here, before anything is sent. `dict:explain` refuses
 * a cloud target without consent on its own, but it cannot know whether a key
 * exists, and "the request was invalid" is not a useful thing to tell someone
 * whose actual problem is an empty API key field.
 */
export function explainPolicyFromEngine(config: ExplainEngineConfig): ExplainEngineResolution {
  if (config.engine === 'local-qwen') {
    if (!config.localModelAvailable) return { ok: false, blocked: 'local-model' };
    return { ok: true, policy: defaultAgentExecutionPolicy('local') };
  }
  const providerId = config.providerId ?? DEFAULT_AI_PROVIDER_ID;
  if (!config.apiKeysSet?.[providerKeyBucket(providerId)]) {
    return { ok: false, blocked: 'cloud-key' };
  }
  return { ok: true, policy: defaultAgentExecutionPolicy(providerId) };
}

/** One dictionary sense, in the shape both `DictEntry` and the interlinear match carry. */
export interface ExplainSenseLike {
  partsOfSpeech?: readonly string[];
  definitions?: readonly string[];
}

/**
 * The grounding one entry contributes: the glosses already on screen, in the
 * order the entry shows them.
 *
 * Deduplicated case-insensitively because several senses of one word routinely
 * repeat a gloss, and a request that spends four of its twelve gloss slots on
 * the same word has that much less room for the senses that differ. Bounded here
 * as well as in main so a fifty-sense JMdict entry never crosses IPC whole.
 */
export function explainGroundingFromSenses(
  senses: readonly ExplainSenseLike[] | undefined,
): LexiconExplainGrounding {
  const glosses: string[] = [];
  const seenGloss = new Set<string>();
  const partsOfSpeech: string[] = [];
  const seenPos = new Set<string>();
  for (const sense of senses ?? []) {
    for (const raw of sense.definitions ?? []) {
      if (glosses.length >= EXPLAIN_MAX_GLOSSES) break;
      const gloss = typeof raw === 'string' ? raw.trim().slice(0, EXPLAIN_GLOSS_MAX_CHARS) : '';
      if (!gloss || seenGloss.has(gloss.toLowerCase())) continue;
      seenGloss.add(gloss.toLowerCase());
      glosses.push(gloss);
    }
    for (const raw of sense.partsOfSpeech ?? []) {
      if (partsOfSpeech.length >= 8) break;
      const pos = typeof raw === 'string' ? raw.trim().slice(0, 40) : '';
      if (!pos || seenPos.has(pos.toLowerCase())) continue;
      seenPos.add(pos.toLowerCase());
      partsOfSpeech.push(pos);
    }
  }
  return partsOfSpeech.length ? { glosses, partsOfSpeech } : { glosses };
}

/**
 * One interlinear token's entry, in the shape `explainGroundingFromSenses` reads.
 *
 * Deliberately blind to `pinnedSense`, and that is the decision rather than an
 * oversight. A pinned sense is the reader saying which meaning *this passage*
 * used, and leading the grounding with it would produce a better explanation —
 * but the storage key is the word, the prose language, the model and the prompt
 * version, and nothing in it records which sense was pinned. Grounding that
 * varied with the pin would write one reader's sense-3 answer into the cell every
 * later reader's sense-1 lookup reads, with nothing on screen saying so. The
 * grounding is therefore the entry, in the entry's own order, every time.
 */
export function explainSensesFromMatch(match: {
  glosses?: readonly { text: string }[];
  senses?: readonly { glosses: readonly { text: string }[] }[];
}): ExplainSenseLike[] {
  if (match.senses?.length) {
    return match.senses.map((sense) => ({ definitions: sense.glosses.map((gloss) => gloss.text) }));
  }
  return [{ definitions: (match.glosses ?? []).map((gloss) => gloss.text) }];
}

/**
 * Whether an entry carries enough for a *grounded* explanation.
 *
 * Defined in terms of `explainSensesFromMatch` rather than by reading the same
 * fields a second time, so the check and the payload can never disagree: if this
 * says yes, the request that follows has at least one gloss in it.
 *
 * A token that matched a headword but yielded no gloss in the reader's target
 * languages fails here on purpose. The word is real, but the only thing the
 * request could carry is the word itself, and prose grounded in nothing is the
 * one output this surface must not present as dictionary-backed.
 */
export function hasExplainGrounding(match: {
  glosses?: readonly { text: string }[];
  senses?: readonly { glosses: readonly { text: string }[] }[];
}): boolean {
  return explainSensesFromMatch(match).some(
    (sense) => (sense.definitions ?? []).some((definition) => definition.trim().length > 0),
  );
}
