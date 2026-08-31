/**
 * The Files app — the enumerators that only the RENDERER can run.
 *
 * Every other store this app owns lives under `userData` and is walked in main
 * (`main/filesApp/enumerators.ts`). The Notebook does not: it is persisted in
 * renderer `localStorage` under `NOTEBOOK_TIMELINE_STORAGE_KEY`, which no
 * main-process reader can open. Chromium keeps localStorage in a Snappy-blocked
 * LevelDB, so this is not a "main could just read the file" situation — the
 * value is only decodable inside the renderer that owns it.
 *
 * That is why `outputs/notes` and `outputs/highlights` read a permanent 0 while
 * the store on disk held real entries: gate 1's FINDING shape, produced by a
 * process boundary rather than a wrong path. The fix is a second enumerator
 * layer merged into the snapshot on arrival, not a second index.
 *
 * The merge is additive and recomputes `counts` from the joined list, so a
 * group total can never disagree with the leaves under it — the same invariant
 * `countByCategory` gives the main-side build.
 */
import {
  categoryForKind,
  countByCategory,
  type FilesIndexSnapshot,
  type FilesItem,
  type FilesItemKind,
} from '../../../shared/filesApp/catalog';
import {
  NOTEBOOK_TIMELINE_STORAGE_KEY,
  loadNotebookTimeline,
  type NotebookStream,
  type NotebookTimelineEntry,
} from '../../notebookTimeline';

/**
 * Which Notebook streams are highlights rather than notes.
 *
 * The plan gives `outputs/notes` and `outputs/highlights` separate leaves, and
 * the Notebook's own vocabulary already draws that line — a highlight is text
 * the user marked in something they were reading; everything else in the
 * timeline is a note the app or the extension wrote about an action.
 */
const HIGHLIGHT_STREAMS: ReadonlySet<NotebookStream> = new Set<NotebookStream>([
  'highlights',
  'saved-words',
]);

function kindForStream(stream: NotebookStream): FilesItemKind {
  return HIGHLIGHT_STREAMS.has(stream) ? 'highlight' : 'note';
}

/**
 * One `FilesItem` per Notebook entry.
 *
 * `sizeBytes` stays `null`: a timeline entry has no byte size, and borrowing
 * its detail length would put a number in the size column that means something
 * else entirely. `location` is the localStorage key plus the entry id, which is
 * a real location the Properties panel can name even though gate 12 correctly
 * refuses to reveal it in Explorer — there is no folder to open.
 */
export function notebookFilesItems(
  entries: readonly NotebookTimelineEntry[] = loadNotebookTimeline(),
): FilesItem[] {
  return entries.map((entry) => {
    const kind = kindForStream(entry.stream);
    return {
      id: `notebook:${entry.id}`,
      name: entry.title || entry.id,
      kind,
      categoryId: categoryForKind(kind),
      // A note records what the user or the app did; it is not mined text and
      // carries no claim about how any sentence in it was produced.
      provenance: 'app-generated' as const,
      sizeBytes: null,
      createdAt: typeof entry.ts === 'number' ? entry.ts : null,
      modifiedAt: null,
      lastUsedAt: null,
      location: {
        store: 'localStorage' as const,
        key: NOTEBOOK_TIMELINE_STORAGE_KEY,
        pointer: entry.id,
      },
      flags: { hasNotes: Boolean(entry.detail) },
      source: 'notebook',
    };
  });
}

/** Every renderer-owned enumerator, in one place. */
export const RENDERER_FILES_ENUMERATORS: readonly {
  source: string;
  run: () => FilesItem[];
}[] = [{ source: 'notebook', run: () => notebookFilesItems() }];

/**
 * Join the renderer-owned items onto a snapshot built in main.
 *
 * Ids already present win, so a store that ever becomes readable from both
 * sides cannot produce two rows for one item. Each renderer enumerator reports
 * itself alongside the main ones for the same reason they do: a category at 0
 * has to be distinguishable from a reader that failed.
 */
export function withRendererItems(snapshot: FilesIndexSnapshot): FilesIndexSnapshot {
  const items = [...snapshot.items];
  const seen = new Set(items.map((item) => item.id));
  const reports = [...snapshot.enumerators];

  for (const enumerator of RENDERER_FILES_ENUMERATORS) {
    const started = Date.now();
    try {
      let kept = 0;
      for (const item of enumerator.run()) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        items.push(item);
        kept += 1;
      }
      reports.push({ source: enumerator.source, itemCount: kept, elapsedMs: Date.now() - started });
    } catch (err) {
      reports.push({
        source: enumerator.source,
        itemCount: 0,
        elapsedMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { ...snapshot, items, counts: countByCategory(items), enumerators: reports };
}
