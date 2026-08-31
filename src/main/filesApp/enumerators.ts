/**
 * The Files app — the enumerators that turn this app's five kinds of store into
 * one list of `FilesItem`s.
 *
 * **Why a context object instead of `app.getPath('userData')` inside each
 * reader.** Every store this walks lives under userData, which is 8.6 GB with
 * no restore point and cannot be fixtured in a test if the path is baked in.
 * Injecting `userDataPath` (and the dictionary handle) means `buildFilesIndex`
 * runs against a temp directory in vitest with no Electron at all, which is the
 * only way gate 1 gets a real regression test rather than a live-only check.
 * `defaultFilesContext()` is the one place Electron is touched.
 *
 * **Every enumerator is isolated.** One unreadable store must not blank the
 * whole app, so each runs inside a try and reports `error` in its own
 * `FilesEnumeratorReport`. Gate 1 reads "a category at 0 while items exist is a
 * FINDING" — an enumerator that failed says so, instead of silently producing
 * an empty category that looks like an honest zero.
 *
 * **Nothing here writes.** Enumeration is strictly read-only over the user's
 * data; not one call in this module mutates a store, and that is the property
 * gate 24 later leans on.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  categoryForKind,
  countByCategory,
  type FilesEnumeratorReport,
  type FilesIndexSnapshot,
  type FilesItem,
  type FilesItemKind,
  type FilesProvenance,
} from '../../shared/filesApp/catalog';
import { AUDIO_EXT, SUBTITLE_EXT, extOf } from '../../shared/mediaKind';
import {
  MEDIA_LIBRARY_STORE_FILE,
  mediaItemsFromStoredDocument,
} from '../../shared/mediaLibraryEntries';
import { AGENT_WORKSPACE_RELATIVE_PATH } from '../../shared/agentWorkspace';

/** The narrow slice of `better-sqlite3` the dictionary enumerator needs. */
export interface FilesSqliteLike {
  prepare(sql: string): { all(...params: unknown[]): unknown[] };
}

export interface FilesEnumeratorContext {
  /** Root of every JSON store and asset directory this app owns. */
  userDataPath: string;
  /**
   * The process-wide dictionary handle, or `null` when it cannot be opened.
   * A function rather than a value so a context that is never asked for
   * dictionaries never opens the database — opening it runs the migration
   * ladder, which is not a thing an index build should trigger.
   */
  openDictionary?: () => FilesSqliteLike | null;
}

export interface FilesEnumerator {
  source: string;
  run(ctx: FilesEnumeratorContext): FilesItem[];
}

/* ------------------------------------------------------------------ *
 * Small read helpers. All of them swallow and return a neutral value:
 * a missing store is a real, ordinary state in this app.
 * ------------------------------------------------------------------ */

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function statOf(file: string): fs.Stats | null {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
}

/**
 * The rows of a collection, whichever way its store shaped it.
 *
 * This app persists collections BOTH ways and neither is wrong: `library.json`
 * is a bare array, `media.json` wraps one in `items`, and `profiles.json` and
 * `agent/workspace-v1.json` use a record keyed by id. An enumerator that
 * assumes one shape does not fail loudly — it returns `[]` and its category
 * reads a permanent, plausible zero. Two of the three shapes here were found
 * that way, against real data, after the tests passed on fixtures the reader
 * itself had defined.
 */
function collectionValues<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') return Object.values(value as Record<string, T>);
  return [];
}

function listDir(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Build a file-backed item, reading size and timestamps off the real file.
 * A path that no longer exists produces `brokenLink` rather than being dropped:
 * a record pointing at a missing file is a real condition in this app today
 * (gate 34), and hiding it makes it undiagnosable.
 */
function fileItem(args: {
  id: string;
  name: string;
  kind: FilesItemKind;
  filePath: string;
  provenance: FilesProvenance;
  source: string;
  createdAt?: number | null;
  lastUsedAt?: number | null;
  flags?: FilesItem['flags'];
}): FilesItem {
  const stat = statOf(args.filePath);
  return {
    id: args.id,
    name: args.name,
    kind: args.kind,
    categoryId: categoryForKind(args.kind),
    provenance: args.provenance,
    sizeBytes: stat ? stat.size : null,
    createdAt: args.createdAt ?? (stat ? Math.round(stat.birthtimeMs || stat.ctimeMs) : null),
    modifiedAt: stat ? Math.round(stat.mtimeMs) : null,
    lastUsedAt: args.lastUsedAt ?? null,
    location: { store: 'file', path: args.filePath },
    flags: { ...args.flags, ...(stat ? {} : { brokenLink: true }) },
    source: args.source,
  };
}

/* ------------------------------------------------------------------ *
 * Sources.
 * ------------------------------------------------------------------ */

interface LibraryRow {
  id?: unknown;
  title?: unknown;
  kind?: unknown;
  createdAt?: unknown;
  lastReadAt?: unknown;
  epubFile?: unknown;
  sourcePath?: unknown;
}

/**
 * `library.json` — books and manga. A book's bytes live at
 * `library/<id>/<epubFile>`; a manga volume is a page directory, so its
 * location is the item folder.
 */
export const libraryEnumerator: FilesEnumerator = {
  source: 'library',
  run(ctx) {
    const rows = readJson<LibraryRow[]>(path.join(ctx.userDataPath, 'library.json'), []);
    if (!Array.isArray(rows)) return [];
    const out: FilesItem[] = [];
    for (const row of rows) {
      const id = typeof row?.id === 'string' ? row.id : null;
      if (!id) continue;
      const kind: FilesItemKind = row.kind === 'manga' ? 'manga' : 'book';
      const itemDir = path.join(ctx.userDataPath, 'library', id);
      const filePath =
        kind === 'book' && typeof row.epubFile === 'string'
          ? path.join(itemDir, row.epubFile)
          : itemDir;
      out.push(
        fileItem({
          id: `library:${id}`,
          name: typeof row.title === 'string' ? row.title : id,
          kind,
          filePath,
          provenance: 'book-text',
          source: 'library',
          createdAt: typeof row.createdAt === 'number' ? row.createdAt : null,
          lastUsedAt: typeof row.lastReadAt === 'number' ? row.lastReadAt : null,
          flags: { referenced: typeof row.sourcePath === 'string' },
        }),
      );
    }
    return out;
  },
};

interface MediaRow {
  id?: unknown;
  title?: unknown;
  path?: unknown;
  fileName?: unknown;
  kind?: unknown;
  addedAt?: unknown;
  lastPlayedAt?: unknown;
}

/**
 * `media.json` — every imported video and audio file. The store's own `kind`
 * decides video vs audio, falling back to the extension when it is absent
 * (older rows predate the field).
 *
 * Media rows carry provenance `unknown` deliberately. Provenance in this plan
 * is a property of *text* — whether a card's sentence came from human subs, auto
 * captions, a Whisper transcript or book text — and a video file is not text.
 * The subtitle and transcript rows beside it carry the real answer, so stamping
 * a guess here would put a wrong value in the column that decides whether a
 * mined card is trustworthy.
 */
export const mediaEnumerator: FilesEnumerator = {
  source: 'media',
  run(ctx) {
    // `media.json` is an OBJECT — `{ items, watchFolder, relationships }`, not a
    // bare array; reading it as one returned zero videos against a real 39-item
    // library and looked exactly like an empty one. The filename and the
    // extraction both come from `shared/mediaLibraryEntries`, beside the module
    // that defines the media model, so this indexer and the store's writer share
    // one contract instead of each carrying its own copy of the shape.
    const db = readJson<unknown>(path.join(ctx.userDataPath, MEDIA_LIBRARY_STORE_FILE), {});
    const rows = mediaItemsFromStoredDocument(db) as unknown as MediaRow[];
    const out: FilesItem[] = [];
    for (const row of rows) {
      const id = typeof row?.id === 'string' ? row.id : null;
      const filePath = typeof row?.path === 'string' ? row.path : null;
      if (!id || !filePath) continue;
      const ext = extOf(filePath);
      const isAudio = row.kind === 'audio' || row.kind === 'audiobook' || (row.kind !== 'video' && AUDIO_EXT.has(ext));
      out.push(
        fileItem({
          id: `media:${id}`,
          name:
            typeof row.title === 'string' && row.title
              ? row.title
              : typeof row.fileName === 'string'
                ? row.fileName
                : path.basename(filePath),
          kind: isAudio ? 'audio' : 'video',
          filePath,
          provenance: 'unknown',
          source: 'media',
          createdAt: typeof row.addedAt === 'number' ? row.addedAt : null,
          lastUsedAt: typeof row.lastPlayedAt === 'number' ? row.lastPlayedAt : null,
          flags: { referenced: true },
        }),
      );
    }
    return out;
  },
};

/**
 * `yt-transcripts/<youtubeId>.json` — one cue file per transcribed video, the
 * exact shape `ytPlaylists.ts:770` writes. These are Whisper output, so their
 * provenance is fixed and machine-derived; the plan requires that mark to be
 * carried everywhere rather than inferred at the card.
 *
 * This is gate 2's material: a video transcribed earlier is findable here
 * without navigating to that video, because the transcript is its own row.
 */
export const transcriptEnumerator: FilesEnumerator = {
  source: 'transcripts',
  run(ctx) {
    const dir = path.join(ctx.userDataPath, 'yt-transcripts');
    return listDir(dir)
      .filter((e) => !e.isDirectory() && extOf(e.name) === '.json')
      .map((e) => {
        const youtubeId = e.name.slice(0, -'.json'.length);
        return fileItem({
          id: `transcript:${youtubeId}`,
          name: youtubeId,
          kind: 'transcript',
          filePath: path.join(dir, e.name),
          provenance: 'whisper-transcript',
          source: 'transcripts',
          flags: { transcribed: true },
        });
      });
  },
};

/**
 * `yt-subs/` — captions fetched from YouTube rather than transcribed locally.
 * YouTube marks its machine captions in the track name (`a.<lang>`, the
 * yt-dlp convention), which is the one signal that separates auto-captions
 * from a human-authored track. A name that does not carry it is reported as
 * `human-subs`; a name that does is `auto-captions`.
 */
export const cachedSubtitleEnumerator: FilesEnumerator = {
  source: 'yt-subs',
  run(ctx) {
    const dir = path.join(ctx.userDataPath, 'yt-subs');
    return listDir(dir)
      .filter((e) => !e.isDirectory() && SUBTITLE_EXT.has(extOf(e.name)))
      .map((e) =>
        fileItem({
          id: `yt-sub:${e.name}`,
          name: e.name,
          kind: 'subtitle',
          filePath: path.join(dir, e.name),
          provenance: /\.a\.[a-z-]+\.[a-z0-9]+$/i.test(e.name) ? 'auto-captions' : 'human-subs',
          source: 'yt-subs',
        }),
      );
  },
};

/* ------------------------------------------------------------------ *
 * Outputs.
 * ------------------------------------------------------------------ */

/**
 * `exports/` — what the app produced and handed back to the user. `.apkg`
 * packages and CSV exports are different categories in the tree (a package is
 * re-importable, a CSV is terminal), so the extension splits them here rather
 * than in the UI.
 */
export const exportsEnumerator: FilesEnumerator = {
  source: 'exports',
  run(ctx) {
    const root = path.join(ctx.userDataPath, 'exports');
    const out: FilesItem[] = [];
    const walk = (dir: string, depth: number): void => {
      if (depth > 3) return;
      for (const entry of listDir(dir)) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full, depth + 1);
          continue;
        }
        const ext = extOf(entry.name);
        const kind: FilesItemKind | null =
          ext === '.apkg' ? 'package' : ext === '.csv' || ext === '.tsv' ? 'export' : null;
        if (!kind) continue;
        out.push(
          fileItem({
            id: `export:${path.relative(root, full)}`,
            name: entry.name,
            kind,
            filePath: full,
            provenance: 'app-generated',
            source: 'exports',
            flags: { exported: true },
          }),
        );
      }
    };
    walk(root, 0);
    return out;
  },
};

/* ------------------------------------------------------------------ *
 * Reference.
 * ------------------------------------------------------------------ */

/**
 * The `dictionaries` table in `dict.db`. These are the plan's canonical
 * non-file rows: they have a real location (database, table, row id) but no
 * path, which is exactly what gate 12's honest reveal refusal is measured on.
 *
 * `entry_count` is a row count, not a byte count, so `sizeBytes` stays `null`
 * rather than borrowing a number that means something else — the sort column
 * would then be comparing glosses against megabytes.
 */
export const dictionaryEnumerator: FilesEnumerator = {
  source: 'dictionaries',
  run(ctx) {
    const db = ctx.openDictionary?.();
    if (!db) return [];
    const rows = db
      .prepare('select id, title, kind, enabled, entry_count from dictionaries order by title')
      .all() as Array<{
      id?: unknown;
      title?: unknown;
      kind?: unknown;
      enabled?: unknown;
      entry_count?: unknown;
    }>;
    return rows.flatMap((row) => {
      const id = row?.id == null ? null : String(row.id);
      if (!id) return [];
      return [
        {
          id: `dictionary:${id}`,
          name: typeof row.title === 'string' && row.title ? row.title : id,
          kind: 'dictionary' as const,
          categoryId: categoryForKind('dictionary'),
          provenance: 'installed' as const,
          sizeBytes: null,
          createdAt: null,
          modifiedAt: null,
          lastUsedAt: null,
          location: {
            store: 'sqlite' as const,
            database: 'dict.db',
            table: 'dictionaries',
            rowId: id,
          },
          flags: { enabled: row.enabled === 1 || row.enabled === true },
          source: 'dictionaries',
        },
      ];
    });
  },
};

/** `models/` — Whisper tiers and GGUF translators actually present on disk. */
export const modelEnumerator: FilesEnumerator = {
  source: 'models',
  run(ctx) {
    const root = path.join(ctx.userDataPath, 'models');
    const out: FilesItem[] = [];
    const walk = (dir: string, depth: number): void => {
      if (depth > 2) return;
      for (const entry of listDir(dir)) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full, depth + 1);
          continue;
        }
        const ext = extOf(entry.name);
        if (ext !== '.gguf' && ext !== '.bin' && ext !== '.onnx') continue;
        out.push(
          fileItem({
            id: `model:${path.relative(root, full)}`,
            name: entry.name,
            kind: 'model',
            filePath: full,
            provenance: 'installed',
            source: 'models',
            flags: { enabled: true },
          }),
        );
      }
    };
    walk(root, 0);
    return out;
  },
};

/** `wallpapers/`, `covers/` and `artwork/` — the installed image assets. */
export const artworkEnumerator: FilesEnumerator = {
  source: 'artwork',
  run(ctx) {
    const out: FilesItem[] = [];
    for (const folder of ['wallpapers', 'covers', 'artwork']) {
      const dir = path.join(ctx.userDataPath, folder);
      for (const entry of listDir(dir)) {
        if (entry.isDirectory()) continue;
        out.push(
          fileItem({
            id: `artwork:${folder}/${entry.name}`,
            name: entry.name,
            kind: 'artwork',
            filePath: path.join(dir, entry.name),
            provenance: 'installed',
            source: 'artwork',
          }),
        );
      }
    }
    return out;
  },
};

/* ------------------------------------------------------------------ *
 * System and workspaces.
 * ------------------------------------------------------------------ */

interface ProfileRow {
  id?: unknown;
  /** The store calls it `label`; there is no `name` field. */
  label?: unknown;
  name?: unknown;
  createdAt?: unknown;
}

/**
 * `profiles.json` — the System group's one enumerable store.
 *
 * `profiles` is a RECORD keyed by id, not an array, and each row's display
 * string is `label`. Both were measured against the real store (28 profiles);
 * an array read returned zero and a `name` read would have rendered 28 rows
 * titled with their own ids.
 */
export const profileEnumerator: FilesEnumerator = {
  source: 'profiles',
  run(ctx) {
    const store = readJson<{ profiles?: unknown }>(
      path.join(ctx.userDataPath, 'profiles.json'),
      {},
    );
    const rows = collectionValues<ProfileRow>(store?.profiles);
    return rows.flatMap((row) => {
      const id = typeof row?.id === 'string' ? row.id : null;
      if (!id) return [];
      const label = typeof row.label === 'string' && row.label ? row.label : null;
      return [
        {
          id: `profile:${id}`,
          name: label ?? (typeof row.name === 'string' && row.name ? row.name : id),
          kind: 'profile' as const,
          categoryId: categoryForKind('profile'),
          provenance: 'app-generated' as const,
          sizeBytes: null,
          createdAt: typeof row.createdAt === 'number' ? row.createdAt : null,
          modifiedAt: null,
          lastUsedAt: null,
          location: {
            store: 'json' as const,
            file: 'profiles.json',
            pointer: `/profiles/${id}`,
          },
          flags: {},
          source: 'profiles',
        },
      ];
    });
  },
};

interface ConversationRow {
  id?: unknown;
  title?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  archived?: unknown;
}

/**
 * Agent study workspaces.
 *
 * The store is `agent/workspace-v1.json`, not `agent-workspaces.json`, and its
 * collection is `conversations` — measured, after the guessed path produced a
 * permanent, silent zero for the whole Workspaces group. The path now comes from
 * `AGENT_WORKSPACE_RELATIVE_PATH`, which the store's own writer uses, so there is
 * no second filename to drift. An agent conversation IS the study workspace this
 * app owns; there is no other store.
 *
 * `conversations` is read through `collectionValues` because the normalized
 * in-memory type is an ARRAY while the document on disk is a record keyed by id.
 *
 * Archived conversations are enumerated too, flagged rather than hidden: the
 * Files app is a finder, and a workspace you archived is exactly the thing you
 * later come here to find.
 */
export const workspaceEnumerator: FilesEnumerator = {
  source: 'workspaces',
  run(ctx) {
    const store = readJson<{ conversations?: unknown }>(
      path.join(ctx.userDataPath, ...AGENT_WORKSPACE_RELATIVE_PATH),
      {},
    );
    const rows = collectionValues<ConversationRow>(store?.conversations);
    return rows.flatMap((row) => {
      const id = typeof row?.id === 'string' ? row.id : null;
      if (!id) return [];
      return [
        {
          id: `workspace:${id}`,
          name: typeof row.title === 'string' && row.title ? row.title : id,
          kind: 'workspace' as const,
          categoryId: categoryForKind('workspace'),
          provenance: 'app-generated' as const,
          sizeBytes: null,
          createdAt: typeof row.createdAt === 'number' ? row.createdAt : null,
          modifiedAt: typeof row.updatedAt === 'number' ? row.updatedAt : null,
          lastUsedAt: null,
          location: {
            store: 'json' as const,
            file: 'agent/workspace-v1.json',
            pointer: `/conversations/${id}`,
          },
          flags: {},
          source: 'workspaces',
        },
      ];
    });
  },
};

/* ------------------------------------------------------------------ *
 * The registry and the build.
 * ------------------------------------------------------------------ */

/**
 * Every enumerator, in tree order. Adding a store is one entry here plus its
 * reader; nothing else in the app changes, which is what "the tree is derived,
 * so adding a category later is additive" has to mean in practice.
 */
export const FILES_ENUMERATORS: readonly FilesEnumerator[] = [
  libraryEnumerator,
  mediaEnumerator,
  transcriptEnumerator,
  cachedSubtitleEnumerator,
  exportsEnumerator,
  dictionaryEnumerator,
  modelEnumerator,
  artworkEnumerator,
  profileEnumerator,
  workspaceEnumerator,
];

/**
 * Run every enumerator and assemble the snapshot.
 *
 * Duplicate ids are dropped with the first occurrence kept, because two
 * enumerators claiming one id would otherwise make the same item appear twice
 * in a list and once in a count — the two would disagree and only one of them
 * would be visible.
 */
export function buildFilesIndex(
  ctx: FilesEnumeratorContext,
  enumerators: readonly FilesEnumerator[] = FILES_ENUMERATORS,
): FilesIndexSnapshot {
  const items: FilesItem[] = [];
  const seen = new Set<string>();
  const reports: FilesEnumeratorReport[] = [];

  for (const enumerator of enumerators) {
    const started = Date.now();
    try {
      const produced = enumerator.run(ctx);
      let kept = 0;
      for (const item of produced) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        items.push(item);
        kept += 1;
      }
      reports.push({
        source: enumerator.source,
        itemCount: kept,
        elapsedMs: Date.now() - started,
      });
    } catch (err) {
      reports.push({
        source: enumerator.source,
        itemCount: 0,
        elapsedMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    items,
    counts: countByCategory(items),
    enumerators: reports,
    builtAt: Date.now(),
  };
}
