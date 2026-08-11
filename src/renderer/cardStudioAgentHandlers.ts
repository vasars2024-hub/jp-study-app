import type { AgentToolHandlers } from '../shared/localAgent';
import type { TVars } from '../shared/i18n/core';
import type {
  AiDeckGenerationRequest,
  AiEnrichmentResult,
  AiEngineConfig,
  AiMiningLanguage,
  MiningCandidate,
} from '../shared/mining';
// Leaf modules, not the `shared/mining` barrel and NEVER `shared/aiMiningCatalog`.
// This module is reached from `agentToolRegistry`, which is on Blanc's boot path,
// and the catalog is the 41 KB of prompt presets the barrel comment in
// shared/mining.ts exists to keep out of the entry chunk. The preset and format
// lists come over IPC (`aiListPresets` / `aiListFormats`) instead — main owns them
// already, so the renderer never needs the table.
import { AI_MINING_LANGUAGES } from '../shared/aiLanguageLayouts';
import { DEFAULT_AI_PROVIDER_ID, providerKeyBucket } from '../shared/aiProviders';
// `shared/chapterRange` is a dependency-free leaf, so naming a scoped deck here
// costs the boot path nothing. It is also the ONLY way to name one: traditional
// mining, the Anki deck, the export file and this adapter all read the same
// function, which is what stops four surfaces from inventing four names.
import { miningDeckIdentity } from '../shared/chapterRange';
import type { ChapterRange, MiningDeckIdentity } from '../shared/chapterRange';
import { loadSaved } from './savedWords';
import { stageAgentCardBatch } from './agentCardBatchStagingClient';

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

/**
 * A chapter bound as the planner may have written it.
 *
 * Numeric strings are accepted because a local model emits `"3"` about as often as
 * `3`, and refusing one spelling would make the range silently vanish — the step
 * would run whole-book and report success. Out-of-range values are NOT rejected
 * here: `normalizeChapterRange` clamps them against the real section count, which
 * only main knows, and clamping twice against a count this side is guessing.
 * `null` means "not specified", which is the one thing a bound must not invent.
 */
function optionalIndex(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return Math.floor(parsed);
  }
  return null;
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

/** Where a run's terms came from. Reported per run so the user can see it. */
export type CardStudioTermSource = 'arguments' | 'saved-words' | 'book-chapters';

/** What the adapter accepts. `book` has no main-level counterpart — see the handler. */
export type CardStudioGenerationSource = 'preset' | 'dictionary' | 'book';

export function resolveGenerationSource(value: unknown): CardStudioGenerationSource {
  if (value === 'dictionary') return 'dictionary';
  // `epub` and `chapter` are what a model reaches for when it has been told the
  // library holds EPUBs; accepting them costs nothing and refusing them would
  // silently downgrade a scoped request to an invented-word one.
  if (value === 'book' || value === 'epub' || value === 'chapter') return 'book';
  return 'preset';
}

/**
 * The vocabulary a chapter range yielded, as generation terms.
 *
 * Ordered by occurrence count descending, with the expression as a deterministic
 * tie-break. `analyzeBook` returns candidates in tokenizer order — stable for a
 * given book, but carrying no signal about which words are worth a card — so an
 * unsorted cap would take whichever words happen to appear first in chapter one.
 * The tie-break is a plain code-unit comparison rather than `localeCompare`,
 * whose ordering depends on the host's ICU data; this must not vary by machine.
 *
 * The cap is the same `MAX_TERMS` the dictionary path uses. It matters more here:
 * a chapter range routinely yields thousands of candidates and every one of them
 * would be a paid enrichment call.
 *
 * `sampleSentence` becomes the term's `sentence`, which is the point of mining a
 * range rather than starring words by hand — main has consumed `terms[].sentence`
 * since the dictionary path was written, and the mined line is exactly the
 * context the card should quote.
 */
export function bookRangeTerms(
  candidates: readonly MiningCandidate[],
  limit: number,
): CardStudioTerm[] {
  return [...candidates]
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (a.expression < b.expression) return -1;
      return a.expression > b.expression ? 1 : 0;
    })
    .slice(0, Math.max(0, limit))
    .map((candidate) => ({
      term: candidate.expression,
      ...(candidate.reading ? { reading: candidate.reading } : {}),
      ...(candidate.sampleSentence
        ? { sentence: candidate.sampleSentence.trim().slice(0, 500) }
        : {}),
    }));
}

export interface CardStudioBookScope {
  itemId: string;
  bookTitle: string;
  /** The range main actually applied — `null` for a whole-book run. */
  range: ChapterRange | null;
  sectionCount: number;
  /** Candidates the range produced, before the `MAX_TERMS` cap. */
  candidateCount: number;
  terms: CardStudioTerm[];
  identity: MiningDeckIdentity;
}

/**
 * Mines a chapter range and turns it into generation terms.
 *
 * This is the parity fix: traditional mining has had a chapter range since
 * `EpubMiningPanel` grew one, and the agent path could only ever generate from
 * invented words or starred ones — so "make me cards for chapters 3 to 7" had no
 * expression at all. `miningAnalyzeEpub` is the same IPC the manual panel calls,
 * with the same arguments, and it WRITES NOTHING: it unzips the sections in the
 * range, tokenizes, attaches offline glosses and returns. Nothing about this
 * weakens the adapter's no-write property.
 *
 * The range is NOT normalized here. `normalizeChapterRange` needs the book's real
 * section count, and only main has it before the extraction runs; main normalizes
 * internally and reports back the range it used, so the identity is built from
 * what actually happened rather than from what was asked. That is also why an
 * out-of-range chapter number is not an error — it clamps, exactly as the manual
 * panel's number inputs do.
 *
 * No mining config is passed, so main uses the user's saved traditional-mining
 * settings — the same ones the panel would have loaded. An agent step silently
 * mining under different thresholds than the panel shows would be a trap.
 */
export async function resolveCardStudioBookScope(
  t: CardStudioAgentTranslate,
  arguments_: Readonly<Record<string, unknown>>,
): Promise<CardStudioBookScope> {
  const itemId = optionalText(arguments_.itemId ?? arguments_.bookId ?? arguments_.id, 200);
  if (!itemId) throw new Error(t('blanc.agent.error.aiNoBook'));

  const from = optionalIndex(arguments_.chapterFrom ?? arguments_.from);
  const to = optionalIndex(arguments_.chapterTo ?? arguments_.to);
  const analysis = await window.api.miningAnalyzeEpub(itemId, undefined, { from, to });

  const range = analysis.range ?? null;
  const terms = bookRangeTerms(analysis.candidates, boundedCount(arguments_.termLimit, MAX_TERMS, MAX_TERMS));
  // Main already refuses a range with no readable TEXT. This is the other empty:
  // text that survived extraction but nothing that cleared the frequency floor
  // and blacklist. Sending it on would spend a provider call to generate nothing.
  if (!terms.length) throw new Error(t('blanc.agent.error.aiNoBookTerms'));

  return {
    itemId,
    bookTitle: analysis.title,
    range,
    sectionCount: analysis.sections?.length ?? 0,
    candidateCount: analysis.candidates.length,
    terms,
    identity: miningDeckIdentity({
      itemId,
      bookTitle: analysis.title,
      range,
      // Distinct from a traditional mining run of the same range, whose deck this
      // must never replace — the two generators produce different cards.
      generator: 'ai-studio',
    }),
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
 * The deck a generated batch belongs to, named exactly as the surface that will
 * save it would name it.
 *
 * A `book` run takes `miningDeckIdentity`'s pair, so an agent batch reviewed in
 * the studio saves into the same group a manual mining run of the same range
 * would — and carries the id explicitly, because `saveAiResultsToDeck` derives
 * one with `deckBookId`, whose ASCII-only slug collapses every Japanese title to
 * the same value (see `AgentStagedCardBatch.deckBookId`).
 *
 * Everything else takes `<preset label> studio`, which is the literal string the
 * studio's own Save button builds. The preset list is read over IPC rather than
 * from `shared/aiMiningCatalog` for the reason at the top of this file. A preset
 * that cannot be resolved falls back to `AI studio` — the studio's own fallback —
 * rather than to the raw id, so a claimed batch never names a deck after
 * something the user has not seen in the UI.
 */
async function resolveBatchDeck(
  presetId: string,
  book: CardStudioBookScope | undefined,
): Promise<{ deckLabel: string; deckBookId?: string }> {
  if (book) {
    return { deckLabel: book.identity.deckTitle, deckBookId: book.identity.bookId };
  }
  try {
    const preset = (await window.api.aiListPresets()).find((entry) => entry.id === presetId);
    return { deckLabel: `${preset?.label ?? 'AI'} studio` };
  } catch {
    return { deckLabel: 'AI studio' };
  }
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
 *
 * `generate-cards` takes three sources. `preset` invents words, `dictionary` uses
 * starred or supplied ones, and `book` mines a chapter range — the last of which
 * exists so the agent can express what the manual mining panel has always been
 * able to do. All three end in the same rows and the same no-write guarantee; the
 * `book` run additionally reports the deck identity its range belongs to, so the
 * `add-cards` step that follows lands in the right group.
 *
 * Every accepted run also **stages** its batch for AI Card Studio's own editor
 * (`shared/agentCardBatchStaging.ts`). That is what makes this a conversion of
 * the studio rather than a replacement of it: the plan asks for Agent skills
 * "while preserving rich dedicated editors for preview and correction", and rows
 * that only ever exist in a chat reach no editor. Staging is still not a write —
 * the batch lives in main memory, expires, and reaches a deck only when the user
 * presses the studio's own Save button against a visible preview.
 *
 * A failed stage does **not** fail the run. The provider call has already been
 * made and paid for, and the rows are in the result either way; the outcome is
 * reported as `stagedForReview: false` with its reason so the model can say so
 * instead of retrying a generation that already succeeded.
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

      const source = resolveGenerationSource(arguments_.source);
      const presetId = optionalText(arguments_.presetId, 120) ?? config.selectedPresetId;
      const formatId = optionalText(arguments_.formatId, 120) ?? config.selectedFormatId;
      const cardCount = boundedCount(arguments_.cardCount, config.cardCount, MAX_CARD_COUNT);

      const request: AiDeckGenerationRequest = {
        // `book` is an adapter-level source, not a main-level one: main knows
        // "invent words" (`preset`) and "use the terms I gave you"
        // (`dictionary`), and a chapter range is the second of those with the
        // terms mined instead of starred. Reporting it as `book` in the RESULT
        // is what keeps the distinction honest for the user.
        source: source === 'book' ? 'dictionary' : source,
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
      let termSource: CardStudioTermSource | undefined;
      let book: CardStudioBookScope | undefined;
      if (source === 'book') {
        book = await resolveCardStudioBookScope(t, arguments_);
        usedTerms = book.terms;
        termSource = 'book-chapters';
        request.terms = book.terms;
      } else if (source === 'dictionary') {
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

      // Hand the batch to the studio's editor. Deliberately after the rows are
      // built, so a normalizer that refuses the batch cannot also be the thing
      // that loses the result the caller is owed.
      const deck = await resolveBatchDeck(presetId, book);
      const staged = await stageAgentCardBatch({ ...deck, source, results });

      return {
        generated: true,
        saved: false,
        // Where the user reviews and corrects this batch before it becomes a
        // deck. `reviewAt` is the studio's own route, so the model can point at
        // it rather than describing a place the user has to find.
        stagedForReview: staged.ok,
        ...(staged.ok
          ? {
            reviewAt: 'flashcards.aiStudio',
            deckLabel: deck.deckLabel,
            ...(staged.replacedUnclaimed ? { replacedUnreviewedBatch: true } : {}),
          }
          : { stageFailed: staged.code }),
        source,
        presetId,
        formatId,
        cardCount,
        engine: config.engine,
        ...(config.engine === 'cloud' ? { sentToProvider: request.providerId } : {}),
        ...(termSource ? { termSource } : {}),
        // The deck this run is FOR, named by `miningDeckIdentity` so the gated
        // `flashcard.add-cards` that follows writes to the same group a
        // traditional mining run of the same range would — and so re-running a
        // range updates it in place instead of accumulating duplicates.
        ...(book
          ? {
            itemId: book.itemId,
            bookTitle: book.bookTitle,
            chapterRange: book.identity.rangeLabel,
            ...(book.range ? { chapterFrom: book.range.from, chapterTo: book.range.to } : {}),
            sectionCount: book.sectionCount,
            deckTitle: book.identity.deckTitle,
            bookId: book.identity.bookId,
            candidates: book.candidateCount,
          }
          : {}),
        ...(source === 'preset'
          ? { wordCount: request.wordCount }
          : {
            terms: usedTerms.length,
            termsWithSentence: usedTerms.filter((term) => Boolean(term.sentence)).length,
          }),
        expressions: results.map((result) => result.expression),
        cards,
      };
    },
  };
}
