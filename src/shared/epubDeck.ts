import { renderFieldTemplate, type MiningValues } from './anki';
import type { DictEntry, DictResult } from './types';
import type {
  EpubCardLayoutPreset,
  EpubCardSideField,
  EpubDeckExport,
  EpubMiningAnalysis,
  MiningCandidate,
  TraditionalMiningConfig,
} from './mining';
import { DEFAULT_TRADITIONAL_MINING_CONFIG } from './mining';
import {
  buildEpubMiningValues,
  candidateLookupKey as miningCandidateKey,
  collapseEmptySegments,
  isNameExcluded,
  normalizeEpubTemplateSeparators,
  resolveTraditionalTemplates,
} from './epubEnrichment';
import {
  buildFieldValuesWithSources,
  candidateIsComplete,
  decorateFsValues,
  reportableTemplateTokens,
} from './fieldRouter';

export const EPUB_CARD_SIDE_OPTIONS: ReadonlyArray<{ id: EpubCardSideField; label: string }> = [
  { id: 'expression', label: 'Japanese (term)' },
  { id: 'reading', label: 'Japanese (reading)' },
  { id: 'expression-reading', label: 'Japanese (term + reading)' },
  { id: 'definition-en', label: 'English (definition)' },
  { id: 'definition-ja', label: 'Japanese (definition)' },
  { id: 'sentence', label: 'Example sentence' },
  { id: 'frequency', label: 'Frequency rank' },
  { id: 'blank', label: '(empty)' },
];

export const EPUB_CARD_LAYOUT_PRESETS: ReadonlyArray<{
  id: Exclude<EpubCardLayoutPreset, 'custom'>;
  label: string;
  front: string;
  back: string;
}> = [
  {
    id: 'ja-en',
    label: 'Japanese front / English back',
    front: '{expression:ja}\n{reading:ja}',
    back: '{meaning:en}',
  },
  {
    id: 'en-ja',
    label: 'English front / Japanese back',
    front: '{meaning:en}',
    back: '{expression:ja}\n{reading:ja}',
  },
  {
    id: 'expression-reading',
    label: 'Expression / Reading',
    front: '{expression:ja}',
    back: '{reading:ja}',
  },
  {
    id: 'reading-expression',
    label: 'Reading / Expression',
    front: '{reading:ja}',
    back: '{expression:ja}',
  },
  {
    id: 'ja-sentence',
    label: 'Japanese term / Context sentence',
    front: '{expression:ja}\n{reading:ja}',
    back: '{sentence:ja}',
  },
];

export function legacySideFieldToTemplate(field: EpubCardSideField): string {
  switch (field) {
    case 'expression':
      return '{expression:ja}';
    case 'reading':
      return '{reading:ja}';
    case 'expression-reading':
      return '{expression:ja}\n{reading:ja}';
    case 'definition-en':
      return '{meaning:en}';
    case 'definition-ja':
      return '{meaning:ja}';
    case 'sentence':
      return '{sentence:ja}';
    case 'frequency':
      return '{frequency}';
    case 'blank':
    default:
      return '';
  }
}

export function migrateEpubCardTemplates(traditional: TraditionalMiningConfig): TraditionalMiningConfig {
  const { front, back } = traditional.templates;
  const oldDefaultFront = '{expression}\n{reading}';
  const oldDefaultBack = '{meaning}\n\n{sentence}\n{frequency}';
  const usesLegacyDefaults = front === oldDefaultFront && back === oldDefaultBack;
  const usesLegacyTokens = /\{expression\}(?!:)/.test(front + back) || /\{meaning\}(?!:)/.test(front + back);
  if (!usesLegacyDefaults && !usesLegacyTokens) return traditional;
  const exp = traditional.export ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export;
  return {
    ...traditional,
    templates: {
      ...traditional.templates,
      front: legacySideFieldToTemplate(exp.frontContent ?? 'expression-reading'),
      back: legacySideFieldToTemplate(exp.backContent ?? 'definition-en'),
      resetToAutomatic: false,
    },
  };
}

export function applyEpubCardLayoutPreset(
  preset: EpubCardLayoutPreset,
): Pick<TraditionalMiningConfig['export'], 'cardLayoutPreset'> & { front: string; back: string } | null {
  if (preset === 'custom') return null;
  const match = EPUB_CARD_LAYOUT_PRESETS.find((p) => p.id === preset);
  if (!match) return null;
  return {
    cardLayoutPreset: preset,
    front: match.front,
    back: match.back,
  };
}

export interface CandidateMeanings {
  meaningEn: string;
  meaningJa: string;
}

function csvEscape(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return `"${normalized.replace(/"/g, '""')}"`;
}

export interface DeckCsvOptions {
  delimiter?: ',' | ';' | 'tab';
  header?: boolean;
}

export function deckRowsToCsv(
  rows: { expression: string; front: string; back: string }[],
  options?: DeckCsvOptions,
): string {
  const delimiter = options?.delimiter === 'tab' ? '\t' : options?.delimiter ?? ',';
  const includeHeader = options?.header !== false;
  const body = rows.map((row) => [row.expression, row.front, row.back]);
  const lines = includeHeader ? [['Expression', 'Front', 'Back'], ...body] : body;
  return lines.map((line) => line.map(csvEscape).join(delimiter)).join('\r\n');
}

export function isKanaOnlyExpression(expression: string): boolean {
  return !/[\u4e00-\u9fff\u3400-\u4dbf]/.test(expression);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function pickDictEntry(
  entries: DictEntry[],
  expression: string,
  reading?: string,
): DictEntry | undefined {
  if (!entries.length) return undefined;
  const norm = (s: string) => s.trim();
  const exact = entries.find(
    (e) => norm(e.word) === norm(expression) && (!reading || !norm(reading) || norm(e.reading) === norm(reading)),
  );
  if (exact) return exact;
  const wordMatch = entries.find((e) => norm(e.word) === norm(expression));
  if (wordMatch) return wordMatch;
  return entries[0];
}

export function glossFromEntry(entry: DictEntry, lang: 'en' | 'ja' | 'any' = 'en'): string {
  if (entry.glossaryHtml) {
    const plain = stripHtml(entry.glossaryHtml);
    if (plain) return plain;
  }
  const defs = entry.senses.flatMap((s) => s.definitions).filter(Boolean);
  if (!defs.length) return '';
  if (lang === 'ja') {
    const ja = defs.filter((d) => /[\u3040-\u30ff\u4e00-\u9fff]/.test(d));
    return (ja.length ? ja : defs).slice(0, 3).join(' / ');
  }
  return defs.slice(0, 3).join(' / ');
}

export function candidateLookupKey(candidate: MiningCandidate): string {
  return miningCandidateKey(candidate.expression, candidate.reading);
}

export function needsDictionaryLookup(frontTemplate: string, backTemplate: string): boolean {
  const combined = `${frontTemplate}\n${backTemplate}`;
  return /\{\s*meaning(?::\s*[a-z]{2})?\s*\}/i.test(combined);
}

export function resolveCardSideField(field: EpubCardSideField, values: MiningValues): string {
  switch (field) {
    case 'expression':
      return values.expression ?? '';
    case 'reading':
      return values.reading ?? '';
    case 'expression-reading': {
      const exp = values.expression ?? '';
      const read = values.reading ?? '';
      if (read && read !== exp) return `${exp}\n${read}`;
      return exp;
    }
    case 'definition-en':
      return values.meaning ?? '';
    case 'definition-ja':
      return values['meaning-ja'] ?? '';
    case 'sentence':
      return values.sentence ?? '';
    case 'frequency':
      return values.frequency ?? '';
    case 'blank':
      return '';
    default:
      return '';
  }
}

export async function lookupMeaningsForCandidates(
  candidates: MiningCandidate[],
  lookup: (query: string) => Promise<DictResult>,
  options?: { concurrency?: number; onProgress?: (done: number, total: number) => void },
): Promise<Map<string, CandidateMeanings>> {
  const map = new Map<string, CandidateMeanings>();
  const unique = new Map<string, MiningCandidate>();
  for (const c of candidates) {
    unique.set(candidateLookupKey(c), c);
  }
  const list = [...unique.entries()];
  if (!list.length) return map;

  const concurrency = Math.max(1, options?.concurrency ?? 6);
  let ptr = 0;
  let done = 0;

  async function processOne(key: string, candidate: MiningCandidate): Promise<void> {
    const query = candidate.expression.trim() || (candidate.reading ?? '').trim();
    if (!query) {
      map.set(key, { meaningEn: '', meaningJa: '' });
      return;
    }
    try {
      const result = await lookup(query);
      const entry = pickDictEntry(result.entries, candidate.expression, candidate.reading);
      map.set(key, {
        meaningEn: entry ? glossFromEntry(entry, 'en') : '',
        meaningJa: entry ? glossFromEntry(entry, 'ja') : '',
      });
    } catch {
      map.set(key, { meaningEn: '', meaningJa: '' });
    }
  }

  async function worker(): Promise<void> {
    while (ptr < list.length) {
      const i = ptr++;
      const [key, candidate] = list[i];
      await processOne(key, candidate);
      done += 1;
      options?.onProgress?.(done, list.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, () => worker()));
  return map;
}

export interface EpubFilterPipelineStep {
  id: string;
  label: string;
  count: number;
  detail?: string;
}

export interface EpubFilterPipelineBreakdown {
  /** Terms returned by analyze (already passed analyze-time junk + minFrequency). */
  mined: number;
  steps: EpubFilterPipelineStep[];
  final: number;
}

function applyNameExclusionFilter(
  list: MiningCandidate[],
  excludeNames: NonNullable<TraditionalMiningConfig['export']['excludeNames']>,
): MiningCandidate[] {
  if (
    !excludeNames.japanese &&
    !excludeNames.chinese &&
    !excludeNames.russian &&
    !excludeNames.places
  ) {
    return list;
  }
  return list.filter((c) => !isNameExcluded(c, excludeNames));
}

/**
 * Apply Download Deck filters. freqRangeMin/Max are inclusive rank indices when
 * filterBy is term-frequency (EPUB occurrence sort). freqRangeMax of 0 means no
 * upper cap. When filterBy is deck-frequency, range filters dictionary rank values.
 *
 * Manual strategy stacks filters in order:
 * 1. exclude kana-only
 * 2. book occurrences >= limits.minFrequency
 * 3. dictionary-rank range OR book rank window
 * 4. maxCommonRank (term-frequency mode only — skipped for dictionary-rank mode)
 * 5. name exclusions
 */
export function filterEpubCandidates(
  candidates: MiningCandidate[],
  config: TraditionalMiningConfig,
): MiningCandidate[] {
  const exp = config.export ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export;
  let list = [...candidates];

  if (exp.excludeKanaOnly) {
    list = list.filter((c) => !isKanaOnlyExpression(c.expression));
  }

  if (exp.strategy === 'occurrences') {
    const threshold = Math.max(1, Math.round(exp.occurrenceThreshold ?? 2));
    const op = exp.occurrenceFilterOp ?? 'gte';
    list = list.filter((c) => {
      if (op === 'gte') return c.count >= threshold;
      if (op === 'lte') return c.count <= threshold;
      return c.count === threshold;
    });
    if (exp.sortBy === 'alphabetical') {
      list.sort((a, b) => a.expression.localeCompare(b.expression, 'ja'));
    } else {
      list.sort((a, b) => b.count - a.count);
    }
  } else {
    list = list.filter((c) => c.count >= config.limits.minFrequency);

    const useDictionaryRank = exp.filterBy === 'deck-frequency';

    if (exp.sortBy === 'alphabetical') {
      list.sort((a, b) => a.expression.localeCompare(b.expression, 'ja'));
    } else if (useDictionaryRank) {
      list.sort((a, b) => {
        const ar = a.frequencies.primary;
        const br = b.frequencies.primary;
        if (ar != null && br != null) return ar - br;
        if (ar != null) return -1;
        if (br != null) return 1;
        return b.count - a.count;
      });
    } else {
      list.sort((a, b) => b.count - a.count);
    }

    const rangeMin = Math.max(0, Math.round(exp.freqRangeMin));
    const rangeMax = Math.max(0, Math.round(exp.freqRangeMax));

    if (useDictionaryRank) {
      list = list.filter((c) => {
        const rank = c.frequencies.primary;
        if (rank == null) return false;
        if (rangeMin > 0 && rank < rangeMin) return false;
        if (rangeMax > 0 && rank > rangeMax) return false;
        return true;
      });
    } else {
      const start = Math.min(rangeMin, list.length);
      const endExclusive =
        rangeMax > 0 ? Math.min(rangeMax + 1, list.length) : list.length;
      list = list.slice(start, endExclusive);
    }
  }

  // When filtering by explicit dictionary-rank range, do not stack an additional
  // hidden common-rank cutoff on top. That makes UI ranges like "500 -> 0"
  // behave inconsistently between what the user entered and what gets exported.
  if (config.limits.maxCommonRank > 0 && exp.filterBy !== 'deck-frequency') {
    list = list.filter(
      (c) =>
        c.frequencies.primary == null || c.frequencies.primary > config.limits.maxCommonRank,
    );
  }

  const excludeNames = exp.excludeNames ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export.excludeNames;
  list = applyNameExclusionFilter(list, excludeNames);

  return list;
}

/** Step-by-step export filter counts for Advanced/Simple parity checks. */
export function describeEpubFilterPipeline(
  candidates: MiningCandidate[],
  config: TraditionalMiningConfig,
): EpubFilterPipelineBreakdown {
  const exp = config.export ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export;
  const mined = candidates.length;
  const steps: EpubFilterPipelineStep[] = [];
  let list = [...candidates];
  const minFrequency = Math.max(1, config.limits.minFrequency);

  if (exp.excludeKanaOnly) {
    list = list.filter((c) => !isKanaOnlyExpression(c.expression));
    steps.push({
      id: 'kana-only',
      label: 'After kana-only exclusion',
      count: list.length,
    });
  }

  if (exp.strategy === 'occurrences') {
    const threshold = Math.max(1, Math.round(exp.occurrenceThreshold ?? 2));
    const op = exp.occurrenceFilterOp ?? 'gte';
    list = list.filter((c) => {
      if (op === 'gte') return c.count >= threshold;
      if (op === 'lte') return c.count <= threshold;
      return c.count === threshold;
    });
    steps.push({
      id: 'occurrences',
      label: `After occurrence filter (${op} ${threshold})`,
      count: list.length,
    });
  } else {
    list = list.filter((c) => c.count >= minFrequency);
    steps.push({
      id: 'book-frequency',
      label: `After book occurrences (≥ ${minFrequency})`,
      count: list.length,
      detail: 'Applied during analyze and again here so export matches the visible floor.',
    });

    const useDictionaryRank = exp.filterBy === 'deck-frequency';
    const rangeMin = Math.max(0, Math.round(exp.freqRangeMin));
    const rangeMax = Math.max(0, Math.round(exp.freqRangeMax));

    if (useDictionaryRank) {
      list = list.filter((c) => {
        const rank = c.frequencies.primary;
        if (rank == null) return false;
        if (rangeMin > 0 && rank < rangeMin) return false;
        if (rangeMax > 0 && rank > rangeMax) return false;
        return true;
      });
      const rangeLabel =
        rangeMax > 0 ? `rank ${rangeMin}–${rangeMax}` : `rank ≥ ${rangeMin} (no upper cap)`;
      steps.push({
        id: 'dictionary-rank',
        label: `After dictionary-rank filter (${rangeLabel})`,
        count: list.length,
      });
    } else {
      if (exp.sortBy === 'alphabetical') {
        list.sort((a, b) => a.expression.localeCompare(b.expression, 'ja'));
      } else {
        list.sort((a, b) => b.count - a.count);
      }
      const start = Math.min(rangeMin, list.length);
      const endExclusive =
        rangeMax > 0 ? Math.min(rangeMax + 1, list.length) : list.length;
      list = list.slice(start, endExclusive);
      steps.push({
        id: 'book-rank-window',
        label: `After book rank window (${rangeMin}–${rangeMax > 0 ? rangeMax : 'end'})`,
        count: list.length,
      });
    }

    if (config.limits.maxCommonRank > 0) {
      if (exp.filterBy === 'deck-frequency') {
        steps.push({
          id: 'max-common-rank',
          label: 'Max common-rank cutoff',
          count: list.length,
          detail: 'Not applied in Dictionary rank mode.',
        });
      } else {
        const before = list.length;
        list = list.filter(
          (c) =>
            c.frequencies.primary == null ||
            c.frequencies.primary > config.limits.maxCommonRank,
        );
        steps.push({
          id: 'max-common-rank',
          label: `After max common-rank cutoff (> ${config.limits.maxCommonRank})`,
          count: list.length,
          detail: before === list.length ? 'No change.' : undefined,
        });
      }
    }
  }

  const excludeNames = exp.excludeNames ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export.excludeNames;
  const beforeNames = list.length;
  list = applyNameExclusionFilter(list, excludeNames);
  if (
    excludeNames.japanese ||
    excludeNames.chinese ||
    excludeNames.russian ||
    excludeNames.places
  ) {
    steps.push({
      id: 'name-exclusions',
      label: 'After name exclusions',
      count: list.length,
      detail: beforeNames === list.length ? 'No change.' : undefined,
    });
  }

  return { mined, steps, final: list.length };
}

export function candidateMiningValues(
  candidate: MiningCandidate,
  config: TraditionalMiningConfig,
  meanings?: CandidateMeanings,
): MiningValues {
  if (candidate.glosses || candidate.translations) {
    return buildEpubMiningValues(candidate, config);
  }
  const sentence = candidate.sampleSentence;
  const expression = candidate.expression;
  const reading = candidate.reading ?? '';
  const meaningEn = meanings?.meaningEn ?? '';
  const meaningJa = meanings?.meaningJa ?? '';

  const values: MiningValues = {
    expression,
    reading,
    sentence,
    meaning: meaningEn,
    'meaning-ja': meaningJa,
    'expression:ja': expression,
    'reading:ja': reading,
    'sentence:ja': sentence,
    'meaning:en': meaningEn,
    'meaning:ja': meaningJa,
  };
  for (const [name, rank] of Object.entries(candidate.frequencies.byDictionary)) {
    values[`frequency:${name}`] = String(rank);
  }
  if (candidate.frequencies.primary != null) {
    values.frequency = String(candidate.frequencies.primary);
  } else {
    values.frequency = String(candidate.count);
  }
  return values;
}

function candidatesToRows(
  candidates: MiningCandidate[],
  traditional: TraditionalMiningConfig,
  profileFieldTemplates?: Record<string, string>,
): EpubDeckExport['rows'] {
  const exp = traditional.export ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export;
  const separator = exp.tokenSeparator || '\n';
  const useProfile = exp.useProfileFieldMapping && profileFieldTemplates;
  const fieldNames = useProfile ? Object.keys(profileFieldTemplates) : [];
  const frontField = fieldNames[0];
  const backField = fieldNames[1];

  const { front: frontTpl, back: backTpl } = resolveTraditionalTemplates(traditional);
  const frontNorm = normalizeEpubTemplateSeparators(frontTpl, separator);
  const backNorm = normalizeEpubTemplateSeparators(backTpl, separator);

  const renderSide = (template: string, values: import('./anki').MiningValues): string =>
    collapseEmptySegments(renderFieldTemplate(template, values), separator);

  return candidates.map((candidate) => {
    let values: import('./anki').MiningValues;
    if (candidate.glosses || candidate.translations) {
      const withSources = buildFieldValuesWithSources(candidate, traditional);
      values =
        exp.fsMarker !== false
          ? decorateFsValues(withSources.values, withSources.sources)
          : withSources.values;
    } else {
      values = candidateMiningValues(candidate, traditional);
    }
    const front =
      useProfile && frontField && profileFieldTemplates[frontField]?.trim()
        ? renderSide(normalizeEpubTemplateSeparators(profileFieldTemplates[frontField], separator), values)
        : renderSide(frontNorm, values);
    const back =
      useProfile && backField && profileFieldTemplates[backField]?.trim()
        ? renderSide(normalizeEpubTemplateSeparators(profileFieldTemplates[backField], separator), values)
        : renderSide(backNorm, values);
    return {
      expression: candidate.expression,
      reading: candidate.reading ?? '',
      sentence: candidate.sampleSentence,
      front,
      back,
    };
  });
}

function finalizeDeckExport(
  analysis: EpubMiningAnalysis,
  candidates: MiningCandidate[],
  traditional: TraditionalMiningConfig,
  profileFieldTemplates?: Record<string, string>,
): EpubDeckExport {
  const exp = traditional.export ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export;
  let list = candidates;
  if (exp.excludeIncomplete) {
    const tokens = reportableTemplateTokens(traditional);
    list = list.filter((c) => candidateIsComplete(c, traditional, tokens));
  }
  const rows = candidatesToRows(list, traditional, profileFieldTemplates);
  return {
    title: analysis.title,
    itemId: analysis.itemId,
    cardCount: rows.length,
    rows,
    csv: deckRowsToCsv(rows, { delimiter: exp.csvDelimiter, header: exp.csvHeader }),
  };
}

export function buildEpubDeckExport(
  analysis: EpubMiningAnalysis,
  traditional: TraditionalMiningConfig,
  profileFieldTemplates?: Record<string, string>,
  options?: { skipFilter?: boolean },
): EpubDeckExport {
  const candidates = options?.skipFilter
    ? analysis.candidates
    : filterEpubCandidates(analysis.candidates, traditional);
  return finalizeDeckExport(analysis, candidates, traditional, profileFieldTemplates);
}

/** Async variant — uses glosses/translations attached at analyze time. */
export async function buildEpubDeckExportAsync(
  analysis: EpubMiningAnalysis,
  traditional: TraditionalMiningConfig,
  profileFieldTemplates?: Record<string, string>,
  options?: { skipFilter?: boolean },
): Promise<EpubDeckExport> {
  const candidates = options?.skipFilter
    ? analysis.candidates
    : filterEpubCandidates(analysis.candidates, traditional);
  return finalizeDeckExport(analysis, candidates, traditional, profileFieldTemplates);
}

export function exportDeckFileContent(
  deck: EpubDeckExport,
  format: TraditionalMiningConfig['export']['format'],
): { content: string; ext: string } {
  switch (format) {
    case 'txt':
      return { content: deck.rows.map((r) => r.expression).join('\n'), ext: 'txt' };
    case 'txt-rep':
      return {
        content: deck.rows.map((r) => `${r.expression}\t${r.reading}\t${r.sentence}`).join('\n'),
        ext: 'txt',
      };
    case 'yomitan':
      return {
        content: JSON.stringify(
          Object.fromEntries(
            deck.rows.map((r) => [r.expression, { reading: r.reading, sentence: r.sentence }]),
          ),
          null,
          2,
        ),
        ext: 'json',
      };
    case 'anki':
    case 'csv':
    default:
      return { content: deck.csv, ext: 'csv' };
  }
}
