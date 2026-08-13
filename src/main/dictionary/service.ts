// The dictionary database as a *service*: what the rest of the main process talks to.
//
// Phase 1 built `db.ts` / `schema.ts` / `migrate.ts` as a library. This is the seam
// that makes them reachable from the product, and it deliberately does very little:
// open the database, report what is in it, and expose the migration as an explicit
// action. What it does NOT do is run the migration on boot, and that is the one
// decision in this file worth reading.
//
// ## Why the legacy migration does not run at startup
//
// Measured, not assumed (docs/plans/DICTIONARY_BUILD_LOG.md): migrating this
// machine's four bundled stores — 140 MB of JSON — writes a ~300 MB database and
// takes minutes. `better-sqlite3` is synchronous by design, so every second of that
// is a second the main process cannot answer an IPC call: the window would be frozen
// solid for the whole import, on first launch, with no way to cancel.
//
// The source plan's answer is a `utilityProcess`, and **that now exists**:
// `importWorker.ts` is the worker, `importJobs.ts` owns its lifecycle, and
// `importIpc.ts` exposes start/cancel/status to the renderer. The build entry that
// blocked it for several phases is one array element in `forge.config.ts`; the
// scope rule that forbade adding it was lifted explicitly for this feature.
//
// The `*Now` functions below are therefore **not** the product path any more. They
// remain because they are the synchronous core the worker and the tests both call,
// and because a CLI or a test wants them without a child process. Nothing on the
// main thread should call them: use `dictionaryImportJobs().start()` instead.

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { closeDictionaryDb, dictionaryDb, dictionaryDbPath, type SqliteDb } from './db';
import { DICT_SCHEMA_VERSION } from './schema';
import {
  legacyYomitanRoot,
  migrateLegacyYomitanStores,
  type MigrationProgress,
  type MigrationResult,
} from './migrate';
import { importCedict, type CedictImportCounts } from './importers/cedict';
import { rebuildCharacterProjection } from './importers/kanjidic';
import {
  importWiktextract,
  readJsonlLines,
  type WiktextractImportCounts,
  type WiktextractImportOptions,
} from './importers/wiktextract';
import { lookup, type LookupQuery, type LookupResult } from './dictService';
import {
  lookupChineseTerm,
  resetCedictIndexCache,
  type ChineseLookupDeps,
} from './chineseLookup';
import type { DictResult } from '../../shared/types';
import type { DictionarySourceInfo, DictionarySourceMutationResult } from '../../shared/dictionarySources';
import {
  buildOfflineInterlinear,
  type LexiconInterlinearOptions,
  type LexiconInterlinearResult,
  type LexiconLookupResult,
} from '../../shared/lexiconInterlinear';

export interface DictionaryStatus {
  /** Absolute path of the database file. */
  path: string;
  schemaVersion: number;
  /** Dictionaries already in the database. */
  dictionaries: { id: string; title: string; kind: string; sourceLang: string; entryCount: number }[];
  headwords: number;
  /** Legacy `userData/yomitan/<id>` stores that have not been migrated yet. */
  pendingLegacyStores: string[];
  /** Bytes on disk, or 0 when the file has not been created yet. */
  bytes: number;
}

export function listDictionarySources(db: SqliteDb = dictionaryDb()): DictionarySourceInfo[] {
  const rows = db.prepare(
    'select id, title, kind, source_lang, entry_count, enabled, priority from dictionaries order by priority, id',
  ).all() as Array<{
    id: string; title: string; kind: string; source_lang: string;
    entry_count: number; enabled: number; priority: number;
  }>;
  return rows.map((row) => ({
    id: row.id, title: row.title, kind: row.kind, sourceLang: row.source_lang,
    entryCount: row.entry_count, enabled: row.enabled !== 0, priority: row.priority,
  }));
}

export function setDictionarySourceEnabled(
  id: string,
  enabled: boolean,
  db: SqliteDb = dictionaryDb(),
): DictionarySourceMutationResult {
  const affected = (db.prepare('select char from char_sources where dict_id = ?').all(id) as Array<{ char: string }>).map((row) => row.char);
  let result: { changes: number } = { changes: 0 };
  db.transaction(() => {
    result = db.prepare('update dictionaries set enabled = ? where id = ?').run(enabled ? 1 : 0, id);
    if (result.changes) rebuildCharacterProjection(db, affected);
  })();
  return { ok: result.changes > 0, error: result.changes ? undefined : 'not-found', sources: listDictionarySources(db) };
}

export function moveDictionarySource(
  id: string,
  direction: -1 | 1,
  db: SqliteDb = dictionaryDb(),
): DictionarySourceMutationResult {
  const sources = listDictionarySources(db);
  const index = sources.findIndex((source) => source.id === id);
  if (index < 0) return { ok: false, error: 'not-found', sources };
  const target = index + direction;
  if (target < 0 || target >= sources.length) return { ok: false, error: 'edge', sources };
  const reordered = [...sources];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  const swap = db.transaction(() => {
    const update = db.prepare('update dictionaries set priority = ? where id = ?');
    reordered.forEach((source, priority) => update.run(priority, source.id));
    const ids = [reordered[index].id, reordered[target].id];
    const affected = db.prepare('select distinct char from char_sources where dict_id in (?, ?)').all(...ids) as Array<{ char: string }>;
    rebuildCharacterProjection(db, affected.map((row) => row.char));
  });
  swap();
  return { ok: true, sources: listDictionarySources(db) };
}

export function removeDictionarySource(
  id: string,
  db: SqliteDb = dictionaryDb(),
): DictionarySourceMutationResult {
  const affected = (db.prepare('select char from char_sources where dict_id = ?').all(id) as Array<{ char: string }>).map((row) => row.char);
  let result: { changes: number } = { changes: 0 };
  db.transaction(() => {
    result = db.prepare('delete from dictionaries where id = ?').run(id);
    if (result.changes) rebuildCharacterProjection(db, affected);
  })();
  return { ok: result.changes > 0, error: result.changes ? undefined : 'not-found', sources: listDictionarySources(db) };
}

let ready = false;

/**
 * Opens the database and applies any pending schema migrations.
 *
 * Cheap and safe on the main thread: creating the file and running the DDL is
 * milliseconds. This is the only dictionary work that happens automatically.
 */
export function initDictionaryService(): SqliteDb {
  const db = dictionaryDb();
  ready = true;
  return db;
}

export function dictionaryServiceReady(): boolean {
  return ready;
}

/** Which legacy stores exist on disk but have no rows in the database yet. */
export function pendingLegacyStores(db: SqliteDb = dictionaryDb()): string[] {
  const root = legacyYomitanRoot(app.getPath('userData'));
  if (!fs.existsSync(root)) return [];
  const have = new Set(
    (db.prepare('select id from dictionaries').all() as { id: string }[]).map((row) => row.id),
  );
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((id) => !have.has(id) && fs.existsSync(`${root}/${id}/index.json`));
}

export function dictionaryStatus(): DictionaryStatus {
  const db = dictionaryDb();
  const rows = db
    .prepare('select id, title, kind, source_lang, entry_count from dictionaries order by priority, id')
    .all() as { id: string; title: string; kind: string; source_lang: string; entry_count: number }[];
  const headwords = (db.prepare('select count(*) c from headwords').get() as { c: number }).c;
  const file = dictionaryDbPath();
  return {
    path: file,
    schemaVersion: Number(db.pragma('user_version', { simple: true })),
    dictionaries: rows.map((row) => ({
      id: row.id,
      title: row.title,
      kind: row.kind,
      sourceLang: row.source_lang,
      entryCount: row.entry_count,
    })),
    headwords,
    pendingLegacyStores: pendingLegacyStores(db),
    bytes: fs.existsSync(file) ? fs.statSync(file).size : 0,
  };
}

/**
 * Runs the legacy yomitan migration **synchronously on the calling thread**.
 *
 * Named `Now` because that is the whole warning: on the main process this blocks
 * for minutes. It exists so the work is callable and testable today; a caller that
 * is not a test or a CLI should not use it until there is a worker to run it on.
 */
export function migrateLegacyStoresNow(onProgress?: (progress: MigrationProgress) => void): MigrationResult {
  return migrateLegacyYomitanStores(dictionaryDb(), legacyYomitanRoot(app.getPath('userData')), onProgress);
}

/** Imports a CC-CEDICT `.u8` file from disk. Same threading caveat as above. */
export function importCedictFileNow(filePath: string, dictId?: string): CedictImportCounts {
  const text = fs.readFileSync(filePath, 'utf8');
  return importCedict(dictionaryDb(), text, dictId ? { dictId } : {});
}

/**
 * Imports a Wiktextract JSONL dump from disk. Same threading caveat as above.
 *
 * Streamed rather than read whole, because these dumps are the one source in the
 * plan's list that does not fit in a JavaScript string. `shouldCancel` is passed
 * straight through: it is the only import here that can be stopped, and a stop
 * rolls the transaction back rather than leaving a partial dictionary behind.
 */
export function importWiktextractFileNow(
  filePath: string,
  options: WiktextractImportOptions = {},
): WiktextractImportCounts {
  return importWiktextract(dictionaryDb(), readJsonlLines(filePath), options);
}

/**
 * Look a term up in the database, across every enabled dictionary.
 *
 * This is the service's read API and the successor to `lookupGlossary` /
 * `lookupChinese`. Phase 4 put it in front of both: `dictionary.ts`'s `lookupTerm`
 * tries it first for Japanese, and `lookupChineseInDictionary` below does the same
 * for Chinese. Both fall back to the legacy source when it returns nothing, which
 * is not politeness — the legacy migration still has nowhere to run, so on a
 * current installation this database is empty and a hard swap would have made the
 * dictionary silently return no results.
 */
export function lookupInDictionaryDb(query: LookupQuery): LookupResult {
  return lookup(dictionaryDb(), query);
}

/**
 * Build the Workbench's offline segmentation and interlinear glossary rows.
 *
 * This remains a service function rather than a new IPC channel until a
 * first-class Workbench renderer consumer exists. It is intentionally read-only
 * and uses the same SQLite lookup path as individual dictionary queries.
 *
 * `legacyFallback` is the same additive concession `lookupTerm` makes, for the
 * same reason and no other: the migration above still has nowhere to run, so on
 * a current installation this database is empty and a database-only interlinear
 * reports every token of every passage as ungrounded while the legacy stores sit
 * on disk answering the pop-up dictionary. It is consulted only when SQLite
 * returned nothing, so an imported dictionary always wins.
 */
export function lookupOfflineInterlinear(
  db: SqliteDb,
  text: string,
  options: LexiconInterlinearOptions = {},
  legacyFallback?: (query: string) => LexiconLookupResult,
): LexiconInterlinearResult {
  return buildOfflineInterlinear(
    text,
    (query) => {
      const unified = lookup(db, {
        text: query,
        sourceLangs: options.sourceLangs ? [...options.sourceLangs] : undefined,
        limit: 8,
      });
      if (unified.entries.length || !legacyFallback) return unified;
      const legacy = legacyFallback(query);
      if (!legacy.entries.length) return unified;
      // The detected languages are read off the query's script, not off the
      // rows, so they survive a miss and must not be dropped with it.
      return { ...legacy, detectedLangs: unified.detectedLangs };
    },
    options,
  );
}

/**
 * Main-process entry point for the renderer bridge, using the managed database.
 *
 * The fallback is passed in rather than built here on purpose: `yomitan.ts`
 * imports this module, so reaching back into it from the service would close an
 * import cycle. `dictionary.ts` already owns both sides and composes them.
 */
export function lookupOfflineInterlinearFromStore(
  text: string,
  options: LexiconInterlinearOptions = {},
  legacyFallback?: (query: string) => LexiconLookupResult,
): LexiconInterlinearResult {
  return lookupOfflineInterlinear(dictionaryDb(), text, options, legacyFallback);
}

// ----- the Chinese surface's lookup path -------------------------------------
//
// Phase 4 moved `renderer/chineseDict.ts`'s engine here. The deps below are the
// only Electron-aware part; `chineseLookup.ts` itself is pure so it can be
// tested without a running app.

/** Where the bundled CC-CEDICT copy lives, dev and packaged. */
function bundledCedictPath(): string {
  const rel = ['public', 'cedict', 'cedict.u8'];
  return app.isPackaged
    ? path.join(process.resourcesPath, ...rel)
    : path.join(app.getAppPath(), ...rel);
}

/**
 * Managed install (the Phase 6 `cc-cedict` asset) first, bundled copy second —
 * the same precedence the renderer module used, so a user who downloaded the
 * fuller dictionary keeps getting it.
 *
 * `downloads` is imported lazily: it is a large module and this path is only
 * reached when the database has no Chinese dictionary.
 */
async function loadCedictText(): Promise<string> {
  try {
    const downloads = await import('../downloads');
    if (downloads.isInstalled('cc-cedict')) {
      const text = await downloads.readAssetText('cc-cedict');
      if (text && text.length > 0) return text;
    }
  } catch {
    /* fall through to the bundled copy */
  }
  const file = bundledCedictPath();
  if (!fs.existsSync(file)) {
    throw new Error(`Could not load the Chinese dictionary (missing ${file}).`);
  }
  return fs.readFileSync(file, 'utf8');
}

const chineseDeps: ChineseLookupDeps = {
  db: () => {
    try {
      return dictionaryDb();
    } catch {
      return null;
    }
  },
  loadCedictText,
};

/** Look a Chinese term up. Database first, CC-CEDICT file second. */
export function lookupChineseInDictionary(query: string): Promise<DictResult> {
  return lookupChineseTerm(query, chineseDeps);
}

/** Drop the cached CC-CEDICT index after a managed install finishes. */
export function resetChineseDictionaryCache(): void {
  resetCedictIndexCache();
}

export function shutdownDictionaryService(): void {
  closeDictionaryDb();
  ready = false;
}

export { DICT_SCHEMA_VERSION };
