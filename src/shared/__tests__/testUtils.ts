// Shared fixtures for the routing/enrichment test suite: a fake in-memory
// dictionary, a scriptable fake Qwen translator, and candidate/config builders.

import type {
  EpubExportOptions,
  MiningCandidate,
  TraditionalMiningConfig,
} from '../mining';
import {
  DEFAULT_EPUB_EXPORT_OPTIONS,
  DEFAULT_TRADITIONAL_MINING_CONFIG,
} from '../mining';
import { candidateLookupKey } from '../epubEnrichment';
import type { EnrichmentIO, TranslateJob } from '../fieldRouter';

export function makeCandidate(over: Partial<MiningCandidate> = {}): MiningCandidate {
  return {
    expression: '人間',
    reading: 'にんげん',
    count: 3,
    sampleSentence: '人間は考える葦である。',
    frequencies: { byDictionary: {} },
    ...over,
  };
}

export function makeConfig(
  front: string,
  back: string,
  exp: Partial<EpubExportOptions> = {},
): TraditionalMiningConfig {
  return {
    ...DEFAULT_TRADITIONAL_MINING_CONFIG,
    templates: { front, back, resetToAutomatic: false },
    export: { ...DEFAULT_EPUB_EXPORT_OPTIONS, ...exp },
  };
}

/** expression → lang → gloss. */
export type FakeDict = Record<string, Record<string, string>>;

export interface FakeIoState {
  glossLookups: number;
  translateCalls: number;
  jobs: TranslateJob[];
}

export interface FakeIoOptions {
  /** Return a translation for a job; undefined = item absent from the batch. */
  translator?: (job: TranslateJob) => string | undefined;
  /** Throw on every translateBatch call (engine down). */
  translateThrows?: boolean;
  translateAvailable?: boolean;
  shouldCancel?: () => boolean;
}

/** Sensible default fake Qwen: fixed outputs per target language. */
export function defaultTranslator(job: TranslateJob): string | undefined {
  const byLang: Record<string, string> = {
    en: 'human being',
    ru: 'человек',
    zh: '人类',
    de: 'Mensch',
    fr: 'humain',
  };
  return byLang[job.target];
}

export function makeFakeIO(
  dict: FakeDict,
  options: FakeIoOptions = {},
): { io: EnrichmentIO; state: FakeIoState } {
  const state: FakeIoState = { glossLookups: 0, translateCalls: 0, jobs: [] };
  const io: EnrichmentIO = {
    async lookupGlosses(queries, langs) {
      state.glossLookups += 1;
      const out: Record<string, Record<string, string | undefined>> = {};
      for (const q of queries) {
        const entry = dict[q.expression];
        if (!entry) continue;
        const glosses: Record<string, string | undefined> = {};
        for (const lang of langs) {
          if (entry[lang]) glosses[lang] = entry[lang];
        }
        if (Object.keys(glosses).length) {
          out[candidateLookupKey(q.expression, q.reading)] = glosses;
        }
      }
      return out;
    },
    async translateBatch(items) {
      state.translateCalls += 1;
      state.jobs.push(...items);
      if (options.translateThrows) throw new Error('engine down');
      const translator = options.translator ?? defaultTranslator;
      const rows: Array<{ id: string; text: string }> = [];
      for (const item of items) {
        const text = translator(item);
        if (text !== undefined) rows.push({ id: item.id, text });
      }
      return rows;
    },
    translateAvailable: () => options.translateAvailable ?? true,
    shouldCancel: options.shouldCancel,
  };
  return { io, state };
}
