import type { AgentToolHandlers } from '../shared/localAgent';
import type { TVars } from '../shared/i18n/core';
import type {
  AiDeckGenerationRequest,
  AiEnrichmentResult,
  AiEngineConfig,
  AiMiningLanguage,
} from '../shared/mining';
// Leaf modules, not the `shared/mining` barrel and NEVER `shared/aiMiningCatalog`.
// This module is reached from `agentToolRegistry`, which is on Blanc's boot path,
// and the catalog is the 41 KB of prompt presets the barrel comment in
// shared/mining.ts exists to keep out of the entry chunk. The preset and format
// lists come over IPC (`aiListPresets` / `aiListFormats`) instead — main owns them
// already, so the renderer never needs the table.
import { AI_MINING_LANGUAGES } from '../shared/aiLanguageLayouts';
import { DEFAULT_AI_PROVIDER_ID, providerKeyBucket } from '../shared/aiProviders';
import { loadSaved } from './savedWords';

export type CardStudioAgentTranslate = (key: string, vars?: TVars) => string;

/**
 * Card Studio's own ceiling is 50 cards per word; these bound the *inputs* so one
 * planned step cannot spend an unbounded amount of the user's provider quota.
 * A generation step is the only agent operation that costs money per call.
 */
const MAX_TERMS = 25;
const MAX_WORD_COUNT = 25;
const MAX_CARD_COUNT = 10;

function boundedCount(value: unknown, fallback: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.floor(value)));
}

function optionalLanguage(value: unknown): AiMiningLanguage | undefined {
  // AI_MINING_LANGUAGES is a list of `{ id, label }`, not of ids — comparing
  // against the entries directly would reject every valid language.
  return typeof value === 'string'
    && AI_MINING_LANGUAGES.some((language) => language.id === value)
    ? (value as AiMiningLanguage)
    : undefined;
}

function optionalText(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.trim().slice(0, limit);
}

export type CardStudioBlockedReason = 'api-key-missing' | 'local-model-missing';

/**
 * Whether the configured engine can actually run, and — when it cannot — which of
 * the two reasons it is.
 *
 * `AiEngineConfig.apiKeySet` is NOT authoritative on its own: it is the legacy
 * single-key flag, and `AiCardStudio`'s own `normalizeAiEngineConfig` recomputes it
 * per provider from `apiKeysSet[bucket]`. Reading the flat flag here would report a
 * saved Gemini key as satisfying a DeepSeek run.
 */
export function cardStudioReadiness(config: AiEngineConfig): {
  ready: boolean;
  blockedBy?: CardStudioBlockedReason;
} {
  if (config.engine === 'local-qwen') {
    return config.localModelAvailable
      ? { ready: true }
      : { ready: false, blockedBy: 'local-model-missing' };
  }
  const bucket = providerKeyBucket(config.providerId ?? DEFAULT_AI_PROVIDER_ID);
  const keySet = Boolean(config.apiKeysSet?.[bucket] ?? config.apiKeySet);
  return keySet ? { ready: true } : { ready: false, blockedBy: 'api-key-missing' };
}

function requireReadyEngine(t: CardStudioAgentTranslate, config: AiEngineConfig): void {
  const { ready, blockedBy } = cardStudioReadiness(config);
  if (ready) return;
  throw new Error(
    blockedBy === 'local-model-missing'
      ? t('blanc.agent.error.aiLocalModelMissing')
      : t('blanc.agent.error.aiKeyMissing'),
  );
}

export interface CardStudioTerm {
  term: string;
  reading?: string;
  sentence?: string;
}

/**
 * The terms to enrich, and where they came from.
 *
 * The `sentence` carried on each term is the point of this adapter. Main has
 * consumed `terms[].sentence` since the dictionary path was written
 * (`main/mining.ts`, `sentence: entry.sentence ?? ''`), but the only caller —
 * Card Studio's form — builds its terms from `savedWords` and passes `term` and
 * `reading` only. So the studio can enrich a word, never the line it appeared in.
 * An agent step CAN supply that line, because the context shelf is holding it.
 * That is a use of an existing contract, not a new one.
 */
export function resolveCardStudioTerms(
  arguments_: Readonly<Record<string, unknown>>,
): { terms: CardStudioTerm[]; from: 'arguments' | 'saved-words' } {
  const raw = arguments_.terms;
  if (Array.isArray(raw) && raw.length) {
    const terms: CardStudioTerm[] = [];
    for (const entry of raw.slice(0, MAX_TERMS)) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Record<string, unknown>;
      const term = optionalText(row.term ?? row.word, 100);
      if (!term) continue;
      terms.push({
        term,
        ...(optionalText(row.reading, 100) ? { reading: optionalText(row.reading, 100) } : {}),
        ...(optionalText(row.sentence, 500) ? { sentence: optionalText(row.sentence, 500) } : {}),
      });
    }
    if (terms.length) return { terms, from: 'arguments' };
  }
  // Same fallback the form has: the words starred in Dictionary. Newest first, so
  // a capped run takes what the user just saved rather than an arbitrary slice.
  const saved = [...loadSaved()].sort((a, b) => b.addedAt - a.addedAt).slice(0, MAX_TERMS);
  return {
    terms: saved.map((word) => ({
      term: word.word,
      ...(word.reading ? { reading: word.reading } : {}),
    })),
    from: 'saved-words',
  };
}

/**
 * Flattens the enrichment results into the exact card shape `flashcard.add-cards`
 * accepts, so a plan can pipe generate → add-cards without a translation step in
 * between. Generation itself writes NOTHING; see the handler comment.
 */
export function cardStudioCardRows(results: readonly AiEnrichmentResult[]): Array<{
  word: string;
  reading: string;
  meaning: string;
  sentence?: string;
  front: string;
  back: string;
}> {
  const rows = [];
  for (const result of results) {
    for (const card of result.cards) {
      rows.push({
        word: result.expression,
        reading: result.reading || '',
        meaning: result.meaning || card.back?.split('\n')[0] || '',
        ...(result.sentence ? { sentence: result.sentence } : {}),
        front: card.front,
        back: card.back,
      });
    }
  }
  return rows;
}

/**
 * The AI Card Studio adapters.
 *
 * `list-card-presets` is capability discovery: it answers "what can you generate,
 * and what is stopping you" in one read, which is what lets the agent point the
 * user at the key input instead of failing inside a provider call.
 *
 * `generate-cards` runs the studio's own pipeline and **writes nothing**. That is
 * a deliberate divergence from the form, which calls `saveAiResultsToDeck`
 * unconditionally the moment generation returns — before its preview panel has
 * rendered, and through `replaceImportedDeck`, which DELETES every existing card
 * sharing the deck title before inserting. Reproducing that here would give the
 * agent a destructive write with no confirmation gate and no undo, in an
 * operation whose declared claim is that it generated something. The write stays
 * `flashcard.add-cards`: already gated, already logged, already invertible.
 */
export function createCardStudioAgentHandlers(t: CardStudioAgentTranslate): AgentToolHandlers {
  return {
    'flashcard.list-card-presets': async () => {
      const [config, presets] = await Promise.all([
        window.api.aiGetConfig(),
        window.api.aiListPresets(),
      ]);
      const { ready, blockedBy } = cardStudioReadiness(config);
      const formats = (await window.api.aiListFormats()).filter(
        (format) => format.presetId === config.selectedPresetId,
      );

      return {
        ready,
        ...(blockedBy ? { blockedBy, resolveAt: 'flashcards.aiStudio' } : {}),
        engine: config.engine,
        providerId: config.providerId ?? DEFAULT_AI_PROVIDER_ID,
        selectedPresetId: config.selectedPresetId,
        selectedFormatId: config.selectedFormatId,
        direction: {
          frontLang: config.frontLang,
          backLang: config.backLang,
          reverse: config.reverse,
          backGlossLangs: config.backGlossLangs ?? [],
        },
        savedWords: loadSaved().length,
        presets: presets.map((preset) => ({
          id: preset.id,
          label: preset.label,
          category: preset.category,
          description: preset.description,
        })),
        formats: formats.map((format) => ({
          id: format.id,
          label: format.label,
          outputFormat: format.outputFormat,
        })),
      };
    },

    'flashcard.generate-cards': async (arguments_) => {
      const config = await window.api.aiGetConfig();
      requireReadyEngine(t, config);

      const source = arguments_.source === 'dictionary' ? 'dictionary' : 'preset';
      const presetId = optionalText(arguments_.presetId, 120) ?? config.selectedPresetId;
      const formatId = optionalText(arguments_.formatId, 120) ?? config.selectedFormatId;
      const cardCount = boundedCount(arguments_.cardCount, config.cardCount, MAX_CARD_COUNT);

      const request: AiDeckGenerationRequest = {
        source,
        presetId,
        formatId,
        cardCount,
        providerId: config.providerId,
        outputFormat: config.outputFormat,
        frontLang: optionalLanguage(arguments_.frontLang) ?? config.frontLang,
        backLang: optionalLanguage(arguments_.backLang) ?? config.backLang,
        reverse: typeof arguments_.reverse === 'boolean' ? arguments_.reverse : config.reverse,
        backGlossLangs: config.backGlossLangs,
      };

      let usedTerms: CardStudioTerm[] = [];
      let termSource: 'arguments' | 'saved-words' | undefined;
      if (source === 'dictionary') {
        const resolved = resolveCardStudioTerms(arguments_);
        // Main throws a form-shaped message here ("Star words in Dictionary
        // first…"). Refusing before the IPC keeps the reason attached to the
        // argument the step actually got wrong.
        if (!resolved.terms.length) throw new Error(t('blanc.agent.error.aiNoTerms'));
        usedTerms = resolved.terms;
        termSource = resolved.from;
        request.terms = resolved.terms;
      } else {
        request.wordCount = boundedCount(arguments_.wordCount, 10, MAX_WORD_COUNT);
      }

      const results = await window.api.aiGenerateDeck(request);
      const cards = cardStudioCardRows(results);

      return {
        generated: true,
        saved: false,
        source,
        presetId,
        formatId,
        cardCount,
        engine: config.engine,
        ...(config.engine === 'cloud' ? { sentToProvider: request.providerId } : {}),
        ...(termSource ? { termSource } : {}),
        ...(source === 'dictionary'
          ? {
            terms: usedTerms.length,
            termsWithSentence: usedTerms.filter((term) => Boolean(term.sentence)).length,
          }
          : { wordCount: request.wordCount }),
        expressions: results.map((result) => result.expression),
        cards,
      };
    },
  };
}
