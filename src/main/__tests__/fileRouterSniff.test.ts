// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { DropCandidate } from '../../shared/fileRouting';

/**
 * Content sniffing for a dropped `.json`.
 *
 * `shared/fileRouting.ts` leaves `.json` ambiguous between backup, frequency
 * dictionary and VN library on the extension alone; `planForPath` then reads the
 * file and may collapse that to a single **exact** candidate. An exact candidate
 * is what the drop router auto-routes with nothing to confirm, so a mis-sniff
 * here is silent — which is why these cases are pinned.
 *
 * The `package.json` case is a live regression, observed on 2026-08-11 by
 * classifying this repository's own `package.json` through the running app: a
 * bare top-level `scripts` key confirmed it as a VN script.
 */

vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined, on: () => undefined },
}));

const { planForPath } = await import('../fileRouter');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-filerouter-sniff-'));

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Write a JSON fixture and return its plan's candidates, in order. */
function planFor(name: string, body: unknown): DropCandidate[] {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(body), 'utf8');
  return planForPath(file).candidates;
}

/** Just the targets, for the cases that only care about the ranking. */
function targetsFor(name: string, body: unknown): string[] {
  return planFor(name, body).map((c) => c.target);
}

describe('planForPath JSON sniffing', () => {
  it('does not confirm an npm package.json as a VN script', () => {
    const candidates = planFor('package.json', {
      name: 'jp-study-app',
      version: '1.0.0',
      scripts: { start: 'electron-forge start', test: 'vitest run' },
    });
    // The point is not that `vn-script` disappears — the extension-level
    // ranking legitimately offers it as one of three. The point is that
    // nothing is *confirmed*, so the drop router still asks.
    expect(candidates.map((c) => c.confidence)).not.toContain('exact');
    expect(candidates.map((c) => c.target)).toEqual(
      expect.arrayContaining(['backup', 'frequency-dict', 'vn-script']),
    );
  });

  it('still confirms a VN library that lists its scripts as an array', () => {
    expect(targetsFor('vn-array.json', { scripts: [{ id: 'a', lines: [] }] })).toEqual([
      'vn-script',
    ]);
  });

  it('confirms a VN library by its distinctive keys', () => {
    expect(targetsFor('vn-novels.json', { novels: [] })).toEqual(['vn-script']);
    expect(targetsFor('vn-scenes.json', { scenes: [] })).toEqual(['vn-script']);
  });

  it('confirms a settings backup by its export envelope', () => {
    expect(targetsFor('backup.json', { schemaVersion: 4, exportedAt: '2026-08-11' })).toEqual([
      'backup',
    ]);
  });

  it('confirms a top-level array as a frequency list', () => {
    expect(targetsFor('freq.json', [['語', 'freq', 12]])).toEqual(['frequency-dict']);
  });

  it('leaves a JSON it cannot recognise ambiguous', () => {
    const targets = targetsFor('mystery.json', { unrelated: true });
    expect(targets).toEqual(expect.arrayContaining(['backup', 'frequency-dict', 'vn-script']));
  });

  it('never throws on a path that does not exist', () => {
    const plan = planForPath(path.join(dir, 'absent.json'));
    expect(plan.candidates.map((c) => c.target)).toEqual(['unknown']);
  });
});
