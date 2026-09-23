/**
 * What the player surface actually reaches — Phase 6 slice 15.
 *
 * This file was written to prove a claim, and it disproved it instead. The claim, from
 * `NEXT_SESSION.md`'s Blanc plan and from `progress.json`'s
 * `blancPlanDecided20260731.theSeamAlreadyExists`, was that `StudyPlayerSlice` reaches
 * "only `video-core/*`" and so a player-without-library surface would be materially
 * lighter. That came from reading the DIRECT imports of four files. Walked transitively:
 *
 * ```text
 * MediaWorkspace       472 modules   5,888,364 source bytes
 * MediaPlayerSurface   465 modules   5,841,516 source bytes
 * difference             8 modules      49,130 bytes   = 1.7% of modules, 0.8% of bytes
 * ```
 *
 * The eight are `library-view`, `library-collection`, `handle-library-collection`,
 * `media-genre-selector`, the horizontal-draggable-scroll trio and `MediaWorkspace` itself.
 * Everything else the plan hoped to shed — `media-entry-card`, `media-preview-modal`,
 * torrent-search, debrid, playlists — arrives through `video-core.tsx` itself, which
 * imports three jotai atoms from `torrent-search-container`/`-drawer` for a `ScopeProvider`
 * (video-core.tsx:120-124) and reaches the rest through `video-core-playlist`. Cutting all
 * four of those edges by hand removes ZERO further modules: every one is reachable by
 * another path. The adopted tree is one densely connected unit at this level.
 *
 * So the tests below assert the property that survived measurement — the library screen IS
 * excluded, and the two surfaces share one provider stack — and deliberately do NOT assert
 * a weight claim, because the import graph cannot support one. The real "light for the
 * machine" property this design delivers is different and is not visible here: both
 * surfaces resolve to the SAME lazy chunk and the SAME pooled websocket, so a second
 * surface mounting costs no second download and no second connection. Confirming the
 * shared chunk needs `vite build`, which the Forge dev server blocks (EBUSY).
 *
 * The `walker can actually see` block is the control. Without it a broken resolver would
 * report "reaches nothing" for every input and pass forever.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

const REPO = resolve(__dirname, '../../..');
/** ADR-004's single permitted alias — see vite.renderer.config.ts. */
const ALIAS_ROOT = resolve(REPO, 'vendor/seanime-web');
const EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];

function resolveModule(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) {
    base = resolve(ALIAS_ROOT, specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    base = resolve(dirname(fromFile), specifier);
  } else {
    // A bare package specifier. Node modules are out of scope for this question.
    return null;
  }

  for (const ext of EXTENSIONS) {
    if (existsSync(base + ext)) return base + ext;
  }
  if (existsSync(base)) {
    for (const ext of EXTENSIONS) {
      const index = resolve(base, `index${ext}`);
      if (existsSync(index)) return index;
    }
  }
  return null;
}

/**
 * Static `import`/`export … from` plus `import(...)`. Type-only imports are EXCLUDED:
 * they are erased at build time and carry no runtime weight, so counting them would fail
 * this surface for importing a `type { SeanimeConnection }`.
 */
const importsCache = new Map<string, string[]>();

function importsOf(file: string): string[] {
  const cached = importsCache.get(file);
  if (cached) return cached;
  const source = readFileSync(file, 'utf8');
  const found: string[] = [];
  const fromRe = /(?:^|\n)\s*(?:import|export)\s+([^;]*?)\s*from\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(fromRe)) {
    const clause = match[1] ?? '';
    if (/^type\s/.test(clause.trim())) continue;
    if (match[2]) found.push(match[2]);
  }
  for (const match of source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (match[1]) found.push(match[1]);
  }
  for (const match of source.matchAll(/(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g)) {
    if (match[1]) found.push(match[1]);
  }
  importsCache.set(file, found);
  return found;
}

/**
 * Both caches exist for one reason, and it is a measurement, not a preference.
 *
 * `reachableFrom` re-walked the whole graph on every call and `importsOf` re-read and
 * re-regexed every file on every visit. The nine call sites below ask for
 * `MediaPlayerSurface.tsx` six times and `MediaWorkspace.tsx` twice, so the suite did
 * eight full graph walks to answer four questions — 1.1s to 2.4s per case run alone.
 * Under a full `vitest run`, where eight workers contend for the same disk, that is
 * exactly the shape that blows the 20s per-test timeout and gets reported as a product
 * regression; this suite was one of four named that way on 2026-09-02, and
 * `deletedPlayerDependents`/`sourceNulBytes` were repaired the same way at 084dcfea.
 * Reading the tree once removes the cause instead of hiding it behind a bigger timeout.
 *
 * Caching is safe here because nothing under test mutates a source file mid-run: every
 * case reads the same committed tree. The controls below still walk through these very
 * functions, so a cache that returned nothing would fail them rather than pass emptily.
 */
const graphCache = new Map<string, Set<string>>();

function reachableFrom(entry: string): Set<string> {
  const cached = graphCache.get(entry);
  if (cached) return cached;
  const seen = new Set<string>();
  const queue = [resolve(REPO, entry)];
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of importsOf(file)) {
      const resolved = resolveModule(specifier, file);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  // A walk that reached only its own entry means the resolver broke, not that the graph
  // is small — and every `toEqual([])` below would then pass for the wrong reason.
  if (seen.size < 2) {
    throw new Error(`the import walk from ${entry} reached ${seen.size} file(s) — the walker is broken, not the graph`);
  }
  graphCache.set(entry, seen);
  return seen;
}

function asRepoPaths(files: Set<string>): string[] {
  return [...files].map((f) => relative(REPO, f).replace(/\\/g, '/'));
}

/**
 * The anime-library SCREENS — the part the split genuinely excludes. Deliberately not a
 * list of "heavy things": `media-entry-card`, torrent-search, debrid and playlists all
 * arrive via `video-core` regardless of this split, and asserting their absence would be
 * asserting something false.
 */
const LIBRARY_SCREENS = [
  'anime-library/_screens/library-view',
  'anime-library/_containers/library-collection',
  'anime-library/_lib/handle-library-collection',
];

function libraryHits(entry: string): string[] {
  return asRepoPaths(reachableFrom(entry))
    .filter((p) => LIBRARY_SCREENS.some((h) => p.includes(h)));
}

/*
 * Warm both graphs ONCE, in a hook, before any case runs.
 *
 * Memoising the walk removed eight redundant passes, but it also concentrated the whole
 * remaining cost into whichever case ran first — and under a full `vitest run` that case then
 * blew the 20s per-test timeout at 31,065ms, which is the exact failure mode this repair exists
 * to remove. Cost that belongs to the whole file belongs in a hook, where it is charged once and
 * named, rather than billed to an arbitrary case that then reads as a product regression.
 * 120s, generous on purpose: a hook that times out fails the FILE and prints no per-case line,
 * so it is the one budget that must not be tight.
 */
beforeAll(() => {
  reachableFrom('src/media/MediaPlayerSurface.tsx');
  reachableFrom('src/media/MediaWorkspace.tsx');
}, 120_000);

describe('MediaPlayerSurface — the pure capability', () => {
  it('reaches StudyPlayerSlice through the shared shell', () => {
    const reachable = asRepoPaths(reachableFrom('src/media/MediaPlayerSurface.tsx'));
    expect(reachable).toContain('src/media/StudyPlayerSlice.tsx');
    expect(reachable).toContain('src/media/MediaSurfaceShell.tsx');
  });

  it('reaches none of the anime-library screens', () => {
    expect(libraryHits('src/media/MediaPlayerSurface.tsx')).toEqual([]);
  });

  it('does not import the legacy player', () => {
    // Routing Blanc onto this surface is pointless if the surface itself pulls the file
    // the slice exists to make deletable.
    const reachable = asRepoPaths(reachableFrom('src/media/MediaPlayerSurface.tsx'));
    expect(reachable.filter((p) => p.includes('components/media/MediaContent'))).toEqual([]);
  });

  it('matches the full workspace now that the workspace is player-only', () => {
    // 2026-09-23: the Media Center became the one media library and `MediaWorkspace` dropped
    // the adopted anime library screen, so the two trees are the same player. Measured here
    // rather than assumed, as the note this replaced asked.
    const ws = reachableFrom('src/media/MediaWorkspace.tsx');
    const ps = reachableFrom('src/media/MediaPlayerSurface.tsx');
    const avoided = [...ws].filter((f) => !ps.has(f));

    expect(asRepoPaths(ws).some((p) => p.includes('library-view'))).toBe(false);
    expect(avoided.length).toBeLessThan(5);
  });
});

describe('the walker can actually see the thing it reports on', () => {
  it('finds the library subtree from the library screen itself', () => {
    // The control. A resolver that silently returned null for everything would make the
    // assertions above pass on any input; this fails if the walk stops working. (It used to
    // start at MediaWorkspace, which no longer reaches the library at all.)
    const hits = libraryHits('vendor/seanime-web/app/(main)/_features/anime-library/_screens/library-view.tsx');
    expect(hits.some((p) => p.includes('library-collection'))).toBe(true);
  });

  it('confirms video-core is what drags the rest in, not the library', () => {
    // The finding that corrected the plan. Both surfaces reach media-preview-modal; the
    // player's path to it goes through video-core, so excluding the library cannot help.
    const ps = asRepoPaths(reachableFrom('src/media/MediaPlayerSurface.tsx'));
    expect(ps.some((p) => p.includes('media-preview-modal'))).toBe(true);
    expect(ps.some((p) => p.includes('torrent-search'))).toBe(true);
  });

  it('resolves the @/ alias to the vendored checkout', () => {
    const resolved = resolveModule('@/lib/server/client-id', resolve(REPO, 'src/media/x.ts'));
    expect(resolved === null ? null : relative(REPO, resolved).replace(/\\/g, '/'))
      .toBe('vendor/seanime-web/lib/server/client-id.ts');
  });
});

describe('the two surfaces share one provider stack', () => {
  it('both compose MediaSurfaceShell rather than building their own', () => {
    // Two copies of the stack are two chances to disagree about the QueryClient, the
    // websocket and the auth token. `mediaWorkspaceAvailability.ts` exists because this
    // track already paid for that shape once.
    for (const file of ['src/media/MediaWorkspace.tsx', 'src/media/MediaPlayerSurface.tsx']) {
      const source = readFileSync(resolve(REPO, file), 'utf8');
      expect(source).toContain("from './MediaSurfaceShell'");
      expect(source).not.toContain('QueryClientProvider');
      expect(source).not.toContain('StudyWebsocketProvider');
    }
  });
});
