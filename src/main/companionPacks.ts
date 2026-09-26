/**
 * Imported desktop-companion sprite packs — main-process store and IPC.
 *
 * A user picks a Shimeji-style .zip, a pack folder, or any image inside one;
 * every character found in it is validated (shared/companionPacks.ts) and copied
 * into `<userData>/companion-packs/<id>/` as re-named frames plus a manifest.
 * The renderer shows the frames through `localfile://pet/<id>/<frame>`
 * (registerLocalFileProtocol in library.ts), never `file:`.
 *
 * A pack appears whole or not at all: its frames and manifest are written into a
 * staging folder that is renamed into place last, so a crash mid-import leaves a
 * `.staging-*` folder the next listing sweeps, never a half pack.
 */
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import {
  COMPANION_PACK_LIMITS,
  buildPackSequences,
  cleanPackName,
  imageProblem,
  isSafeCompanionPackId,
  parseCompanionPackFrameUrl,
  parseCompanionPackManifest,
  planCompanionPackImport,
  type CompanionPackImportResult,
  type CompanionPackManifest,
  type PackSourceEntry,
} from '../shared/companionPacks';
import { atomicWritesFrozen, readJsonSync, writeJsonAtomicSync } from './atomicJson';
import { logDiagnostic } from './errorLog';
import { mt } from './i18n';

export const COMPANION_PACK_CHANNELS = {
  list: 'companionPacks:list',
  import: 'companionPacks:import',
  rename: 'companionPacks:rename',
  remove: 'companionPacks:remove',
  changed: 'companionPacks:changed',
} as const;

const MANIFEST = 'manifest.json';
const STAGING_PREFIX = '.staging-';
const TRASH_PREFIX = '.trash-';

export function companionPacksRoot(): string {
  return path.join(app.getPath('userData'), 'companion-packs');
}

// ---------------------------------------------------------------------------
// Reading a source (folder or zip) behind one interface
// ---------------------------------------------------------------------------

interface PackSource {
  entries: PackSourceEntry[];
  read(entry: string): Buffer | null;
}

function folderSource(root: string): PackSource | null {
  const entries: PackSourceEntry[] = [];
  const walk = (dir: string, rel: string, depth: number): boolean => {
    if (depth > 6) return true;
    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return true;
    }
    for (const it of items) {
      // Links are never followed: a pack folder cannot point the importer elsewhere.
      if (it.isSymbolicLink()) continue;
      const childRel = rel ? `${rel}/${it.name}` : it.name;
      const abs = path.join(dir, it.name);
      if (it.isDirectory()) {
        if (!walk(abs, childRel, depth + 1)) return false;
      } else if (it.isFile()) {
        let size = 0;
        try {
          size = fs.statSync(abs).size;
        } catch {
          continue;
        }
        entries.push({ path: childRel, size });
        if (entries.length > COMPANION_PACK_LIMITS.maxEntries) return false;
      }
    }
    return true;
  };
  if (!walk(root, '', 0)) {
    entries.length = COMPANION_PACK_LIMITS.maxEntries + 1;
  }
  const rootResolved = path.resolve(root);
  return {
    entries,
    read(entry) {
      const abs = path.resolve(rootResolved, entry);
      if (!abs.startsWith(rootResolved + path.sep)) return null;
      try {
        const st = fs.lstatSync(abs);
        if (!st.isFile() || st.size > COMPANION_PACK_LIMITS.maxFileBytes) return null;
        return fs.readFileSync(abs);
      } catch {
        return null;
      }
    },
  };
}

function zipSource(file: string): PackSource | null {
  let zip: AdmZip;
  try {
    if (fs.statSync(file).size > COMPANION_PACK_LIMITS.maxArchiveBytes) return null;
    zip = new AdmZip(file);
  } catch {
    return null;
  }
  const byName = new Map<string, AdmZip.IZipEntry>();
  const entries: PackSourceEntry[] = [];
  for (const e of zip.getEntries()) {
    if (e.isDirectory) continue;
    // The declared size decides whether an entry is read at all, and the read
    // is checked against it again below: a zip bomb is refused before inflating.
    entries.push({ path: e.entryName, size: e.header.size });
    byName.set(e.entryName.replace(/\\/g, '/').replace(/^\.\//, ''), e);
  }
  return {
    entries,
    read(entry) {
      const e = byName.get(entry);
      if (!e || e.header.size > COMPANION_PACK_LIMITS.maxFileBytes) return null;
      try {
        const data = e.getData();
        return data.length > COMPANION_PACK_LIMITS.maxFileBytes ? null : data;
      } catch {
        return null;
      }
    },
  };
}

/**
 * What a picked path imports: a .zip, a folder, or — for a picked image or
 * actions.xml — the pack folder it sits in (stepping out of img/ and conf/).
 */
export function resolveImportSource(picked: string): { kind: 'zip' | 'folder'; path: string } | null {
  let st: fs.Stats;
  try {
    st = fs.statSync(picked);
  } catch {
    return null;
  }
  if (st.isDirectory()) return { kind: 'folder', path: picked };
  if (/\.zip$/i.test(picked)) return { kind: 'zip', path: picked };
  let dir = path.dirname(picked);
  const leaf = () => path.basename(dir).toLowerCase();
  if (leaf() === 'conf') dir = path.dirname(dir);
  else if (path.basename(path.dirname(dir)).toLowerCase() === 'img') dir = path.dirname(path.dirname(dir));
  else if (leaf() === 'img') dir = path.dirname(dir);
  return { kind: 'folder', path: dir };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

function newPackId(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${slug || 'pack'}-${crypto.randomBytes(4).toString('hex')}`;
}

function packDir(root: string, id: string): string | null {
  if (!isSafeCompanionPackId(id)) return null;
  const dir = path.resolve(root, id);
  return dir.startsWith(path.resolve(root) + path.sep) ? dir : null;
}

function sweepLeftovers(root: string): void {
  let names: string[] = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return;
  }
  for (const n of names) {
    if (!n.startsWith(STAGING_PREFIX) && !n.startsWith(TRASH_PREFIX)) continue;
    try {
      fs.rmSync(path.join(root, n), { recursive: true, force: true });
    } catch {
      /* next listing tries again */
    }
  }
}

export function listCompanionPacks(root = companionPacksRoot()): CompanionPackManifest[] {
  sweepLeftovers(root);
  let names: string[] = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return [];
  }
  const out: CompanionPackManifest[] = [];
  for (const n of names) {
    const dir = packDir(root, n);
    if (!dir) continue;
    const manifest = parseCompanionPackManifest(readJsonSync<unknown>(path.join(dir, MANIFEST), null));
    if (!manifest || manifest.id !== n) continue;
    // Only frames still on disk: a pack edited by hand degrades, it does not break.
    const present = manifest.frames.filter((f) => fs.existsSync(path.join(dir, f)));
    const rebuilt = present.length ? parseCompanionPackManifest({ ...manifest, frames: present }) : null;
    if (rebuilt) out.push(rebuilt);
  }
  return out.sort((a, b) => a.importedAt - b.importedAt || a.name.localeCompare(b.name));
}

/** Import every character found at `picked`. Never throws. */
export function importCompanionPacks(
  picked: string,
  root = companionPacksRoot(),
  now = Date.now(),
): CompanionPackImportResult {
  if (atomicWritesFrozen()) return { ok: false, error: 'write-failed' };
  const target = resolveImportSource(picked);
  if (!target) return { ok: false, error: 'unreadable' };
  const source = target.kind === 'zip' ? zipSource(target.path) : folderSource(target.path);
  if (!source) return { ok: false, error: target.kind === 'zip' ? 'not-a-pack' : 'unreadable' };
  const fallbackName = path.basename(target.path).replace(/\.zip$/i, '');
  const plan = planCompanionPackImport(source.entries, fallbackName);
  if (!plan.ok) return plan;

  let skipped = plan.skipped;
  const made: CompanionPackManifest[] = [];
  try {
    fs.mkdirSync(root, { recursive: true });
  } catch {
    return { ok: false, error: 'write-failed' };
  }
  for (const planned of plan.packs) {
    const kept: { stored: string; data: Buffer }[] = [];
    for (const frame of planned.frames) {
      const data = source.read(frame.entry);
      if (!data || imageProblem(data, frame.stored)) {
        skipped++;
        continue;
      }
      kept.push({ stored: frame.stored, data });
    }
    const xml = planned.actionsEntry ? source.read(planned.actionsEntry)?.toString('utf8') : undefined;
    const built = buildPackSequences(kept.map((k) => k.stored), { actionsXml: xml });
    if (!built) {
      skipped++;
      continue;
    }
    const name = cleanPackName(planned.name, fallbackName);
    const id = newPackId(name);
    const manifest: CompanionPackManifest = {
      version: 1,
      id,
      name,
      source: built.source,
      frames: kept.map((k) => k.stored),
      sequences: built.sequences,
      importedAt: now,
    };
    const staging = path.join(root, `${STAGING_PREFIX}${id}`);
    try {
      fs.mkdirSync(staging, { recursive: true });
      for (const k of kept) fs.writeFileSync(path.join(staging, k.stored), k.data);
      writeJsonAtomicSync(path.join(staging, MANIFEST), manifest, { backup: false });
      fs.renameSync(staging, path.join(root, id));
      made.push(manifest);
    } catch (err) {
      logDiagnostic('error', 'companion-packs', 'import-write-failed', String(err));
      try {
        fs.rmSync(staging, { recursive: true, force: true });
      } catch {
        /* swept on the next listing */
      }
      return made.length ? { ok: true, packs: made, skipped } : { ok: false, error: 'write-failed' };
    }
  }
  if (!made.length) return { ok: false, error: 'no-frames' };
  return { ok: true, packs: made, skipped };
}

export function renameCompanionPack(id: unknown, name: unknown, root = companionPacksRoot()): boolean {
  if (typeof id !== 'string' || typeof name !== 'string' || !name.trim()) return false;
  const dir = packDir(root, id);
  if (!dir) return false;
  const file = path.join(dir, MANIFEST);
  const manifest = parseCompanionPackManifest(readJsonSync<unknown>(file, null));
  if (!manifest || manifest.id !== id) return false;
  try {
    writeJsonAtomicSync(file, { ...manifest, name: cleanPackName(name, manifest.name) }, { backup: false });
    return true;
  } catch {
    return false;
  }
}

export function removeCompanionPack(id: unknown, root = companionPacksRoot()): boolean {
  if (typeof id !== 'string') return false;
  const dir = packDir(root, id);
  if (!dir || !fs.existsSync(dir)) return false;
  // Out of the listing in one rename, then deleted; a failed delete is swept later.
  const trash = path.join(root, `${TRASH_PREFIX}${id}-${Date.now()}`);
  try {
    fs.renameSync(dir, trash);
  } catch {
    return false;
  }
  try {
    fs.rmSync(trash, { recursive: true, force: true });
  } catch {
    /* already out of the listing; swept next time */
  }
  return true;
}

/** Absolute path of the frame a `localfile://pet/<id>/<frame>` URL names, or null. */
export function resolveCompanionPackFrameFile(url: string, root = companionPacksRoot()): string | null {
  const parsed = parseCompanionPackFrameUrl(url);
  if (!parsed) return null;
  const dir = packDir(root, parsed.packId);
  if (!dir) return null;
  const file = path.join(dir, parsed.frame);
  return fs.existsSync(file) ? file : null;
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

function broadcastChanged(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(COMPANION_PACK_CHANNELS.changed);
  }
}

export function registerCompanionPacksIpc(): void {
  ipcMain.handle(COMPANION_PACK_CHANNELS.list, () => listCompanionPacks());

  ipcMain.handle(
    COMPANION_PACK_CHANNELS.import,
    async (event, opts: unknown): Promise<CompanionPackImportResult> => {
      const folder = !!opts && typeof opts === 'object' && (opts as { kind?: unknown }).kind === 'folder';
      const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const options: Electron.OpenDialogOptions = folder
        ? { title: mt('dialog.companionPack.folderTitle'), properties: ['openDirectory'] }
        : {
            title: mt('dialog.companionPack.title'),
            properties: ['openFile'],
            filters: [{ name: mt('dialog.filter.companionPack'), extensions: ['zip', 'png', 'gif', 'webp', 'xml'] }],
          };
      const picked = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
      const file = picked.filePaths?.[0];
      if (picked.canceled || !file) return { ok: false, error: 'cancelled' };
      const res = importCompanionPacks(file);
      if (res.ok) broadcastChanged();
      return res;
    },
  );

  ipcMain.handle(COMPANION_PACK_CHANNELS.rename, (_e, id: unknown, name: unknown) => {
    const ok = renameCompanionPack(id, name);
    if (ok) broadcastChanged();
    return ok;
  });

  ipcMain.handle(COMPANION_PACK_CHANNELS.remove, (_e, id: unknown) => {
    const ok = removeCompanionPack(id);
    if (ok) broadcastChanged();
    return ok;
  });
}
