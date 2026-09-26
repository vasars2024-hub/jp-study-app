// Statistics' "By show" list, named the way the Watch library names things.
//
// Watch time is recorded per played FILE (the key is `videoCoreResumeKey`,
// `file:<path>`), under whatever title the player had for it — a cleaned file
// name, an episode title, a series title. One show watched over three episodes
// therefore used to appear as three rows with three different names. The Watch
// library already knows which files belong to which title (`mediaItemIds` on
// each `WatchTitleView`, and each media item's `path`), so the rows are folded
// into one per library title and carry the library's own title. Files the
// library does not know keep their recorded name.

export interface ShowStatRow {
  /** The resume key of the most recently watched file in the row. */
  id: string;
  title: string;
  seconds: number;
  lastWatched: number;
  /** Library title id when the row was matched; absent for unmatched files. */
  libraryTitleId?: string;
}

export interface LibraryTitleRef {
  id: string;
  title: string;
  mediaItemIds: readonly string[];
}

export interface MediaPathRef {
  id: string;
  path: string;
}

/** The `file:` resume key a local path is recorded under (mirrors `videoCoreResumeKey`). */
export function fileResumeKey(path: string): string {
  const normalized = String(path ?? '').trim().replace(/\\/g, '/').toLocaleLowerCase('en-US');
  return normalized ? `file:${normalized}` : '';
}

/** resume key -> the library title that owns that file. */
export function libraryTitlesByResumeKey(
  titles: readonly LibraryTitleRef[],
  media: readonly MediaPathRef[],
): Map<string, { id: string; title: string }> {
  const pathById = new Map<string, string>();
  for (const item of media) {
    if (item && typeof item.id === 'string' && typeof item.path === 'string' && item.path) {
      pathById.set(item.id, item.path);
    }
  }
  const out = new Map<string, { id: string; title: string }>();
  for (const title of titles) {
    if (!title?.title) continue;
    for (const mediaId of title.mediaItemIds ?? []) {
      const path = pathById.get(mediaId);
      const key = path ? fileResumeKey(path) : '';
      // First title wins: a file linked to two titles stays under the one the
      // library lists first rather than being counted twice.
      if (key && !out.has(key)) out.set(key, { id: title.id, title: title.title });
    }
  }
  return out;
}

/** One row per library title (summed), unmatched files as they were; most recent first. */
export function groupShowsByLibraryTitle(
  shows: readonly ShowStatRow[],
  byKey: ReadonlyMap<string, { id: string; title: string }>,
): ShowStatRow[] {
  const grouped = new Map<string, ShowStatRow>();
  const loose: ShowStatRow[] = [];
  for (const show of shows) {
    const match = byKey.get(show.id);
    if (!match) {
      loose.push({ ...show });
      continue;
    }
    const prev = grouped.get(match.id);
    if (!prev) {
      grouped.set(match.id, { ...show, title: match.title, libraryTitleId: match.id });
      continue;
    }
    const newer = show.lastWatched > prev.lastWatched;
    grouped.set(match.id, {
      id: newer ? show.id : prev.id,
      title: match.title,
      seconds: prev.seconds + show.seconds,
      lastWatched: Math.max(prev.lastWatched, show.lastWatched),
      libraryTitleId: match.id,
    });
  }
  return [...grouped.values(), ...loose].sort((a, b) => b.lastWatched - a.lastWatched);
}
