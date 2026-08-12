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
// The source plan's answer is a `utilityProcess`. That is correct and it is also
// **blocked by this repo's scope rule**: a utilityProcess (or a `worker_threads`
// Worker, or a forked child) needs its own build entry point, and CLAUDE.md forbids
// touching `forge.config.ts` / `vite.*.config.ts`. My plan file already recorded that
// utilityProcess is net-new infrastructure rather than an existing pattern; this is
// the sharper version of that finding — it is not merely unbudgeted, it cannot be
// added without a build-config change that is out of scope for this work.
//
// So the migration is exposed as `migrateLegacyStoresNow()`, is never called on boot,
// and the status object tells a caller whether there is anything to migrate. Wiring
// it to a button is safe only once it has somewhere to run.

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
import { lookup, type LookupQuery, type LookupResult } from './dictService';
import {
  lookupChineseTerm,
  resetCedictIndexCache,
  type ChineseLookupDeps,
} from './chineseLookup';
import type { DictResult } from '../../shared/types';
import {
  buildOfflineInterlinear,
  type LexiconInterlinearOptions,
  type LexiconInterlinearResult,
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
 */
export function lookupOfflineInterlinear(
  db: SqliteDb,
  text: string,
  options: LexiconInterlinearOptions = {},
): LexiconInterlinearResult {
  return buildOfflineInterlinear(
    text,
    (query) => lookup(db, {
      text: query,
      sourceLangs: options.sourceLangs ? [...options.sourceLangs] : undefined,
      limit: 8,
    }),
    options,
  );
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
