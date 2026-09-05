// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImmersionSitesStore } from '../../shared/immersion';

const fixture = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({
  app: { getPath: () => fixture.root },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
}));
vi.mock('../immersion/visualNovels', () => ({ registerVisualNovelIpc: vi.fn() }));

import { recordVisitFromBridge } from '../immersion';

const url = 'https://example.org/reading';
const readSites = (): ImmersionSitesStore => JSON.parse(
  fs.readFileSync(path.join(fixture.root, 'immersion', 'sites.json'), 'utf8'),
);

beforeEach(() => {
  fixture.root = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-visit-persistence-'));
});
afterEach(() => {
  // Only the temporary store created by this test; never the application's userData.
  fs.rmSync(fixture.root, { recursive: true, force: true });
});

describe('persisted arrivals versus reading accumulations', () => {
  it('banks repeated five-second flushes without inventing visits', () => {
    expect(recordVisitFromBridge({ url }).ok).toBe(true);
    for (let i = 0; i < 3; i += 1) {
      expect(recordVisitFromBridge({ url, seconds: 5, chars: 10, countVisit: false }).ok).toBe(true);
    }
    expect(readSites().sites).toHaveLength(1);
    expect(readSites().sites[0]).toMatchObject({ visitCount: 1, totalSeconds: 15, totalChars: 30 });
    // Positive control: a later arrival from the extension still increments the same row.
    recordVisitFromBridge({ url });
    expect(readSites().sites[0]).toMatchObject({ visitCount: 2, totalSeconds: 15, totalChars: 30 });
  });

  it('retains a first accumulation without counting it as an arrival', () => {
    recordVisitFromBridge({ url, seconds: 5, countVisit: false });
    expect(readSites().sites[0]).toMatchObject({ visitCount: 0, totalSeconds: 5 });
    recordVisitFromBridge({ url, countVisit: true });
    expect(readSites().sites[0]).toMatchObject({ visitCount: 1, totalSeconds: 5 });
  });

  it('rejects a malformed URL without rewriting the last saved sites', () => {
    recordVisitFromBridge({ url });
    const before = readSites();
    expect(recordVisitFromBridge({ url: 'javascript:alert(1)' }).ok).toBe(false);
    expect(readSites()).toEqual(before);
  });
});
