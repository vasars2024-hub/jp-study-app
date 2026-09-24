// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildFilesIndex, FILES_ENUMERATORS } from '../filesApp/enumerators';
import { filesOpenDecision } from '../../shared/filesApp/openPlan';
import { VISUAL_NOVEL_DATABASE_FILE } from '../../shared/visualNovel';

let root = '';
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'files-vn-'));
});
afterEach(() => {
  // Only this test's temporary profile.
  fs.rmSync(root, { recursive: true, force: true });
});

describe('the Files app Visual Novels shelf', () => {
  it('lists every novel in the library, where it read a permanent 0 before', () => {
    const file = path.join(root, ...VISUAL_NOVEL_DATABASE_FILE.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      version: 1,
      entries: [
        { id: 'vn-a', title: 'Steins;Gate', japaneseTitle: 'シュタインズ・ゲート', createdAt: 5, updatedAt: 9, lastPlayedAt: 7 },
        { id: 'vn-b', title: 'Clannad' },
      ],
      captures: [],
    }));
    const snapshot = buildFilesIndex({ userDataPath: root });
    const rows = snapshot.items.filter((item) => item.kind === 'visual-novel');
    expect(rows.map((row) => row.name).sort()).toEqual(['Clannad', 'Steins;Gate (シュタインズ・ゲート)']);
    expect(rows.every((row) => row.categoryId === 'sources/visual-novels')).toBe(true);
    const report = snapshot.enumerators.find((entry) => entry.source === 'visual-novels');
    expect(report).toMatchObject({ itemCount: 2 });
    expect(report?.error).toBeUndefined();
    expect(FILES_ENUMERATORS.some((entry) => entry.source === 'visual-novels')).toBe(true);
  });

  it('opens a visual novel row in the Visual Novels app, not the reading planner', () => {
    const decision = filesOpenDecision({
      kind: 'visual-novel',
      location: { store: 'json', file: VISUAL_NOVEL_DATABASE_FILE, pointer: '/entries/vn-a' },
    }, null);
    expect(decision).toMatchObject({ mode: 'open', section: 'visualnovels' });
  });

  it('reads an empty profile as zero rows, not an error', () => {
    const snapshot = buildFilesIndex({ userDataPath: root });
    expect(snapshot.items.filter((item) => item.kind === 'visual-novel')).toEqual([]);
    expect(snapshot.enumerators.find((entry) => entry.source === 'visual-novels')?.error).toBeUndefined();
  });
});
