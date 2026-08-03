// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Hygiene gate for MASTER_PLAN.md §21's architecture audit, in the same
 * "make the data fail the build" style as the i18n catalog and graded-sentence tests.
 *
 * `tools/architecture-audit.cjs` already exits 1 on an unclassified finding, but a
 * checker only anyone remembers to run is a checker that rots. This puts it on the
 * suite, so growing a new orphan, cycle, layer violation or dead IPC channel fails
 * `vitest` the same way a missing translation does.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
// `__filename`, not `import.meta.url`: this project's tsconfig `module` setting rejects
// import.meta, and tsconfig.json is off-limits per CLAUDE.md.
const require_ = createRequire(__filename);
const { audit } = require_(resolve(ROOT, 'tools', 'architecture-audit.cjs')) as {
  audit: () => { findings: Array<{ kind: string; id: string; detail: string }>; moduleCount: number };
};

const baseline = JSON.parse(
  readFileSync(resolve(ROOT, 'tools', 'architecture-baseline.json'), 'utf8'),
) as {
  entries: Record<string, { status: string; note: string }>;
};

const key = (finding: { kind: string; id: string }) => `${finding.kind}:${finding.id}`;

describe('architecture audit', () => {
  const { findings, moduleCount } = audit();
  const classified = new Set(Object.keys(baseline.entries));

  it('scans the source tree it is supposed to', () => {
    // A resolution bug that silently found nothing would make every other assertion
    // here pass vacuously.
    expect(moduleCount).toBeGreaterThan(500);
  });

  it('has every finding classified — a new one is a failure, not a surprise', () => {
    const unclassified = findings.filter((finding) => !classified.has(key(finding)));
    expect(
      unclassified.map((finding) => `${key(finding)} — ${finding.detail}`),
      'New architecture findings. Judge each one, then add it to tools/architecture-baseline.json '
        + '(or run `node tools/architecture-audit.cjs --update-baseline` and write the notes).',
    ).toEqual([]);
  });

  it('has no stale baseline entries', () => {
    const live = new Set(findings.map(key));
    const stale = [...classified].filter((entry) => !live.has(entry));
    expect(stale, 'Fixed findings still listed in the baseline — remove them.').toEqual([]);
  });

  it('classifies every entry as accepted or pending, with a reason', () => {
    for (const [entry, value] of Object.entries(baseline.entries)) {
      expect(['accepted', 'pending'], `${entry} has an unknown status`).toContain(value.status);
      // An unexplained "accepted" is how a real defect gets silenced permanently.
      expect(value.note.trim().length, `${entry} has no note`).toBeGreaterThan(0);
    }
  });

  it('keeps the structural rules at zero', () => {
    // These were 1, 10 and 3 before the 2026-07-25 cleanup; they are all zero now, so
    // the ratchet is zero. Each is cheap to avoid at write time and expensive to unpick
    // later, which is exactly what makes a hard gate worth the friction.
    const count = (kind: string) => findings.filter((finding) => finding.kind === kind).length;
    expect(count('layer-violation'), 'a new layer violation was introduced').toBe(0);
    expect(count('main-imports-renderer-zone'), 'main-process code reached into a renderer zone').toBe(0);
    expect(count('shared-cycle'), 'a new import cycle in src/shared').toBe(0);
    expect(count('dead-ipc'), 'a new dead IPC channel').toBe(0);
    expect(count('phantom-ipc'), 'an IPC call with no handler').toBe(0);
    expect(count('duplicate-ipc'), 'a channel registered twice').toBe(0);
  });

  it('keeps every storage key and exported name to one owner', () => {
    // The remaining entries of these two kinds are all classified `accepted`; a
    // *pending* one means a key or a name grew a second owner again.
    const stillOpen = findings.filter(
      (finding) =>
        (finding.kind === 'duplicate-storage' || finding.kind === 'duplicate-export')
        && baseline.entries[key(finding)]?.status === 'pending',
    );
    expect(stillOpen.map(key)).toEqual([]);
  });
});
