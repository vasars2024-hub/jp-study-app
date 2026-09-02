// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * A BANKED SHA256 MUST NAME A FILE ONLY ITS OWN RUN CAN WRITE.
 *
 * `l12-visual-matrix.cjs` used to name a plate by its four dimension coordinates alone —
 * `<app>__<presentation>__<theme>__<state>.png` — with nothing about which run produced it.
 * Any two runs sharing a coordinate wrote the same path, the later one destroyed the earlier
 * image, and the earlier manifest went on asserting a sha256 for bytes that no longer existed.
 * The manifest stays green; the evidence under it is gone. That is the worst shape a
 * measurement defect can take here, because every downstream check reads the manifest.
 *
 * MEASURED ON THE COMMITTED BASELINES, three instruments agreeing on one number:
 * 22 plate paths appear in more than one manifest, 21 of them with conflicting hashes, all 21
 * `oled-black`, all 21 stale for `l12-matrix-normal.json`, and all 21 on-disk hashes equal to
 * `l12-matrix-tries40.json`'s own recorded hashes. So the clobber is identified, not inferred.
 *
 * And the detail that rules out the comfortable reading: of those 21, **16 were
 * `converged: true` in BOTH runs** — each settled on three consecutive byte-identical frames,
 * twice, and still produced different images. Convergence does not make a plate reproducible
 * across runs, so "only the flaky cells got overwritten" is false; 16 fully-converged plates
 * were destroyed. The 22nd shared path (`settings__liquid__oled-black__normal.png`) is the
 * lone re-shot that reproduced byte-for-byte, which is why 22 shared and 21 conflict.
 *
 * The harness now writes plates under a per-run directory. This case is the ratchet: the
 * legacy three are frozen at their known damage, and every manifest produced from here on
 * must carry a run identity and keep its plates inside it.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const BASELINES = join(REPO, 'src', '.coordination', 'liquid-workplace', 'baselines');
const HARNESS = join(REPO, 'src', '.coordination', 'liquid-workplace', 'probes', 'l12-visual-matrix.cjs');

/**
 * The three runs that predate the fix. Their plates are already clobbered and cannot be
 * un-clobbered — the images are gone — so they are listed by name rather than repaired.
 * Anything NOT on this list is held to the invariant.
 */
const LEGACY = new Set(['l12-matrix-normal.json', 'l12-matrix-maximized.json', 'l12-matrix-tries40.json']);

type Cell = { ok?: boolean; file?: string; sha256?: string };
type Manifest = { schema?: string; runId?: string; shotDir?: string; cells?: Cell[] };

function matrixManifests(): { name: string; m: Manifest }[] {
  return readdirSync(BASELINES)
    .filter((n) => n.endsWith('.json'))
    .map((name) => ({ name, m: JSON.parse(readFileSync(join(BASELINES, name), 'utf8')) as Manifest }))
    .filter((e) => e.m.schema === 'l12-visual-matrix/v1');
}

describe('L12 matrix plates carry a run identity', () => {
  it('the harness composes the plate directory from a run id, not from the dimensions alone', () => {
    const src = readFileSync(HARNESS, 'utf8');

    // The composition itself. A run-scoped DIRECTORY rather than a run-tagged FILENAME is the
    // load-bearing choice: a filename that encodes the run is still one namespace, so a re-run
    // with identical flags collides again.
    expect(src).toMatch(/const SHOT_DIR = path\.join\(SHOT_ROOT, RUN_ID\)/);

    // The default has to be unique WITHOUT being asked for, because every clobbered plate
    // above came from a caller who never considered the question. `--run-id` pins one
    // deliberately; it must not be the only thing standing between two runs.
    expect(src).toMatch(/const RUN_ID = arg\('run-id', ''\)\s*\|\|/);
    expect(src).toContain('process.pid');

    // And the identity has to reach the manifest, or a later integrity check can only guess
    // which directory a set of hashes belongs to.
    expect(src).toContain('runId: RUN_ID');
  });

  it('every non-legacy matrix manifest declares a run id and keeps its plates inside it', () => {
    const offenders = matrixManifests()
      .filter((e) => !LEGACY.has(e.name))
      .flatMap(({ name, m }) => {
        if (!m.runId || !m.shotDir) return [`${name}: no runId/shotDir — written by the pre-fix harness?`];
        return (m.cells || [])
          .filter((c) => c.file && !c.file.startsWith(`${m.shotDir}/`))
          .map((c) => `${name}: ${c.file} is outside its own shotDir ${m.shotDir}`);
      });

    expect(offenders).toEqual([]);
  });

  it('no plate path is claimed by two manifests with different bytes', () => {
    const byPath = new Map<string, { name: string; sha: string }[]>();
    for (const { name, m } of matrixManifests()) {
      for (const c of m.cells || []) {
        if (!c.ok || !c.file || !c.sha256) continue;
        const rows = byPath.get(c.file) || [];
        rows.push({ name, sha: c.sha256 });
        byPath.set(c.file, rows);
      }
    }

    const conflicts = [...byPath.entries()]
      .filter(([, rows]) => rows.length > 1 && new Set(rows.map((r) => r.sha)).size > 1)
      // A conflict entirely among the three legacy runs is the known, unrepairable damage
      // this case documents. A conflict that touches anything else is a live regression.
      .filter(([, rows]) => rows.some((r) => !LEGACY.has(r.name)));

    expect(conflicts.map(([file]) => file)).toEqual([]);
  });

  it('records the legacy damage as a frozen number, so it cannot quietly grow', () => {
    const legacy = matrixManifests().filter((e) => LEGACY.has(e.name));
    expect(legacy).toHaveLength(3);

    const byPath = new Map<string, { name: string; sha: string }[]>();
    for (const { name, m } of legacy) {
      for (const c of m.cells || []) {
        if (!c.ok || !c.file || !c.sha256) continue;
        byPath.set(c.file, [...(byPath.get(c.file) || []), { name, sha: c.sha256 }]);
      }
    }
    const rows = [...byPath.values()];
    const shared = rows.filter((r) => r.length > 1);
    const conflicting = shared.filter((r) => new Set(r.map((x) => x.sha)).size > 1);

    // 701 distinct plate paths across 723 indexed cells: 22 paths written twice, of which
    // 21 disagree. The 22nd is the single re-shot that reproduced byte-for-byte.
    expect(byPath.size).toBe(701);
    expect(shared.length).toBe(22);
    expect(conflicting.length).toBe(21);
  });
});
