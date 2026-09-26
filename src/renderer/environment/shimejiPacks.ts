/**
 * Companion sprite packs as the renderer sees them: frame URLs per motion.
 *
 * Three sources, one list:
 *   - built-in: Gum's own original characters (assets/companions/, CC0);
 *   - private: the owner's git-ignored private-assets/shimeji/ (empty in a public clone);
 *   - user: packs imported in Settings › Companions (main-process store, served
 *     over `localfile://pet/…`).
 * The frame maps come from shared/companionPacks.ts, the same rules the importer uses.
 */
import { useSyncExternalStore } from 'react';
import {
  buildPackSequences,
  companionPackFrameUrl,
  COMPANION_PACK_MOTIONS,
  parseCompanionPackManifest,
  type CompanionPackManifest,
  type CompanionPackMotion,
  type CompanionPackSequences,
} from '../../shared/companionPacks';
import {
  PRIVATE_SHIMEJI_DEFAULTS,
  PRIVATE_SHIMEJI_FRAMES,
  PRIVATE_SHIMEJI_SEQUENCES,
  type AssetGlob,
  type JsonGlob,
} from '../privateAssets';

export type ShimejiMotion = CompanionPackMotion;

/** Gum's own characters, in the order Settings lists them. */
export const BUILTIN_PACK_IDS = ['beni', 'yuzu', 'tock', 'orbi', 'ping'] as const;
export type BuiltinPackId = (typeof BUILTIN_PACK_IDS)[number];
/** Any pack id: a built-in, `private-<folder>`, or an imported pack's id. */
export type ShimejiPackId = string;

export type ShimejiPack = Record<ShimejiMotion, string[]>;
export type CompanionPackKind = 'builtin' | 'private' | 'user';

export interface CompanionPackInfo {
  id: ShimejiPackId;
  kind: CompanionPackKind;
  /** Display name; built-ins resolve `companion.pack.<id>.name` at render instead. */
  name: string;
  frames: ShimejiPack;
}

const BUILTIN_FRAMES = import.meta.glob('../assets/companions/*/*.png', {
  eager: true,
  import: 'default',
}) as AssetGlob;

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

function folderOf(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 2] ?? '';
}

/** `<root>/<folder>/<file>` glob entries grouped by folder, file names lower-cased. */
export function groupByFolder(glob: AssetGlob): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const [p, url] of Object.entries(glob)) {
    const folder = folderOf(p);
    if (!folder) continue;
    const files = out.get(folder) ?? new Map<string, string>();
    files.set(basename(p).toLowerCase(), url);
    out.set(folder, files);
  }
  return out;
}

function customSequences(raw: unknown): Partial<CompanionPackSequences> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Partial<CompanionPackSequences> = {};
  for (const motion of COMPANION_PACK_MOTIONS) {
    const list = (raw as Record<string, unknown>)[motion];
    if (Array.isArray(list)) out[motion] = list.filter((f): f is string => typeof f === 'string').map((f) => f.toLowerCase());
  }
  return out;
}

/** Frame URLs per motion for a folder of files (name → URL). Null when it has no frame. */
export function packFromFiles(files: Map<string, string>, custom?: Partial<CompanionPackSequences>): ShimejiPack | null {
  const built = buildPackSequences([...files.keys()], { custom });
  if (!built) return null;
  const pack = {} as ShimejiPack;
  for (const motion of COMPANION_PACK_MOTIONS) {
    pack[motion] = built.sequences[motion].map((f) => files.get(f)).filter((u): u is string => typeof u === 'string');
  }
  return pack;
}

export function buildBuiltinPacks(glob: AssetGlob = BUILTIN_FRAMES): CompanionPackInfo[] {
  const byFolder = groupByFolder(glob);
  const out: CompanionPackInfo[] = [];
  for (const id of BUILTIN_PACK_IDS) {
    const files = byFolder.get(id);
    const frames = files ? packFromFiles(files) : null;
    if (frames) out.push({ id, kind: 'builtin', name: id, frames });
  }
  return out;
}

function titleCase(folder: string): string {
  return folder.replace(/[-_]+/g, ' ').replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/** Packs from private-assets/shimeji/. Both globs are empty in a public clone. */
export function buildPrivatePacks(
  frames: AssetGlob = PRIVATE_SHIMEJI_FRAMES,
  sequences: JsonGlob = PRIVATE_SHIMEJI_SEQUENCES,
): CompanionPackInfo[] {
  const seqByFolder = new Map(Object.entries(sequences).map(([p, v]) => [folderOf(p), v]));
  const out: CompanionPackInfo[] = [];
  for (const [folder, files] of [...groupByFolder(frames)].sort(([a], [b]) => a.localeCompare(b))) {
    const pack = packFromFiles(files, customSequences(seqByFolder.get(folder)));
    if (pack) out.push({ id: `private-${folder.toLowerCase()}`, kind: 'private', name: titleCase(folder), frames: pack });
  }
  return out;
}

/** The owner's `private-assets/shimeji/defaults.json`: companion type → private pack id. */
export function privateDefaultPacks(glob: JsonGlob = PRIVATE_SHIMEJI_DEFAULTS): Record<string, ShimejiPackId> {
  const raw = Object.values(glob)[0];
  const out: Record<string, ShimejiPackId> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [type, folder] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof folder === 'string' && folder) out[type] = `private-${folder.toLowerCase()}`;
  }
  return out;
}

export function userPackInfo(manifest: CompanionPackManifest): CompanionPackInfo {
  const frames = {} as ShimejiPack;
  for (const motion of COMPANION_PACK_MOTIONS) {
    frames[motion] = manifest.sequences[motion].map((f) => companionPackFrameUrl(manifest.id, f));
  }
  return { id: manifest.id, kind: 'user', name: manifest.name, frames };
}

// ---------------------------------------------------------------------------
// Live registry (user packs arrive over IPC and change on import / delete)
// ---------------------------------------------------------------------------

const STATIC_PACKS: CompanionPackInfo[] = [...buildBuiltinPacks(), ...buildPrivatePacks()];
let userPacks: CompanionPackInfo[] = [];
let snapshot: CompanionPackInfo[] = STATIC_PACKS;
let loaded = false;
const listeners = new Set<() => void>();

function publish(): void {
  snapshot = [...STATIC_PACKS, ...userPacks];
  for (const l of listeners) l();
}

/** Re-read the imported packs from the main process. */
export async function refreshUserPacks(): Promise<void> {
  const list = typeof window !== 'undefined' ? window.api?.companionPacksList : undefined;
  if (typeof list !== 'function') return;
  try {
    const raw = await list();
    userPacks = (Array.isArray(raw) ? raw : [])
      .map((m) => parseCompanionPackManifest(m))
      .filter((m): m is CompanionPackManifest => m !== null)
      .map(userPackInfo);
  } catch {
    userPacks = [];
  }
  publish();
}

function ensureLoaded(): void {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  void refreshUserPacks();
  window.api?.onCompanionPacksChanged?.(() => void refreshUserPacks());
}

export function listCompanionPacks(): CompanionPackInfo[] {
  ensureLoaded();
  return snapshot;
}

export function subscribeCompanionPacks(cb: () => void): () => void {
  ensureLoaded();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useCompanionPacks(): CompanionPackInfo[] {
  return useSyncExternalStore(subscribeCompanionPacks, listCompanionPacks, listCompanionPacks);
}

export function findCompanionPack(packId?: ShimejiPackId): CompanionPackInfo | null {
  if (!packId) return null;
  return listCompanionPacks().find((p) => p.id === packId) ?? null;
}

export function getShimejiPack(packId?: ShimejiPackId): ShimejiPack | null {
  return findCompanionPack(packId)?.frames ?? null;
}
