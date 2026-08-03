// Field routing: decides, per template token, whether a value comes from the
// offline dictionaries or from the Qwen translator (the fail-switch), tracks
// provenance for every resolved value, and orchestrates batch enrichment with
// injected IO so both the EPUB miner (main process) and tests share one
// implementation.

import type { CandidateGlosses, MiningCandidate, TraditionalMiningConfig } from './miningTypes';
import { DEFAULT_TRADITIONAL_MINING_CONFIG } from './miningTypes';
import type { DictEntry } from './types';
import { textMatchesLang } from './langs';
import {
  extractTemplateTokens,
  buildEpubMiningValues,
  candidateLookupKey,
  glossFromEntry,
  inferTranslationTargetLang,
  isUsableTemplateValue,
  isValidCrossLangTranslation,
  needsEnrichmentLookup,
  resolveTraditionalTemplates,
  resolveTranslationSource,
} from './epubEnrichment';
import type { MiningValues } from './anki';

export type ValueSource = 'mined' | 'dict' | 'qwen' | 'api' | 'missing';

/** Marker appended to Qwen fail-switch values when the export option is on. */
export const FS_MARKER = ' [FS]';

/** Tokens the EPUB pipeline can never fill — excluded from completeness. */
const NEVER_FILLED_TOKENS = new Set(['audio', 'image', 'pitch']);

// ----- Enrichment orchestration ------------------------------------------------

export interface TranslateJob {
  id: string;
  text: string;
  source: string;
  target: string;
  /** Retry pass — the engine should use a stricter, single-item prompt. */
  strict?: boolean;
}

export interface EnrichmentProgress {
  phase: 'gloss' | 'translation';
  done: number;
  total: number;
  message?: string;
  health?: {
    dictFields: number;
    translated: number;
    failed: number;
    pending: number;
  };
}

/** IO injected by the caller (real dictionaries/Qwen in main, fakes in tests). */
export interface EnrichmentIO {
  lookupGlosses(
    queries: Array<{ expression: string; reading?: string }>,
    langs: string[],
  ): Promise<Record<string, CandidateGlosses>>;
  /** May throw (engine down) — runEnrichment degrades instead of crashing. */
  translateBatch(
    items: TranslateJob[],
    options?: { onProgress?: (done: number, total: number) => void },
  ): Promise<Array<{ id: string; text: string }>>;
  /** When false, translation is skipped up-front with a visible warning. */
  translateAvailable?(): boolean;
  /** Provenance tag for LLM-filled slots (offline Qwen vs cloud API). */
  translationSource?: 'qwen' | 'api';
  onProgress?(progress: EnrichmentProgress): void;
  shouldCancel?(): boolean;
}

export interface EnrichmentOutcome {
  candidates: MiningCandidate[];
  warnings: string[];
  cancelled: boolean;
}

/** When `glossOnly` is true, skip the Qwen phase (fast analyze / Jiten-style index). */
export interface EnrichmentOptions {
  glossOnly?: boolean;
}

const GLOSS_BATCH_SIZE = 500;
const MAX_CONSECUTIVE_ENGINE_FAILURES = 3;
/** Cap on stricter single-item retries so a bad run cannot spiral. */
const STRICT_RETRY_CAP = 300;

interface TranslationRef {
  base: string;
  lang: string;
}

function writeResolvedValue(
  candidate: MiningCandidate,
  ref: TranslationRef,
  value: string,
  source: 'dict' | 'qwen' | 'api',
): void {
  const key = `${ref.base}:${ref.lang}`;
  candidate.translations = { ...(candidate.translations ?? {}), [key]: value };
  candidate.fieldSources = { ...(candidate.fieldSources ?? {}), [key]: source };
  if (ref.base === 'translation') {
    candidate.translations.translation = value;
    candidate.translations[`translation:${ref.lang}`] = value;
    candidate.fieldSources.translation = source;
    candidate.fieldSources[`translation:${ref.lang}`] = source;
  }
  if (ref.base === 'meaning') {
    candidate.glosses = { ...(candidate.glosses ?? {}), [ref.lang]: value };
    candidate.fieldSources[`meaning:${ref.lang}`] = source;
  }
}

/**
 * Dictionary-first, Qwen-fallback enrichment for a batch of candidates.
 *
 * 1. Gloss phase: every language referenced anywhere in the templates is
 *    looked up in the offline dictionaries (cheap in-memory hits).
 * 2. Routing: slots covered by a gloss in the target language are resolved as
 *    dictionary values — no LLM job is created for them.
 * 3. Qwen phase: only the still-missing slots are translated, in chunks, with
 *    cancellation between chunks, script validation on every output, and one
 *    stricter retry for rejects. Failures become `missing`, never garbage.
 */
export async function runEnrichment(
  candidates: MiningCandidate[],
  config: TraditionalMiningConfig,
  io: EnrichmentIO,
  options?: EnrichmentOptions,
): Promise<EnrichmentOutcome> {
  const { front, back } = resolveTraditionalTemplates(config);
  const exp = config.export ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export;
  const targetLang = inferTranslationTargetLang(config, front, back);
  const needs = needsEnrichmentLookup(front, back, {
    translateSentences: exp.translateSentences,
    translationTargetLang: targetLang,
  });
  const warnings: string[] = [];
  const cancelled = (): boolean => io.shouldCancel?.() ?? false;

  const out = candidates.map((c) => ({ ...c }));

  // Drop cached values that fail current validation (old garbage from
  // previous runs must not survive into a fresh analysis).
  for (const candidate of out) {
    if (!candidate.translations) continue;
    for (const key of Object.keys(candidate.translations)) {
      const val = candidate.translations[key]?.trim();
      if (!val || !isUsableTemplateValue(key, val, candidate)) {
        delete candidate.translations[key];
        if (candidate.fieldSources) delete candidate.fieldSources[key];
      }
    }
    if (candidate.translations && !Object.keys(candidate.translations).length) {
      candidate.translations = undefined;
    }
  }

  // ----- Gloss phase -----------------------------------------------------------
  if (needs.glossLangs.length > 0) {
    const queries = out.map((c) => ({ expression: c.expression, reading: c.reading }));
    const total = queries.length;
    io.onProgress?.({ phase: 'gloss', done: 0, total, message: 'Resolving definitions…' });
    for (let i = 0; i < queries.length; i += GLOSS_BATCH_SIZE) {
      if (cancelled()) break;
      const slice = queries.slice(i, i + GLOSS_BATCH_SIZE);
      const glossMap = await io.lookupGlosses(slice, needs.glossLangs);
      for (let j = 0; j < slice.length; j++) {
        const candidate = out[i + j];
        const key = candidateLookupKey(candidate.expression, candidate.reading);
        const glosses = glossMap[key];
        if (!glosses) continue;
        const merged = { ...(candidate.glosses ?? {}) };
        for (const [lang, gloss] of Object.entries(glosses)) {
          if (gloss?.trim()) merged[lang] = gloss;
        }
        candidate.glosses = merged;
      }
      io.onProgress?.({
        phase: 'gloss',
        done: Math.min(i + slice.length, total),
        total,
        message: 'Resolving definitions…',
      });
    }
  }

  // ----- Translation phase (Qwen fail-switch) ------------------------------------
  const shouldTranslate =
    !options?.glossOnly &&
    exp.fillTranslations !== false &&
    (needs.translationRefs.length > 0 ||
      needs.needsBareTranslation ||
      needs.needsSentenceTranslation);

  if (shouldTranslate && !cancelled()) {
    const refs: TranslationRef[] = [...needs.translationRefs];
    if (needs.needsBareTranslation) refs.push({ base: 'translation', lang: targetLang });

    interface PendingSlot {
      ci: number;
      ref: TranslationRef;
      source: string;
      text: string;
      dedupeKey: string;
    }
    const pending: PendingSlot[] = [];
    const jobsByDedupe = new Map<string, TranslateJob>();

    for (let ci = 0; ci < out.length; ci++) {
      const candidate = out[ci];
      for (const ref of refs) {
        if (ref.base === 'sentence-translation' && !needs.needsSentenceTranslation) continue;
        const { source, text } = resolveTranslationSource(candidate, ref.base, ref.lang);
        if (!text.trim()) continue;
        const key = `${ref.base}:${ref.lang}`;
        const existing = candidate.translations?.[key]?.trim();
        if (existing && isValidCrossLangTranslation(source, ref.lang, text, existing)) continue;
        if (source === ref.lang) {
          // Dictionary already covers the target language — no LLM job.
          writeResolvedValue(candidate, ref, text, 'dict');
          continue;
        }
        const dedupeKey = `${text}\0${source}\0${ref.lang}`;
        if (!jobsByDedupe.has(dedupeKey)) {
          jobsByDedupe.set(dedupeKey, {
            id: `t${jobsByDedupe.size}`,
            text,
            source,
            target: ref.lang,
          });
        }
        pending.push({ ci, ref, source, text, dedupeKey });
      }
    }

    const jobList = [...jobsByDedupe.values()];
    const jobIdByDedupe = new Map<string, string>();
    for (const [dedupeKey, job] of jobsByDedupe) jobIdByDedupe.set(dedupeKey, job.id);

    if (jobList.length > 0 && io.translateAvailable && !io.translateAvailable()) {
      warnings.push(
        `Translation engine not available — ${pending.length} field value(s) left unfilled. ` +
          'Dictionary-served values are unaffected.',
      );
    } else if (jobList.length > 0) {
      const total = jobList.length;
      const preFill = computeFillReport(out, config);
      const dictFields = preFill.tokens.reduce((n, t) => n + t.dict, 0);
      const llmSource = io.translationSource ?? 'qwen';
      const emitTranslationProgress = (done: number, failed = 0): void => {
        io.onProgress?.({
          phase: 'translation',
          done,
          total,
          message: translationProgressMessage(dictFields, done, total, llmSource),
          health: {
            dictFields,
            translated: done,
            failed,
            pending: Math.max(0, total - done),
          },
        });
      };
      emitTranslationProgress(0);

      const resultByJobId = new Map<string, string>();
      let engineAborted = false;

      // The whole run is a single batch call, so "consecutive failures" means
      // consecutive attempts of that batch. Retry up to the cap, then abort
      // with a visible warning instead of silently feeding the strict-retry
      // pass to an engine that is clearly down.
      for (let attempt = 1; attempt <= MAX_CONSECUTIVE_ENGINE_FAILURES; attempt++) {
        if (cancelled()) break;
        try {
          const batchResult = await io.translateBatch(jobList, {
            onProgress: (done) => emitTranslationProgress(done),
          });
          for (const row of batchResult) resultByJobId.set(row.id, row.text);
          emitTranslationProgress(total);
          break;
        } catch {
          if (attempt >= MAX_CONSECUTIVE_ENGINE_FAILURES) {
            warnings.push(
              'The translation engine failed repeatedly — remaining fields were skipped. ' +
                'Dictionary-served values are unaffected.',
            );
            engineAborted = true;
          }
        }
      }

      // Stricter single-item retry for invalid/missing outputs.
      const retryByDedupe = new Map<string, TranslateJob>();
      if (!engineAborted && !cancelled()) {
        for (const slot of pending) {
          if (retryByDedupe.size >= STRICT_RETRY_CAP) break;
          if (retryByDedupe.has(slot.dedupeKey)) continue;
          const jobId = jobIdByDedupe.get(slot.dedupeKey);
          const raw = jobId ? resultByJobId.get(jobId)?.trim() : undefined;
          if (raw && isValidCrossLangTranslation(slot.source, slot.ref.lang, slot.text, raw)) {
            continue;
          }
          const job = jobsByDedupe.get(slot.dedupeKey);
          if (job) retryByDedupe.set(slot.dedupeKey, { ...job, strict: true });
        }
        const retryList = [...retryByDedupe.values()];
        if (retryList.length > 0) {
          try {
            const retryResult = await io.translateBatch(retryList);
            for (const row of retryResult) {
              if (row.text?.trim()) resultByJobId.set(row.id, row.text);
            }
          } catch {
            /* best-effort strict retry */
          }
        }
      }

      // Final assignment — only validated values are written; the rest stay
      // missing and are surfaced through the fill report.
      let missing = 0;
      for (const slot of pending) {
        const candidate = out[slot.ci];
        const key = `${slot.ref.base}:${slot.ref.lang}`;
        const existing = candidate.translations?.[key]?.trim();
        if (existing && isValidCrossLangTranslation(slot.source, slot.ref.lang, slot.text, existing)) {
          continue;
        }
        const jobId = jobIdByDedupe.get(slot.dedupeKey);
        const translated = jobId ? resultByJobId.get(jobId)?.trim() : undefined;
        if (
          !translated ||
          !isValidCrossLangTranslation(slot.source, slot.ref.lang, slot.text, translated)
        ) {
          missing += 1;
          continue;
        }
        writeResolvedValue(candidate, slot.ref, translated, llmSource);
      }
      emitTranslationProgress(total, missing);
      if (missing > 0 && !cancelled() && !engineAborted) {
        warnings.push(
          `${missing} field value(s) could not be translated reliably and were left empty ` +
            '(see the fill report before download).',
        );
      }
    }
  }

  return { candidates: out, warnings, cancelled: cancelled() };
}

// ----- Value provenance ---------------------------------------------------------

export interface FieldValuesWithSources {
  values: MiningValues;
  sources: Record<string, ValueSource>;
}

function sourceForKey(key: string, candidate: MiningCandidate, value: string): ValueSource {
  if (!value.trim()) return 'missing';
  const fs = candidate.fieldSources?.[key];
  if (fs === 'api') return 'api';
  if (fs === 'qwen') return 'qwen';
  if (fs === 'dict') return 'dict';
  if (key === 'meaning' || key === 'meaning-ja' || key.startsWith('meaning:')) {
    const lang = key === 'meaning' ? 'en' : key === 'meaning-ja' ? 'ja' : key.slice('meaning:'.length);
    if (candidate.fieldSources?.[`meaning:${lang}`] === 'api') return 'api';
    if (candidate.fieldSources?.[`meaning:${lang}`] === 'qwen') return 'qwen';
    if (candidate.glosses?.[lang]?.trim()) return 'dict';
    return candidate.translations?.[`meaning:${lang}`]?.trim()
      ? (candidate.fieldSources?.[`meaning:${lang}`] ?? 'qwen')
      : 'dict';
  }
  if (key.endsWith(':ja') || !key.includes(':')) {
    // translation (bare) may derive from a gloss.
    if (key === 'translation') {
      return candidate.translations?.translation?.trim()
        ? (candidate.fieldSources?.translation ?? 'qwen')
        : 'dict';
    }
    return 'mined';
  }
  const lang = key.split(':').pop() ?? '';
  if (key.startsWith('expression:')) {
    // Filled from a gloss when there is no explicit translation for the slot.
    if (!candidate.translations?.[key]?.trim() && candidate.glosses?.[lang]?.trim()) return 'dict';
    return candidate.translations?.[key]?.trim()
      ? (candidate.fieldSources?.[key] ?? 'qwen')
      : 'dict';
  }
  if (key.startsWith('translation:')) {
    return candidate.translations?.[key]?.trim()
      ? (candidate.fieldSources?.[key] ?? 'qwen')
      : 'dict';
  }
  return candidate.translations?.[key]?.trim() ? 'qwen' : 'mined';
}

/** Values plus per-token provenance for previews, FS markers, and the report. */
export function buildFieldValuesWithSources(
  candidate: MiningCandidate,
  config: TraditionalMiningConfig,
): FieldValuesWithSources {
  const values = buildEpubMiningValues(candidate, config);
  const sources: Record<string, ValueSource> = {};
  for (const key of Object.keys(values)) {
    sources[key] = sourceForKey(key, candidate, values[key] ?? '');
  }
  return { values, sources };
}

/** Copy of `values` with the FS marker appended to Qwen fail-switch values. */
export function decorateFsValues(
  values: MiningValues,
  sources: Record<string, ValueSource>,
  marker = FS_MARKER,
): MiningValues {
  const out: MiningValues = { ...values };
  for (const [key, source] of Object.entries(sources)) {
    const v = out[key];
    if ((source === 'qwen' || source === 'api') && v?.trim()) out[key] = `${v}${marker}`;
  }
  return out;
}

// ----- Fill report --------------------------------------------------------------

export interface FillReportToken {
  token: string;
  dict: number;
  qwen: number;
  api: number;
  mined: number;
  missing: number;
  total: number;
}

export interface FillReport {
  tokens: FillReportToken[];
  totalCards: number;
  incompleteCount: number;
}

/** Tokens from the active templates that the EPUB pipeline is expected to fill. */
export function reportableTemplateTokens(config: TraditionalMiningConfig): string[] {
  const { front, back } = resolveTraditionalTemplates(config);
  return extractTemplateTokens(front, back).filter(
    (t) =>
      !NEVER_FILLED_TOKENS.has(t) &&
      !(t.startsWith('reading:') && !t.endsWith(':ja')) &&
      !t.startsWith('cloze-'),
  );
}

export function candidateIsComplete(
  candidate: MiningCandidate,
  config: TraditionalMiningConfig,
  tokens?: string[],
): boolean {
  const toks = tokens ?? reportableTemplateTokens(config);
  const values = buildEpubMiningValues(candidate, config);
  return toks.every((token) => Boolean(values[token]?.trim()));
}

function translationProgressMessage(
  dictFields: number,
  done: number,
  total: number,
  engine: 'qwen' | 'api' = 'qwen',
): string {
  const label = engine === 'api' ? 'API' : 'Qwen';
  if (dictFields > 0) {
    return `Dictionary covers ${dictFields} fields · ${label} ${done}/${total}…`;
  }
  return `${label} translating ${done}/${total}…`;
}

/** Per-token fill statistics across the deck — the pre-download verification. */
export function computeFillReport(
  candidates: MiningCandidate[],
  config: TraditionalMiningConfig,
): FillReport {
  const tokens = reportableTemplateTokens(config);
  const rows = new Map<string, FillReportToken>(
    tokens.map((t) => [t, { token: t, dict: 0, qwen: 0, api: 0, mined: 0, missing: 0, total: 0 }]),
  );
  let incompleteCount = 0;
  for (const candidate of candidates) {
    const { values, sources } = buildFieldValuesWithSources(candidate, config);
    let incomplete = false;
    for (const token of tokens) {
      const row = rows.get(token);
      if (!row) continue;
      row.total += 1;
      const source = values[token]?.trim() ? sources[token] ?? 'mined' : 'missing';
      if (source === 'missing') {
        row.missing += 1;
        incomplete = true;
      } else if (source === 'dict') {
        row.dict += 1;
      } else if (source === 'api') {
        row.api += 1;
      } else if (source === 'qwen') {
        row.qwen += 1;
      } else {
        row.mined += 1;
      }
    }
    if (incomplete) incompleteCount += 1;
  }
  return { tokens: [...rows.values()], totalCards: candidates.length, incompleteCount };
}

// ----- Dictionary popup helpers (Anki section) ------------------------------------

/**
 * Best gloss in `lang` across all matched dictionary entries. Entries whose
 * source dictionary declares the language win (this is what separates German
 * from English — both Latin script); script matching is the fallback.
 */
export function glossForLangFromEntries(
  entries: DictEntry[],
  lang: string,
  expression?: string,
): string {
  const pool = expression
    ? entries.filter((e) => e.word === expression).concat(entries.filter((e) => e.word !== expression))
    : entries;
  const declared = pool.filter((e) => e.sourceLangs?.includes(lang));
  for (const entry of declared) {
    const gloss = glossFromEntry(entry, lang);
    if (gloss) return gloss;
  }
  for (const entry of pool) {
    if (entry.sourceLangs?.length && !entry.sourceLangs.includes(lang)) continue;
    const gloss = glossFromEntry(entry, lang);
    if (gloss && textMatchesLang(lang, gloss)) return gloss;
  }
  return '';
}
