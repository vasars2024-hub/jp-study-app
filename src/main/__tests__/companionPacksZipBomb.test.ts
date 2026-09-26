// @vitest-environment node
/**
 * A companion-pack .zip is a file the user downloaded from anywhere. The
 * importer's size limits are checked against each entry's DECLARED size, and
 * adm-zip bounds inflation by that same number — except when it is 0, where it
 * inflates with no bound at all. An entry that declares 0 bytes but carries
 * compressed data must therefore never be inflated: a few kilobytes of zeros
 * would otherwise expand to gigabytes inside the main process.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import AdmZip from 'adm-zip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ userData: '' }));

vi.mock('electron', () => ({
  app: { getPath: () => env.userData },
  ipcMain: { handle: () => undefined },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  BrowserWindow: { fromWebContents: () => null, getAllWindows: () => [] },
}));
vi.mock('../i18n', () => ({ mt: (k: string) => k }));
vi.mock('../errorLog', () => ({ logDiagnostic: () => undefined }));

import { importCompanionPacks } from '../companionPacks';
import { COMPANION_PACK_LIMITS, REQUIRED_STANDARD_FRAMES } from '../../shared/companionPacks';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let tmp: string;
let root: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gum-petbomb-'));
  env.userData = path.join(tmp, 'userData');
  root = path.join(env.userData, 'companion-packs');
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Rewrite the uncompressed-size field of every header naming `entry` to `size`. */
function patchDeclaredSize(raw: Buffer, entry: string, size: number): number {
  const name = Buffer.from(entry);
  let patched = 0;
  for (let i = 0; i + 46 < raw.length; i++) {
    const sig = raw.readUInt32LE(i);
    if (sig === 0x02014b50) {
      const nameLen = raw.readUInt16LE(i + 28);
      if (raw.subarray(i + 46, i + 46 + nameLen).equals(name)) {
        raw.writeUInt32LE(size, i + 24);
        patched++;
      }
    } else if (sig === 0x04034b50) {
      const nameLen = raw.readUInt16LE(i + 26);
      if (raw.subarray(i + 30, i + 30 + nameLen).equals(name)) {
        raw.writeUInt32LE(size, i + 22);
        patched++;
      }
    }
  }
  return patched;
}

describe('companion pack zip limits', () => {
  it('never inflates an entry that declares 0 bytes but carries compressed data', () => {
    const zip = new AdmZip();
    for (const f of REQUIRED_STANDARD_FRAMES) zip.addFile(`Bomb/img/${f}`, PNG);
    // 24 MB of zeros deflates to ~24 KB; declared as 0 it is a bomb.
    zip.addFile('Bomb/img/shime40.png', Buffer.alloc(24 * 1024 * 1024));
    const file = path.join(tmp, 'bomb.zip');
    const raw = zip.toBuffer();
    expect(patchDeclaredSize(raw, 'Bomb/img/shime40.png', 0)).toBe(2);
    fs.writeFileSync(file, raw);

    const inflate = vi.spyOn(zlib, 'inflateRawSync');
    const res = importCompanionPacks(file, root);

    const biggest = Math.max(0, ...inflate.mock.results.map((r) => (r.type === 'return' ? (r.value as Buffer).length : 0)));
    expect(biggest).toBeLessThanOrEqual(COMPANION_PACK_LIMITS.maxFileBytes);
    // The honest frames still import; the bomb is simply skipped.
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.packs[0].frames).not.toContain('shime40.png');
  });
});
