/**
 * Phase 6 slice 1 — the read-only Seanime→Study OS library boundary.
 *
 * Adapts the sidecar's real contract onto the pure model in
 * `src/shared/seanimeStudyLibrary.ts`. Read-only by construction: two GETs, no PATCH, no
 * write back into either library. The same discipline Phase 5's manga boundary follows.
 *
 * ## Which endpoints, and why not the obvious one
 *
 * `GET /api/v1/library/collection` looks like the place to find local files. It is not:
 * `Anime_LibraryCollectionEntry.libraryData` is `Anime_EntryLibraryData`, which carries
 * only `allFilesLocked`, `sharedPath`, `unwatchedCount` and `mainFileCount`
 * (`vendor/seanime/generated/types.ts:1527`). Per-file paths for *matched* entries appear
 * nowhere in that response — only `unmatchedLocalFiles` and `ignoredLocalFiles` hold
 * `Anime_LocalFile[]`, and by definition those are the files that did not match anything.
 *
 * So paths come from `GET /api/v1/library/local-files` ("Route returns all local files",
 * `vendor/seanime-web/api/generated/endpoints.ts:1039`), and the collection is read only
 * to resolve `mediaId` → display title. Building this against `libraryData` would have
 * produced an empty result that looked exactly like an empty library.
 */
import type {
  Anime_LibraryCollection,
  Anime_LocalFile,
} from '../../../vendor/seanime/generated/types';
import type { SeanimeLibraryFile } from '../../shared/seanimeStudyLibrary';
import { seanimeApi } from './client';

const LOCAL_FILES_ROUTE = '/api/v1/library/local-files';
const COLLECTION_ROUTE = '/api/v1/library/collection';

/**
 * `mediaId` → display title, from the collection.
 *
 * `userPreferred` first because that is the name the user already sees everywhere else in
 * the adopted library UI; romaji, english and native are ordered after it as fallbacks. A
 * title is study *content*, so nothing here is translated.
 */
export function seanimeLibraryTitles(
  collection: Anime_LibraryCollection,
): Map<number, string> {
  const titles = new Map<number, string>();
  for (const list of collection.lists ?? []) {
    for (const entry of list.entries ?? []) {
      const title = entry.media?.title;
      const label = title?.userPreferred?.trim()
        || title?.romaji?.trim()
        || title?.english?.trim()
        || title?.native?.trim();
      if (!label) continue;
      // First list wins: an entry can legitimately appear in more than one status list,
      // and the title is the same either way.
      if (!titles.has(entry.mediaId)) titles.set(entry.mediaId, label);
    }
  }
  return titles;
}

/**
 * Projects `Anime_LocalFile[]` onto the shared model.
 *
 * `ignored` files are dropped — the user has told the sidecar not to treat them as
 * library content, and surfacing them in a study queue would relitigate that. Files with
 * no path are dropped here too rather than being handed downstream with an empty one.
 */
export function seanimeLibraryFiles(
  files: readonly Anime_LocalFile[],
  titles: Map<number, string>,
): SeanimeLibraryFile[] {
  const projected: SeanimeLibraryFile[] = [];
  for (const file of files) {
    if (file.ignored) continue;
    const path = typeof file.path === 'string' ? file.path.trim() : '';
    if (!path) continue;
    const episode = file.metadata?.episode;
    const title = titles.get(file.mediaId);
    projected.push({
      path,
      mediaId: file.mediaId,
      ...(Number.isFinite(episode) ? { episode } : {}),
      ...(title ? { title } : {}),
    });
  }
  return projected;
}

/**
 * Reads both endpoints and returns the projected library.
 *
 * The collection read is tolerated failing: titles are a nicety and the model already
 * falls back to the Study OS title and then the file name, whereas the file list is the
 * whole point. A dead sidecar still throws — `seanimeApi` surfaces that as
 * `SeanimeUnavailableError`, which callers must show as an explicit offline state rather
 * than an empty library (the Phase-1 lifecycle rule).
 */
export async function readSeanimeStudyLibrary(): Promise<SeanimeLibraryFile[]> {
  const files = await seanimeApi<Anime_LocalFile[]>(LOCAL_FILES_ROUTE);
  let titles = new Map<number, string>();
  try {
    titles = seanimeLibraryTitles(
      await seanimeApi<Anime_LibraryCollection>(COLLECTION_ROUTE),
    );
  } catch {
    // Untitled entries fall back downstream; an unnamed row beats no rows.
  }
  return seanimeLibraryFiles(files ?? [], titles);
}
