/**
 * `/heap-snapshot` writes a file on the order of a GIGABYTE. The only thing
 * standing between that and a commit is that the caller names the file and
 * never places it, so that is what this asserts — containment, not the regex.
 *
 * Why the route exists at all: measured 2026-09-05 on an idle instance driving
 * nothing (pid 25124, scratch profile), main's `old_space` sat at ~98% of its
 * size, a forced full collection freed 43.7 MB of 711.9, and the major GC
 * blocked main for 477 ms — the magnitude of the 500 ms bar cat7's idle leg
 * keeps failing. `/mem` can say how much is retained and structurally cannot
 * say by what; this route is the missing half.
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { heapSnapshotPath } from '../debugBridge';

const TMP = path.join('C:', 'tmp-fixture');
const NOW = new Date('2026-09-05T20:15:30.123Z');

/** True only if `file` really sits directly inside `dir`. */
function isInside(dir: string, file: string): boolean {
  const rel = path.relative(dir, file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

describe('heapSnapshotPath — the caller names the file, it does not place it', () => {
  it('lands in the given temp directory with a stamped name', () => {
    const p = heapSnapshotPath(TMP, 'idle', NOW);
    expect(isInside(TMP, p)).toBe(true);
    expect(path.basename(p)).toBe('jp-main-heap-idle-2026-09-05T20-15-30-123Z.heapsnapshot');
  });

  it('accepts a missing name and still stamps it', () => {
    for (const name of [undefined, null, '', '   ']) {
      const p = heapSnapshotPath(TMP, name, NOW);
      expect(isInside(TMP, p)).toBe(true);
      expect(path.basename(p)).toBe('jp-main-heap-2026-09-05T20-15-30-123Z.heapsnapshot');
    }
  });

  it('cannot be steered out of the temp directory — the whole point of the route', () => {
    // Every one of these is a way a caller could try to land a gigabyte in the
    // repo. `path.join` alone would let the first two through.
    const attacks = [
      '../../src/renderer/leak',
      '..\\..\\src\\leak',
      'C:\\Users\\Arseniy\\Projects\\jp-study-app\\src\\leak',
      '/etc/passwd',
      './../../leak',
      'a/b/c',
      '..',
      '...',
    ];
    for (const raw of attacks) {
      const p = heapSnapshotPath(TMP, raw, NOW);
      expect(isInside(TMP, p), `escaped with ${JSON.stringify(raw)} -> ${p}`).toBe(true);
      expect(path.dirname(p)).toBe(TMP);
    }
  });

  it('never emits a separator or a drive letter into the file name', () => {
    const p = heapSnapshotPath(TMP, 'C:\\a/b:c', NOW);
    const base = path.basename(p);
    expect(base).not.toMatch(/[\\/:]/);
    expect(base.endsWith('.heapsnapshot')).toBe(true);
  });

  it('bounds the caller-supplied half so a long name cannot blow the path limit', () => {
    const p = heapSnapshotPath(TMP, 'x'.repeat(500), NOW);
    const base = path.basename(p);
    // 60 is the cap on the caller's half; the rest is the fixed prefix/stamp.
    expect(base).toContain('x'.repeat(60));
    expect(base).not.toContain('x'.repeat(61));
  });
});
