/**
 * Make the sidecar aware of a local file before asking it to play one.
 *
 * ## The defect this closes
 *
 * `POST /api/v1/directstream/play/localfile` does not open a path off the disk. It
 * resolves the path against Seanime's own `local_files` table, and a file that was
 * never scanned into that table does not exist as far as the sidecar is concerned.
 * Opening one answers **HTTP 200** and then aborts the preparation over the
 * websocket:
 *
 *     directstream > Signaling native player to abort stream preparation,
 *     reason: cannot play local file, could not find local file: C:\…\The Big O - 13….mkv
 *
 * Which lands in the player as `active: true, playbackInfo: null` — a black frame
 * with an error headline and no cues, so the whole study surface (transcript,
 * grammar, mining) has nothing to attach to.
 *
 * Verified 2026-08-06 against the running sidecar: the file existed on disk, the
 * path arrived correctly escaped, and `seanime.db` held **no** `local_files` row
 * matching it. `CueProofDriver` never hit this because it configures
 * `library.libraryPath` and runs `POST /api/v1/library/scan` before it plays —
 * the proof harness was carrying setup the product path never did.
 *
 * ## Why append rather than assign
 *
 * The harness sets `libraryPath` to the file's folder and `libraryPaths: []`,
 * which is fine for a throwaway profile and wrong for a user's. Seanime supports
 * additional roots, so this adds one and leaves an existing configuration alone.
 * A folder already inside a configured root is left completely untouched — no
 * settings write, no scan.
 */

/** Lower-cased, forward-slashed, no trailing separator. Windows paths are case-insensitive. */
export function normalizeLibraryPath(input: string): string {
  return input.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/** The directory holding a file, in the separator style it arrived in. */
export function parentFolderOf(filePath: string): string {
  const trimmed = filePath.trim().replace(/[\\/]+$/, '');
  const cut = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'));
  return cut > 0 ? trimmed.slice(0, cut) : '';
}

/**
 * Is `folder` already inside one of the configured roots?
 *
 * Compares whole segments, so `C:\Anime2` is NOT treated as covered by
 * `C:\Anime` — a prefix test alone would skip the scan and leave the open
 * failing exactly as before, which is the failure mode this module exists to
 * remove and the one that would be hardest to notice.
 */
export function libraryCovers(roots: readonly string[], folder: string): boolean {
  const target = normalizeLibraryPath(folder);
  if (!target) return false;
  return roots
    .map(normalizeLibraryPath)
    .filter(Boolean)
    .some((root) => target === root || target.startsWith(`${root}/`));
}

/** Every root a settings payload declares, `libraryPath` plus the extra roots. */
export function rootsFromSettings(library: Record<string, unknown> | undefined): string[] {
  if (!library) return [];
  const single = typeof library.libraryPath === 'string' ? [library.libraryPath] : [];
  const many = Array.isArray(library.libraryPaths)
    ? (library.libraryPaths as unknown[]).filter((p): p is string => typeof p === 'string')
    : [];
  return [...single, ...many].filter((p) => p.trim());
}

/**
 * The settings body that adds `folder` as a root.
 *
 * Whole-object PATCH because that is the shape the endpoint takes; every section
 * is carried through untouched so this cannot quietly reset a user's torrent
 * provider or AniList link on its way to adding a folder.
 */
export function settingsBodyAddingRoot(
  current: Record<string, unknown>,
  folder: string,
  hasSettings = true,
): Record<string, unknown> {
  const library = (current.library ?? {}) as Record<string, unknown>;
  const existing = rootsFromSettings(library);
  // An empty `libraryPath` is Seanime's unconfigured state, and it rejects a
  // scan without one — so the first folder claims it and later ones append.
  const libraryPath = typeof library.libraryPath === 'string' && library.libraryPath.trim()
    ? library.libraryPath
    : folder;
  const extras = Array.isArray(library.libraryPaths)
    ? (library.libraryPaths as unknown[]).filter((p): p is string => typeof p === 'string')
    : [];
  const needsExtra = normalizeLibraryPath(libraryPath) !== normalizeLibraryPath(folder)
    && !existing.some((p) => normalizeLibraryPath(p) === normalizeLibraryPath(folder));
  const base: Record<string, unknown> = {
    // Spread first so a section this does not model survives the write.
    ...current,
    library: {
      ...library,
      libraryPath,
      libraryPaths: needsExtra ? [...extras, folder] : extras,
      torrentProvider: library.torrentProvider ?? 'none',
    },
    // Named explicitly because `/api/v1/start` rejects a body missing them, and
    // on that path `current` is `{}` so the spread above supplies nothing.
    mediaPlayer: current.mediaPlayer ?? {},
    torrent: current.torrent ?? {},
    anilist: current.anilist ?? {},
    discord: current.discord ?? {},
    manga: current.manga ?? {},
    notifications: current.notifications ?? {},
    nakama: current.nakama ?? {},
  };
  return hasSettings
    ? base
    : {
        ...base,
        enableTranscode: false,
        enableTorrentStreaming: false,
        debridProvider: 'none',
      };
}

/**
 * Does the sidecar's `local_files` listing contain this exact path?
 *
 * The question that matters, and it is NOT "is the folder a configured root".
 * Those came apart live: an initial `/api/v1/start` wrote the root, its scan
 * then failed, and every later open saw a configured root, concluded the work
 * was done, skipped the scan and failed identically — a fix that disabled
 * itself after one bad attempt.
 */
export function localFilesContain(body: unknown, filePath: string): boolean {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return false;
  const target = normalizeLibraryPath(filePath);
  return data.some((file) => {
    const path = (file as { path?: unknown } | null)?.path;
    return typeof path === 'string' && normalizeLibraryPath(path) === target;
  });
}

/** The distinct AniList ids a scan matched, for seeding the collection. */
export function mediaIdsFromScan(body: unknown): number[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  return [...new Set(
    data
      .map((file) => (file as { mediaId?: unknown } | null)?.mediaId)
      .filter((id): id is number => typeof id === 'number' && id > 0),
  )];
}

/** A body that is not JSON is not a reason to fail a scan that already succeeded. */
async function readJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export type EnsureLibraryOutcome = 'covered' | 'scanned' | 'failed';

/** One attempt per folder per session — a scan is expensive and re-running it is not free. */
const ensured = new Map<string, Promise<EnsureLibraryOutcome>>();

/** Test seam. Not for product code. */
export function resetSeanimeLibraryCache(): void {
  ensured.clear();
}

export interface EnsureLibraryDeps {
  /** Performs a request against the sidecar with auth headers already attached. */
  request: (path: string, init?: RequestInit) => Promise<Response>;
  /**
   * AniList ids this app already knows for the folder, resolved lazily because
   * it is only needed on the branch that actually scans.
   *
   * Seanime's own title matching is what fails here, so handing it the answer is
   * the point. Measured: enhanced mode parsed "The Big O" out of the filenames,
   * searched MAL, and came back with **"B: The Beginning: Succession"** and
   * **"B: The Beginning"** — a media container of two wrong titles, against
   * which all 29 files scored 0 and stayed `unmatched`, and the open failed with
   * `local file has not been matched to a media`. Seeding the collection with
   * AniList 567 first and re-scanning matched 26 of the 29 immediately.
   */
  seedMediaIds?: () => Promise<number[]>;
  signal?: AbortSignal;
}

/**
 * Ensure the sidecar has scanned the folder holding `localFilePath`.
 *
 * Never throws: a failure here must not stop the open. The file may already be
 * known through a route this does not model, and a play attempt that fails on
 * its own reports a better error than a setup step refusing to try.
 */
export async function ensureSeanimeLibraryCovers(
  localFilePath: string,
  deps: EnsureLibraryDeps,
): Promise<EnsureLibraryOutcome> {
  const folder = parentFolderOf(localFilePath);
  if (!folder) return 'failed';

  /*
    Asked every time, ahead of the per-folder memo: it is one cheap GET, and it
    is the only reading of "already fine" that `PlayLocalFile` would agree with.
    A memo keyed on the folder answers "have we tried", which is a different
    question and the wrong one to answer first.
  */
  try {
    const known = await deps.request('/api/v1/library/local-files');
    if (known.ok && localFilesContain(await readJsonSafely(known), localFilePath)) {
      return 'covered';
    }
  } catch {
    // Unreachable listing is not a verdict; fall through and try to set up.
  }

  const key = normalizeLibraryPath(folder);
  const cached = ensured.get(key);
  if (cached) return cached;

  const run = (async (): Promise<EnsureLibraryOutcome> => {
    try {
      /*
        A sidecar that has never been set up answers `GET /api/v1/settings` with
        **500**, not with an empty object — measured, alongside its own
        `Did not initialize media player module, no settings found`. So a failed
        read is the unconfigured case, not an error case, and it is the one that
        matters: an instance with no settings has certainly never scanned
        anything. It is configured through `/api/v1/start` instead of PATCH.
      */
      const settingsResponse = await deps.request('/api/v1/settings');
      const hasSettings = settingsResponse.ok;
      const current = hasSettings
        ? ((await settingsResponse.json()) as { data?: Record<string, unknown> }).data ?? {}
        : {};
      /*
        Skip the settings write when the folder is already a root — but do NOT
        stop here. Reaching this point means the file is not in `local_files`,
        so a configured root has simply never been walked, and the scan below is
        exactly the missing step.
      */
      const alreadyRoot = hasSettings
        && libraryCovers(rootsFromSettings(current.library as Record<string, unknown>), folder);
      if (!alreadyRoot) {
        const patched = await deps.request(hasSettings ? '/api/v1/settings' : '/api/v1/start', {
          method: hasSettings ? 'PATCH' : 'POST',
          body: JSON.stringify(settingsBodyAddingRoot(current, folder, hasSettings)),
        });
        if (!patched.ok) return 'failed';
      }

      /*
        Seed the collection BEFORE scanning, with the ids this app already holds.

        The matcher draws its candidates from the collection, so this is the step
        that decides whether the scan matches anything. Seeding after the scan
        would leave the current scan's files unmatched and only help a later one.
        Best-effort: a refused seed still leaves a scan worth running.
      */
      const supplied = await deps.seedMediaIds?.().catch(() => [] as number[]) ?? [];
      // Deduplicated here rather than trusting the caller: a folder of 29
      // episodes yields the same series id 29 times, and one series repeated
      // twenty-nine times is not a collection seed anyone meant to send.
      const known = [...new Set(supplied.filter((id) => typeof id === 'number' && id > 0))];
      if (known.length) {
        await deps.request('/api/v1/library/unknown-media', {
          method: 'POST',
          body: JSON.stringify({ mediaIds: known }),
        });
      }

      /*
        `enhanced: true` is not an upgrade, it is the only mode that works here.

        In normal mode the matcher draws candidates from the user's tracker
        collection and refuses an empty one outright —
        `[matcher] no media fed into the matcher`
        (`internal/library/scanner/matcher.go:130`), and this app runs Seanime
        against a SIMULATED user whose collection starts empty. Measured on this
        machine with `enhanced: false`: "Local files to be scanned: 29" followed
        by `localFilesCount: 0`. Twenty-nine files walked, none kept, and the
        open failed exactly as it had before the scan existed.

        Enhanced mode fetches media by parsed title instead, so it can bootstrap
        from nothing. `docs/migration/CURRENT_STATE.md:405-416` records this as a
        Phase-2 design constraint rather than a bug.
      */
      const scan = await deps.request('/api/v1/library/scan', {
        method: 'POST',
        body: JSON.stringify({
          enhanced: true,
          enhanceWithOfflineDatabase: false,
          skipLockedFiles: false,
          skipIgnoredFiles: false,
        }),
      });
      if (!scan.ok) return 'failed';

      /*
        Seed the collection with whatever matched. The scanner only auto-adds
        unknown media when fewer than five titles are unknown
        (`scanner/scan.go:439`), so a first import of a real folder is silently
        over that threshold and the entries never appear. Best-effort: the
        `local_files` rows the open actually needs are already written by the
        scan, and this is what makes them visible in the library view.
      */
      const mediaIds = mediaIdsFromScan(await readJsonSafely(scan));
      if (mediaIds.length) {
        await deps.request('/api/v1/library/unknown-media', {
          method: 'POST',
          body: JSON.stringify({ mediaIds }),
        });
      }
      return 'scanned';
    } catch {
      return 'failed';
    }
  })();

  ensured.set(key, run);
  const outcome = await run;
  // A failure is not cached: the sidecar may simply have been mid-restart, and
  // one bad moment should not disable playback for the rest of the session.
  if (outcome === 'failed') ensured.delete(key);
  return outcome;
}
