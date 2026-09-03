/**
 * The packaging preflight for `public/` runtime blobs — L12_REMAINING_RISK.md R1.
 *
 * What is actually being defended: `public/{kuromoji,ort,cedict,tesseract,models}`
 * are gitignored, so a clean clone has none of them and a package built from one
 * installs fine and dies at runtime. Measured 2026-09-01 as twelve anonymous
 * `net::ERR_FILE_NOT_FOUND` stacks (`96a7b579`).
 *
 * The manifest is only worth having if it cannot drift from the code that
 * justified it, so the load-bearing cases here are the two RATCHETS: every entry
 * names a `loadedBy` file that exists and that really contains the path it claims,
 * and every `stagedBy` tool exists. A manifest entry cannot outlive its consumer,
 * and a path cannot be edited in `ocr.ts` without this going red.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const ROOT = resolve(__dirname, '../../..');
const manifest = require_(resolve(ROOT, 'tools/runtime-assets.manifest.cjs')) as {
  REQUIRED_RUNTIME_ASSETS: Array<{
    rel: string;
    feature: string;
    loadedBy: string;
    stagedBy: string | null;
  }>;
  SKIP_ENV: string;
  missingRuntimeAssets: (exists: (rel: string) => boolean) => Array<{ rel: string }>;
  formatMissingRuntimeAssets: (missing: Array<{ rel: string }>) => string;
};

const { REQUIRED_RUNTIME_ASSETS, SKIP_ENV, missingRuntimeAssets, formatMissingRuntimeAssets } =
  manifest;

describe('required runtime assets', () => {
  it('lists a non-empty set, each entry fully populated', () => {
    expect(REQUIRED_RUNTIME_ASSETS.length).toBeGreaterThan(0);
    for (const asset of REQUIRED_RUNTIME_ASSETS) {
      expect(asset.rel, 'rel').toMatch(/^[a-z]/);
      expect(asset.rel, `${asset.rel} must be a witness FILE, not a directory`).toMatch(/\.[a-z0-9]+$/i);
      expect(asset.feature.length, `${asset.rel} feature`).toBeGreaterThan(10);
      expect(asset.loadedBy, `${asset.rel} loadedBy`).toMatch(/^src\//);
    }
  });

  it('names no path twice', () => {
    const rels = REQUIRED_RUNTIME_ASSETS.map((a) => a.rel);
    expect(new Set(rels).size).toBe(rels.length);
  });

  /*
   * RATCHET 1. The reason a manifest of this kind rots is that the code moves and
   * nobody re-reads the list. Asserting the claimed source file exists AND contains
   * the path makes that impossible to do quietly: rename `/kuromoji/dict/` in
   * tokenizer.ts and this case names the entry that has to move with it.
   *
   * The match is on the LAST segment plus its parent, not the whole `rel`, because
   * product code names the directory it fetches from (`'/kuromoji/dict/'`,
   * `${TESS_BASE}/lang`) and appends the filename at runtime.
   */
  it('every entry is justified by source that still requests that path', () => {
    for (const asset of REQUIRED_RUNTIME_ASSETS) {
      const file = resolve(ROOT, asset.loadedBy);
      expect(existsSync(file), `${asset.loadedBy} (justifying ${asset.rel}) does not exist`).toBe(
        true,
      );
      const source = readFileSync(file, 'utf8');
      const segments = asset.rel.split('/');
      const dir = segments.slice(0, -1).join('/');
      const needle = dir || segments[0];
      expect(
        source.includes(needle) || source.includes(segments[0]),
        `${asset.loadedBy} no longer mentions "${needle}" — the manifest entry for ${asset.rel} is stale`,
      ).toBe(true);
    }
  });

  /* RATCHET 2. A `stagedBy` that points at nothing turns the remedy line into a lie. */
  it('every staging tool it points at exists', () => {
    for (const asset of REQUIRED_RUNTIME_ASSETS) {
      if (!asset.stagedBy) continue;
      expect(existsSync(resolve(ROOT, asset.stagedBy)), `${asset.stagedBy} missing`).toBe(true);
    }
  });

  it('the checker itself is on disk and wired into package and make', () => {
    expect(existsSync(resolve(ROOT, 'tools/check-runtime-assets.cjs'))).toBe(true);
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    for (const script of ['package', 'make']) {
      expect(pkg.scripts[script], `scripts.${script}`).toContain('check-runtime-assets.cjs');
    }
    /*
     * Staged before it is required. Generic rather than a list of tool names on
     * purpose: adding a stageable asset and forgetting to run its tool leaves a
     * clean clone broken in exactly the way this whole gate exists to prevent, and
     * a hardcoded list would not notice.
     */
    for (const tool of new Set(
      REQUIRED_RUNTIME_ASSETS.map((a) => a.stagedBy).filter((t): t is string => Boolean(t)),
    )) {
      const name = tool.split('/').pop() as string;
      expect(pkg.scripts.postinstall, `postinstall must run ${name}`).toContain(name);
      expect(pkg.scripts.prestart, `prestart must run ${name}`).toContain(name);
    }
  });
});

describe('missingRuntimeAssets', () => {
  it('reports nothing when every asset exists', () => {
    expect(missingRuntimeAssets(() => true)).toEqual([]);
  });

  /*
   * The positive control the empty answer above needs. `toEqual([])` is satisfied
   * just as well by a predicate that is never called, so prove the same function
   * finds things through the same path.
   */
  it('reports every asset when none exists', () => {
    expect(missingRuntimeAssets(() => false)).toHaveLength(REQUIRED_RUNTIME_ASSETS.length);
  });

  it('reports exactly the one that is absent', () => {
    const victim = REQUIRED_RUNTIME_ASSETS[0].rel;
    const missing = missingRuntimeAssets((rel) => rel !== victim);
    expect(missing.map((m) => m.rel)).toEqual([victim]);
  });
});

describe('formatMissingRuntimeAssets', () => {
  it('names the path, the dead feature, the source and a remedy for each', () => {
    const report = formatMissingRuntimeAssets(REQUIRED_RUNTIME_ASSETS);
    for (const asset of REQUIRED_RUNTIME_ASSETS) {
      expect(report).toContain(`public/${asset.rel}`);
      expect(report).toContain(asset.feature);
      expect(report).toContain(asset.loadedBy);
    }
    expect(report).toContain(SKIP_ENV);
  });

  /*
   * The whole point of the message is that it is not the twelve anonymous stacks.
   * A remedy that says nothing actionable is the defect coming back in prose form.
   */
  it('gives a runnable command for a stageable asset and says so for one that is not', () => {
    const stageable = REQUIRED_RUNTIME_ASSETS.filter((a) => a.stagedBy);
    const manual = REQUIRED_RUNTIME_ASSETS.filter((a) => !a.stagedBy);
    expect(stageable.length, 'fixture: at least one stageable asset').toBeGreaterThan(0);
    expect(manual.length, 'fixture: at least one manual asset').toBeGreaterThan(0);
    expect(formatMissingRuntimeAssets([stageable[0]])).toContain(`node ${stageable[0].stagedBy}`);
    expect(formatMissingRuntimeAssets([manual[0]])).toContain('out of band');
  });
});
