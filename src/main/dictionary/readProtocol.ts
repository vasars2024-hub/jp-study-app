// The dictionary read worker's contract, and the one dispatch table both ends share.
//
// ## Why a read ever leaves the main process
//
// `better-sqlite3` is synchronous by construction, so every read in `dictService.ts`
// holds Electron's main loop for exactly as long as SQLite takes — and on a warm
// page cache that is tens of milliseconds, which `L7_PERF_DICTIONARY.md` banks as
// passing. The number that does not pass is the cold one. `dict.db` is ~540 MB and
// mapped with `mmap_size`, so a page the OS has evicted is a page fault taken
// *inside* the synchronous call: measured live on 2026-09-01 with 1.2 GB of RAM
// free, the first search after an eviction held main for 11.5 s and a single
// `dict:frequency` for 6.8 s, while the same calls warm took 45–130 ms. `warmup.ts`
// pays that cost once per boot, and memory pressure takes it straight back.
//
// A separate process takes the faults instead. The main process sends a query and
// keeps answering IPC, drags and paints while the worker waits on the disk; the
// answer is late rather than the whole app being frozen. That is the invariant
// CLAUDE.md states under Performance, and it is the only thing this file is for.
//
// ## What crosses the boundary
//
// Exactly the query objects `dictService.ts` already takes and the JSON-shaped
// results it already returns — nothing here is a new type. The main process
// validates the renderer's input before it gets here, so the worker trusts the
// `kind`/`query` pair and the dispatch below is a switch, not a parser.
//
// Reads only. `findLexiconCollocations` writes (see `service.ts`), the batch
// frequency read returns a `Map`, and the interlinear read carries a synchronous
// legacy-store callback; all three stay on the main process on purpose.

import type { SqliteDb } from './db';
import {
  findExampleSentences,
  findLexiconCompounds,
  findLexiconEtymology,
  findLexiconFrequency,
  findLexiconXrefs,
  findSemanticNeighbors,
  lookup,
  type CompoundQuery,
  type EtymologyQuery,
  type ExampleQuery,
  type FrequencyQuery,
  type LookupQuery,
  type LookupResult,
  type NeighborQuery,
  type XrefQuery,
} from './dictService';
import type { LexiconCompoundResult } from '../../shared/lexiconCompounds';
import type { LexiconEtymologyResult } from '../../shared/lexiconEtymology';
import type { LexiconExampleResult } from '../../shared/lexiconExamples';
import type { LexiconFrequencyResult } from '../../shared/lexiconFrequency';
import type { LexiconNeighborResult } from '../../shared/lexiconNeighbors';
import type { LexiconXrefResult } from '../../shared/lexiconXrefs';

export interface DictionaryReadQueries {
  lookup: LookupQuery;
  neighbors: NeighborQuery;
  compounds: CompoundQuery;
  examples: ExampleQuery;
  etymology: EtymologyQuery;
  frequency: FrequencyQuery;
  xrefs: XrefQuery;
}

export interface DictionaryReadResults {
  lookup: LookupResult;
  neighbors: LexiconNeighborResult;
  compounds: LexiconCompoundResult;
  examples: LexiconExampleResult;
  etymology: LexiconEtymologyResult;
  frequency: LexiconFrequencyResult;
  xrefs: LexiconXrefResult;
}

export type DictionaryReadKind = keyof DictionaryReadQueries;

/** Main -> worker. `dbDir` travels with every read because the worker has no `app`. */
export interface DictionaryReadRequest {
  type: 'read';
  id: number;
  dbDir: string;
  kind: DictionaryReadKind;
  query: unknown;
}

/** Worker -> main. Anything else on the channel is dropped, not guessed at. */
export type DictionaryReadReply =
  | { type: 'readResult'; id: number; ok: true; value: unknown }
  | { type: 'readResult'; id: number; ok: false; error: string };

/**
 * Runs one read against an open handle. The worker calls this with its own
 * connection; the main process calls it with its shared one when the worker
 * cannot be used, so both routes answer identically by construction.
 */
export async function runDictionaryRead(
  db: SqliteDb,
  kind: DictionaryReadKind,
  query: unknown,
): Promise<unknown> {
  switch (kind) {
    case 'lookup':
      return lookup(db, query as LookupQuery);
    case 'neighbors':
      return findSemanticNeighbors(db, query as NeighborQuery);
    case 'compounds':
      return findLexiconCompounds(db, query as CompoundQuery);
    case 'examples':
      return findExampleSentences(db, query as ExampleQuery);
    case 'etymology':
      return findLexiconEtymology(db, query as EtymologyQuery);
    case 'frequency':
      return findLexiconFrequency(db, query as FrequencyQuery);
    case 'xrefs':
      return findLexiconXrefs(db, query as XrefQuery);
    default:
      throw new Error(`unknown dictionary read kind: ${String(kind)}`);
  }
}
