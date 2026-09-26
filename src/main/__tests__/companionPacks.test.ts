// @vitest-environment node
/**
 * Imported companion sprite packs, end to end on a real temp directory: a .zip
 * or folder goes in, validated frames come out under `<root>/<id>/`, and the
 * IPC channels list / rename / delete them. The zip-slip case proves nothing is
 * ever written outside the store, whatever the archive claims.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

const env = vi.hoisted(() => ({
  userData: '',
  handlers: new Map<string, Handler>(),
  picked: [] as string[],
  sent: [] as string[],
}));

vi.mock('electron', () => ({
  app: { getPath: () => env.userData },
  ipcMain: {
    handle: (channel: string, handler: Handler) => {
      env.handlers.set(channel, handler);
    },
  },
  dialog: {
    showOpenDialog: async () => ({ canceled: env.picked.length === 0, filePaths: env.picked }),
  },
  BrowserWindow: {
    fromWebContents: () => null,
    getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: (c: string) => env.sent.push(c) } }],
  },
}));
vi.mock('../i18n', () => ({ mt: (k: string) => k }));
vi.mock('../errorLog', () => ({ logDiagnostic: () => undefined }));

import {
  COMPANION_PACK_CHANNELS,
  importCompanionPacks,
  listCompanionPacks,
  registerCompanionPacksIpc,
  removeCompanionPack,
  renameCompanionPack,
  resolveCompanionPackFrameFile,
  resolveImportSource,
} from '../companionPacks';
import { REQUIRED_STANDARD_FRAMES } from '../../shared/companionPacks';
import { resolveAppAsset } from '../appProtocolResolve';

/** A real, decodable 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let tmp: string;
let root: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gum-petpacks-'));
  env.userData = path.join(tmp, 'userData');
  root = path.join(env.userData, 'companion-packs');
  env.handlers.clear();
  env.picked = [];
  env.sent = [];
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function shimejiZip(file: string, extra: (zip: AdmZip) => void = () => undefined): string {
  const zip = new AdmZip();
  for (const f of REQUIRED_STANDARD_FRAMES) zip.addFile(`Kitsune/img/${f}`, PNG);
  zip.addFile('Kitsune/img/notes.txt', Buffer.from('hello'));
  zip.addFile('Kitsune/img/shime40.png', Buffer.from('this is not really a png'));
  zip.addFile(
    'Kitsune/conf/actions.xml',
    Buffer.from('<Action Name="Walk" Type="Move"><Animation><Pose Image="/shime3.png"/><Pose Image="/shime2.png"/></Animation></Action>'),
  );
  extra(zip);
  const out = path.join(tmp, file);
  zip.writeZip(out);
  return out;
}

describe('importCompanionPacks', () => {
  it('imports a Shimeji zip into its own folder, re-named, with actions.xml applied', () => {
    const res = importCompanionPacks(shimejiZip('kitsune.zip'), root, 42);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const [pack] = res.packs;
    expect(pack.name).toBe('Kitsune');
    expect(pack.source).toBe('shimeji');
    expect(pack.sequences.walk).toEqual(['shime3.png', 'shime2.png']);
    // The fake PNG is dropped by its bytes; the txt was never a frame.
    expect(res.skipped).toBe(1);
    expect(pack.frames).not.toContain('shime40.png');
    const dir = path.join(root, pack.id);
    expect(fs.readdirSync(dir).sort()).toEqual([...REQUIRED_STANDARD_FRAMES, 'manifest.json'].sort());
    // Nothing left behind from staging.
    expect(fs.readdirSync(root)).toEqual([pack.id]);
  });

  it('refuses a zip-slip archive and writes nothing anywhere', () => {
    const zipPath = shimejiZip('evil.zip');
    // AdmZip normalises names on add, so the traversal entry is patched into the raw archive.
    const raw = fs.readFileSync(zipPath);
    const needle = Buffer.from('Kitsune/img/notes.txt');
    const evil = Buffer.from('../../../../../ev.png');
    let at = raw.indexOf(needle);
    expect(at).toBeGreaterThan(0);
    while (at >= 0) {
      evil.copy(raw, at);
      at = raw.indexOf(needle, at + 1);
    }
    fs.writeFileSync(zipPath, raw);
    const res = importCompanionPacks(zipPath, root);
    expect(res).toEqual({ ok: false, error: 'not-a-pack' });
    expect(fs.existsSync(root) ? fs.readdirSync(root) : []).toEqual([]);
    expect(fs.existsSync(path.join(tmp, 'ev.png'))).toBe(false);
  });

  it('imports a plain folder of named frames, picked through any image inside it', () => {
    const dir = path.join(tmp, 'My Pet');
    fs.mkdirSync(dir);
    for (const f of ['stand.png', 'walk-1.png', 'walk-2.png', 'sit.png']) fs.writeFileSync(path.join(dir, f), PNG);
    expect(resolveImportSource(path.join(dir, 'walk-1.png'))).toEqual({ kind: 'folder', path: dir });
    const res = importCompanionPacks(path.join(dir, 'walk-1.png'), root);
    expect(res.ok && res.packs[0].source).toBe('frames');
    expect(res.ok && res.packs[0].sequences.walk).toEqual(['walk-1.png', 'walk-2.png']);
    expect(res.ok && res.packs[0].name).toBe('My Pet');
  });

  it('steps out of img/<Name>/ to the pack root when an image there is picked', () => {
    const base = path.join(tmp, 'Bundle');
    fs.mkdirSync(path.join(base, 'img', 'Alpha'), { recursive: true });
    expect(resolveImportSource(path.join(base, 'img', 'Alpha', 'x.png'))).toBeNull();
    fs.writeFileSync(path.join(base, 'img', 'Alpha', 'shime1.png'), PNG);
    expect(resolveImportSource(path.join(base, 'img', 'Alpha', 'shime1.png'))).toEqual({ kind: 'folder', path: base });
  });

  it('says why a folder is not a pack', () => {
    const dir = path.join(tmp, 'photos');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'holiday.png'), PNG);
    expect(importCompanionPacks(dir, root)).toEqual({ ok: false, error: 'no-frames' });
  });
});

describe('list / rename / delete', () => {
  it('round-trips through the store and serves frames only from inside it', () => {
    const res = importCompanionPacks(shimejiZip('a.zip'), root);
    if (!res.ok) throw new Error('import failed');
    const id = res.packs[0].id;
    expect(listCompanionPacks(root).map((p) => p.id)).toEqual([id]);

    expect(renameCompanionPack(id, '  Fox friend  ', root)).toBe(true);
    expect(listCompanionPacks(root)[0].name).toBe('Fox friend');
    expect(renameCompanionPack('../x', 'y', root)).toBe(false);

    expect(resolveCompanionPackFrameFile(`localfile://pet/${id}/shime1.png`, root)).toBe(path.join(root, id, 'shime1.png'));
    expect(resolveCompanionPackFrameFile(`localfile://pet/${id}/manifest.json`, root)).toBeNull();
    expect(resolveCompanionPackFrameFile(`localfile://pet/${id}/%2e%2e%2f%2e%2e%2fsecret.png`, root)).toBeNull();

    expect(removeCompanionPack('..', root)).toBe(false);
    expect(removeCompanionPack(id, root)).toBe(true);
    expect(listCompanionPacks(root)).toEqual([]);
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it('sweeps a staging folder left by a crash and ignores hand-made junk', () => {
    fs.mkdirSync(path.join(root, '.staging-half-1234abcd'), { recursive: true });
    fs.mkdirSync(path.join(root, 'not-a-pack-dir'), { recursive: true });
    expect(listCompanionPacks(root)).toEqual([]);
    expect(fs.existsSync(path.join(root, '.staging-half-1234abcd'))).toBe(false);
  });
});

describe('IPC', () => {
  it('registers list / import / rename / remove and broadcasts changes', async () => {
    registerCompanionPacksIpc();
    const call = (ch: string, ...args: unknown[]) => {
      const handler = env.handlers.get(ch);
      if (!handler) throw new Error(`no handler for ${ch}`);
      return handler({ sender: {} }, ...args);
    };
    expect(await call(COMPANION_PACK_CHANNELS.import, {})).toEqual({ ok: false, error: 'cancelled' });

    env.picked = [shimejiZip('ipc.zip')];
    const res = (await call(COMPANION_PACK_CHANNELS.import, {})) as { ok: boolean; packs: { id: string }[] };
    expect(res.ok).toBe(true);
    expect(env.sent).toEqual([COMPANION_PACK_CHANNELS.changed]);
    const id = res.packs[0].id;

    const listed = (await call(COMPANION_PACK_CHANNELS.list)) as { id: string }[];
    expect(listed.map((p) => p.id)).toEqual([id]);
    expect(await call(COMPANION_PACK_CHANNELS.rename, id, 'Renamed')).toBe(true);
    expect(await call(COMPANION_PACK_CHANNELS.remove, id)).toBe(true);
    expect(await call(COMPANION_PACK_CHANNELS.remove, id)).toBe(false);
    expect(await call(COMPANION_PACK_CHANNELS.list)).toEqual([]);
    expect(env.sent.length).toBe(3);
  });
});

describe('app:// private public overlay', () => {
  const roots = { rendererRoot: path.resolve('/app/r'), publicRoot: path.resolve('/app/public') };
  const priv = path.resolve('/app/private-assets/public');

  it('serves an owner file from private-assets/public after public/', () => {
    const exists = (p: string) => p === path.join(priv, 'x.png');
    expect(resolveAppAsset({ ...roots, privatePublicRoot: priv }, '/x.png', exists)).toEqual({
      kind: 'file',
      path: path.join(priv, 'x.png'),
    });
  });

  it('is simply missing in a public clone', () => {
    expect(resolveAppAsset({ ...roots, privatePublicRoot: priv }, '/x.png', () => false)).toEqual({ kind: 'missing', rel: '/x.png' });
    expect(resolveAppAsset(roots, '/x.png', () => false)).toEqual({ kind: 'missing', rel: '/x.png' });
  });

  it('never lets a traversal reach outside it', () => {
    const exists = () => true;
    const r = resolveAppAsset({ rendererRoot: '/nope', publicRoot: '/nope2', privatePublicRoot: priv }, '/../../secret.txt', (p) =>
      p.startsWith(priv) ? exists() : false,
    );
    expect(r.kind).not.toBe('file');
  });
});
