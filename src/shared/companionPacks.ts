/**
 * Desktop-companion sprite packs — the format rules both processes share.
 *
 * A pack is a set of image frames plus, for each motion the companion engine
 * plays, the frame sequence to loop. Three kinds exist:
 *   - built-in: Gum's own original characters (renderer/assets/companions/);
 *   - private: an owner's local, git-ignored folder (private-assets/shimeji/);
 *   - user: packs imported in Settings › Companions, stored in userData.
 *
 * Imports accept the common Shimeji / Shimeji-ee layout (img/shime1.png …
 * shime46.png, optionally conf/actions.xml) and a plain folder of frames named
 * after what they show (stand.png, walk-1.png, walk-2.png …). Everything here is
 * pure so the importer's safety rules (zip-slip, limits, frame mapping) are
 * testable without Electron.
 */

export const COMPANION_PACK_MOTIONS = [
  'stand',
  'walk',
  'sit',
  'wall',
  'ceiling',
  'fall',
  'drag',
  'celebrate',
] as const;
export type CompanionPackMotion = (typeof COMPANION_PACK_MOTIONS)[number];
export type CompanionPackSequences = Record<CompanionPackMotion, string[]>;

/** The frame map for a classic Shimeji image set — what the engine has always used. */
export const STANDARD_SHIMEJI_SEQUENCES: Readonly<CompanionPackSequences> = {
  stand: ['shime1.png'],
  walk: ['shime1.png', 'shime2.png', 'shime1.png', 'shime3.png'],
  sit: ['shime11.png', 'shime26.png'],
  wall: ['shime14.png', 'shime12.png', 'shime13.png', 'shime13.png', 'shime12.png', 'shime14.png'],
  ceiling: ['shime25.png', 'shime23.png', 'shime24.png', 'shime24.png', 'shime23.png', 'shime25.png'],
  fall: ['shime4.png'],
  drag: ['shime7.png', 'shime8.png', 'shime9.png', 'shime10.png'],
  celebrate: ['shime5.png', 'shime6.png', 'shime5.png', 'shime6.png', 'shime1.png'],
};

/** Every frame a pack needs to fill all motions without a fallback. */
export const REQUIRED_STANDARD_FRAMES: readonly string[] = [
  ...new Set(Object.values(STANDARD_SHIMEJI_SEQUENCES).flat()),
].sort((a, b) => frameNumber(a) - frameNumber(b));

/** Limits for one import. A pack is a handful of small PNGs; these are generous. */
export const COMPANION_PACK_LIMITS = {
  /** Image files kept per pack. Classic Shimeji uses 46. */
  maxFramesPerPack: 240,
  /** One image. */
  maxFileBytes: 2 * 1024 * 1024,
  /** All images of one import together. */
  maxTotalBytes: 64 * 1024 * 1024,
  /** Width or height of one image. */
  maxDimension: 1024,
  /** Characters imported from one archive / folder (Shimeji-ee bundles several). */
  maxPacksPerImport: 12,
  /** Entries listed in one archive or walked in one folder. */
  maxEntries: 5000,
  /** The .zip file itself. */
  maxArchiveBytes: 160 * 1024 * 1024,
  /** conf/actions.xml. */
  maxXmlBytes: 1024 * 1024,
  maxNameLength: 60,
} as const;

export const COMPANION_PACK_IMAGE_EXTENSIONS: readonly string[] = ['.png', '.gif', '.webp'];

export type CompanionPackSource = 'shimeji' | 'frames';

/** What the main process keeps next to an imported pack's frames. */
export interface CompanionPackManifest {
  version: 1;
  id: string;
  name: string;
  source: CompanionPackSource;
  frames: string[];
  sequences: CompanionPackSequences;
  importedAt: number;
}

/** Why an import did not produce a pack. The renderer maps these to i18n keys. */
export type CompanionPackImportError =
  | 'cancelled'
  | 'unreadable'
  | 'not-a-pack'
  | 'no-frames'
  | 'too-large'
  | 'too-many-files'
  | 'write-failed';

export type CompanionPackImportResult =
  | { ok: true; packs: CompanionPackManifest[]; skipped: number }
  | { ok: false; error: CompanionPackImportError };

// ---------------------------------------------------------------------------
// Names and paths
// ---------------------------------------------------------------------------

/** An imported pack's id: a single, generated path segment. */
export function isSafeCompanionPackId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/.test(id);
}

/** A stored frame name: lower-case, no separators, an allowed image extension. */
export function isSafeFrameName(name: unknown): name is string {
  if (typeof name !== 'string' || name.length > 80) return false;
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name) || name.includes('..')) return false;
  return COMPANION_PACK_IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/** The name a frame is stored under, from any source basename. Null when not an allowed image. */
export function storedFrameName(sourceName: string): string | null {
  const base = baseName(sourceName).toLowerCase();
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return null;
  const ext = base.slice(dot);
  if (!COMPANION_PACK_IMAGE_EXTENSIONS.includes(ext)) return null;
  const stem = base
    .slice(0, dot)
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 60);
  if (!stem) return null;
  const out = `${stem}${ext}`;
  return isSafeFrameName(out) ? out : null;
}

export function cleanPackName(raw: unknown, fallback = 'Companion'): string {
  const printable =
    typeof raw === 'string' ? Array.from(raw, (ch) => (ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f ? ' ' : ch)).join('') : '';
  const text = printable.replace(/\s+/g, ' ').trim();
  return (text || fallback).slice(0, COMPANION_PACK_LIMITS.maxNameLength);
}

function baseName(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] ?? p;
}

/**
 * An archive / folder entry path that must never be followed: absolute, a drive
 * or UNC root, a `..` segment, or a NUL. The importer never uses an entry path as
 * a destination (frames are re-named on the way in), but a pack that tries this
 * is not a pack — it is refused rather than partly imported.
 */
export function isUnsafeEntryPath(p: string): boolean {
  if (!p || p.includes('\0')) return true;
  const norm = p.replace(/\\/g, '/');
  if (norm.startsWith('/') || /^[a-zA-Z]:/.test(norm) || norm.startsWith('//')) return true;
  return norm.split('/').some((seg) => seg === '..');
}

function frameNumber(name: string): number {
  const m = /(\d+)/.exec(name);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

// ---------------------------------------------------------------------------
// Image sniffing — the extension is a claim; the bytes decide.
// ---------------------------------------------------------------------------

export interface SniffedImage {
  type: 'png' | 'gif' | 'webp';
  width: number;
  height: number;
}

export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  const u8 = bytes;
  const at = (i: number) => u8[i] ?? 0;
  const u32be = (i: number) => ((at(i) << 24) | (at(i + 1) << 16) | (at(i + 2) << 8) | at(i + 3)) >>> 0;
  const u16le = (i: number) => at(i) | (at(i + 1) << 8);
  const u24le = (i: number) => at(i) | (at(i + 1) << 8) | (at(i + 2) << 16);
  if (u8.length >= 24 && at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47 && at(12) === 0x49 && at(13) === 0x48 && at(14) === 0x44 && at(15) === 0x52) {
    return { type: 'png', width: u32be(16), height: u32be(20) };
  }
  if (u8.length >= 10 && at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38) {
    return { type: 'gif', width: u16le(6), height: u16le(8) };
  }
  if (u8.length >= 30 && at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50) {
    const chunk = String.fromCharCode(at(12), at(13), at(14), at(15));
    if (chunk === 'VP8X') return { type: 'webp', width: u24le(24) + 1, height: u24le(27) + 1 };
    if (chunk === 'VP8 ') return { type: 'webp', width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const b = u32le(u8, 21);
      return { type: 'webp', width: (b & 0x3fff) + 1, height: ((b >>> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

function u32le(u8: Uint8Array, i: number): number {
  return ((u8[i] ?? 0) | ((u8[i + 1] ?? 0) << 8) | ((u8[i + 2] ?? 0) << 16) | ((u8[i + 3] ?? 0) << 24)) >>> 0;
}

/** Null when the bytes are an allowed image within the limits, else the reason. */
export function imageProblem(bytes: Uint8Array, storedName: string): 'not-image' | 'too-large' | null {
  if (bytes.length > COMPANION_PACK_LIMITS.maxFileBytes) return 'too-large';
  const img = sniffImage(bytes);
  if (!img || !storedName.endsWith(`.${img.type}`)) return 'not-image';
  const max = COMPANION_PACK_LIMITS.maxDimension;
  if (img.width < 1 || img.height < 1 || img.width > max || img.height > max) return 'too-large';
  return null;
}

// ---------------------------------------------------------------------------
// Frame mapping
// ---------------------------------------------------------------------------

/**
 * Shimeji action names (English Shimeji-ee and the original Japanese release)
 * mapped onto the engine's motions, most specific first. Any other action in an
 * actions.xml is ignored — the engine has no use for it.
 */
const SHIMEJI_ACTIONS: Record<CompanionPackMotion, string[]> = {
  stand: ['stand', '立つ'],
  walk: ['walk', '歩く'],
  sit: ['sit', 'sitandlookup', 'sitwithlegsdown', '座る'],
  wall: ['climbwall', 'grabwall', '壁を登る', '壁にしがみつく'],
  ceiling: ['climbceiling', 'grabceiling', '天井を伝う', '天井にぶらさがる'],
  fall: ['falling', 'fall', '落下する'],
  drag: ['pinched', 'dragged', 'resisting', 'つままれる', '抵抗する'],
  celebrate: ['jumping', 'jump', 'sitandspinhead', 'ジャンプ'],
};

/** Frame lists per action name (lower-cased) from a Shimeji actions.xml. */
export function parseShimejiActions(xml: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const actionRe = /<Action\b([^>]*)>([\s\S]*?)<\/Action>/gi;
  let m: RegExpExecArray | null;
  while ((m = actionRe.exec(xml))) {
    const name = /\bName\s*=\s*"([^"]*)"/i.exec(m[1])?.[1]?.trim().toLowerCase();
    if (!name || out.has(name)) continue;
    const frames: string[] = [];
    const poseRe = /<Pose\b[^>]*?\bImage\s*=\s*"([^"]+)"/gi;
    let pm: RegExpExecArray | null;
    while ((pm = poseRe.exec(m[2]))) {
      const stored = storedFrameName(pm[1]);
      if (stored) frames.push(stored);
    }
    if (frames.length) out.set(name, frames);
  }
  return out;
}

export function sequencesFromShimejiActions(xml: string): Partial<CompanionPackSequences> {
  const actions = parseShimejiActions(xml);
  const out: Partial<CompanionPackSequences> = {};
  for (const motion of COMPANION_PACK_MOTIONS) {
    for (const name of SHIMEJI_ACTIONS[motion]) {
      const frames = actions.get(name.toLowerCase());
      if (frames?.length) {
        out[motion] = frames;
        break;
      }
    }
  }
  return out;
}

/** Words a plain frame folder may use for each motion. */
const FRAME_WORDS: Record<CompanionPackMotion, string[]> = {
  stand: ['stand', 'idle', 'still'],
  walk: ['walk', 'run', 'move'],
  sit: ['sit', 'sleep', 'rest'],
  wall: ['wall', 'climb'],
  ceiling: ['ceiling', 'hang'],
  fall: ['fall', 'drop'],
  drag: ['drag', 'grab', 'held', 'pinch'],
  celebrate: ['celebrate', 'cheer', 'happy', 'jump', 'dance'],
};

/** `walk-2.png` → walk; frames of one motion ordered by their number. */
export function sequencesFromNamedFrames(frames: readonly string[]): Partial<CompanionPackSequences> {
  const out: Partial<CompanionPackSequences> = {};
  for (const motion of COMPANION_PACK_MOTIONS) {
    const hits = frames.filter((name) => {
      const stem = name.replace(/\.[a-z0-9]+$/, '');
      const word = /^([a-z]+)/.exec(stem)?.[1] ?? '';
      return FRAME_WORDS[motion].includes(word);
    });
    if (hits.length) out[motion] = [...hits].sort((a, b) => frameNumberOrZero(a) - frameNumberOrZero(b));
  }
  return out;
}

function frameNumberOrZero(name: string): number {
  const m = /(\d+)/.exec(name);
  return m ? Number(m[1]) : 0;
}

/** Where a motion borrows from when a pack has no frames of its own for it. */
const MOTION_FALLBACK: Record<CompanionPackMotion, CompanionPackMotion[]> = {
  stand: [],
  walk: ['stand'],
  sit: ['stand'],
  wall: ['walk', 'stand'],
  ceiling: ['wall', 'walk', 'stand'],
  fall: ['drag', 'stand'],
  drag: ['fall', 'stand'],
  celebrate: ['stand'],
};

export function isShimejiLayout(frames: readonly string[]): boolean {
  return frames.some((f) => /^shime1\.(png|gif|webp)$/.test(f));
}

/**
 * The full motion → frames map for a set of stored frame names. Sources win in
 * this order: explicit `custom`, the pack's actions.xml, the classic Shimeji
 * names, then words in the file names. Every motion ends up non-empty (unknown
 * or missing motions borrow a related one, finally the first frame); null only
 * when there is no frame at all.
 */
export function buildPackSequences(
  frames: readonly string[],
  opts: { actionsXml?: string; custom?: Partial<CompanionPackSequences> } = {},
): { sequences: CompanionPackSequences; source: CompanionPackSource } | null {
  if (!frames.length) return null;
  const have = new Set(frames);
  const keep = (list: string[] | undefined) => (list ?? []).filter((f) => have.has(f));
  const shimeji = isShimejiLayout(frames);
  const layers: Partial<CompanionPackSequences>[] = [
    opts.custom ?? {},
    opts.actionsXml ? sequencesFromShimejiActions(opts.actionsXml) : {},
    shimeji ? STANDARD_SHIMEJI_SEQUENCES : {},
    sequencesFromNamedFrames(frames),
  ];
  const picked = {} as Record<CompanionPackMotion, string[]>;
  for (const motion of COMPANION_PACK_MOTIONS) {
    let list: string[] = [];
    for (const layer of layers) {
      list = keep(layer[motion]);
      if (list.length) break;
    }
    picked[motion] = list;
  }
  const sorted = [...frames].sort((a, b) => frameNumber(a) - frameNumber(b) || a.localeCompare(b));
  if (!picked.stand.length) picked.stand = [sorted[0]];
  for (const motion of COMPANION_PACK_MOTIONS) {
    if (picked[motion].length) continue;
    const from = MOTION_FALLBACK[motion].find((m) => picked[m].length);
    picked[motion] = from ? picked[from] : picked.stand;
  }
  return { sequences: picked, source: shimeji ? 'shimeji' : 'frames' };
}

/** A stored manifest, validated. Null when it is not one the app wrote. */
export function parseCompanionPackManifest(raw: unknown): CompanionPackManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Partial<CompanionPackManifest>;
  if (m.version !== 1 || !isSafeCompanionPackId(m.id)) return null;
  const frames = Array.isArray(m.frames) ? m.frames.filter(isSafeFrameName) : [];
  if (!frames.length) return null;
  const have = new Set(frames);
  const sequences = {} as CompanionPackSequences;
  for (const motion of COMPANION_PACK_MOTIONS) {
    const raw = m.sequences?.[motion];
    const list = Array.isArray(raw) ? raw.filter((f) => have.has(f)) : [];
    sequences[motion] = list;
  }
  const built = buildPackSequences(frames, { custom: sequences });
  if (!built) return null;
  return {
    version: 1,
    id: m.id,
    name: cleanPackName(m.name),
    source: m.source === 'frames' ? 'frames' : 'shimeji',
    frames,
    sequences: built.sequences,
    importedAt: typeof m.importedAt === 'number' ? m.importedAt : 0,
  };
}

// ---------------------------------------------------------------------------
// Import planning
// ---------------------------------------------------------------------------

export interface PackSourceEntry {
  /** Path inside the archive / folder, `/`-separated. */
  path: string;
  /** Uncompressed size in bytes. */
  size: number;
}

export interface PlannedPackFrame {
  entry: string;
  stored: string;
}

export interface PlannedPack {
  name: string;
  dir: string;
  frames: PlannedPackFrame[];
  actionsEntry?: string;
}

export type PackImportPlan =
  | { ok: true; packs: PlannedPack[]; skipped: number }
  | { ok: false; error: CompanionPackImportError };

const IGNORED_DIR = /(^|\/)(__macosx|\.[^/]*)(\/|$)/i;

function dirOf(p: string): string {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
}

function lastSegment(dir: string): string {
  const parts = dir.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

/**
 * Decide what one archive or folder imports as, from its listing alone.
 *
 * Each directory holding frames becomes one pack: a Shimeji directory (it has
 * shime1) or a named-frame directory (its files say stand / walk / …). A
 * Shimeji-ee bundle with img/<Name>/ folders therefore imports every character.
 * Unsafe paths anywhere refuse the whole import; oversize entries are skipped.
 */
export function planCompanionPackImport(entries: readonly PackSourceEntry[], fallbackName: string): PackImportPlan {
  const L = COMPANION_PACK_LIMITS;
  if (entries.length > L.maxEntries) return { ok: false, error: 'too-many-files' };
  if (entries.some((e) => isUnsafeEntryPath(e.path))) return { ok: false, error: 'not-a-pack' };

  const norm = entries
    .map((e) => ({ path: e.path.replace(/\\/g, '/').replace(/^\.\//, ''), size: e.size }))
    .filter((e) => !IGNORED_DIR.test(e.path));
  const xmlByLower = new Map(
    norm
      .filter((e) => /(^|\/)actions\.xml$/i.test(e.path) && e.size <= L.maxXmlBytes)
      .map((e) => [e.path.toLowerCase(), e.path]),
  );

  let skipped = 0;
  const byDir = new Map<string, PlannedPackFrame[]>();
  for (const e of norm) {
    const stored = storedFrameName(e.path);
    if (!stored) continue;
    if (e.size > L.maxFileBytes) {
      skipped++;
      continue;
    }
    const dir = dirOf(e.path);
    const list = byDir.get(dir) ?? [];
    if (list.some((f) => f.stored === stored)) {
      skipped++;
      continue;
    }
    list.push({ entry: e.path, stored });
    byDir.set(dir, list);
  }

  const packs: PlannedPack[] = [];
  const dirs = [...byDir.keys()].sort();
  for (const dir of dirs) {
    let frames = byDir.get(dir) ?? [];
    const names = frames.map((f) => f.stored);
    const usable = isShimejiLayout(names) || Object.keys(sequencesFromNamedFrames(names)).length > 0;
    if (!usable) continue;
    if (frames.length > L.maxFramesPerPack) {
      skipped += frames.length - L.maxFramesPerPack;
      frames = [...frames].sort((a, b) => frameNumber(a.stored) - frameNumber(b.stored)).slice(0, L.maxFramesPerPack);
    }
    // Shimeji keeps conf/ beside img/: <root>/conf, <root>/img/<Name>/ or <char>/conf beside <char>/img.
    const parent = dirOf(dir);
    const grand = dirOf(parent);
    const candidates = [dir, parent, grand].map((d) => (d ? `${d}/conf/actions.xml` : 'conf/actions.xml'));
    const actionsEntry = candidates.map((c) => xmlByLower.get(c.toLowerCase())).find(Boolean);
    const seg = lastSegment(dir);
    const nameSeg = seg.toLowerCase() === 'img' ? lastSegment(parent) : seg;
    packs.push({ name: cleanPackName(nameSeg, cleanPackName(fallbackName)), dir, frames, actionsEntry });
  }
  if (!packs.length) return { ok: false, error: 'no-frames' };
  if (packs.length > L.maxPacksPerImport) {
    skipped += packs.length - L.maxPacksPerImport;
    packs.length = L.maxPacksPerImport;
  }
  const sizeOf = new Map(norm.map((e) => [e.path, e.size]));
  const total = packs.reduce((sum, p) => sum + p.frames.reduce((s, f) => s + (sizeOf.get(f.entry) ?? 0), 0), 0);
  if (total > L.maxTotalBytes) return { ok: false, error: 'too-large' };
  return { ok: true, packs, skipped };
}

/** `localfile://pet/<packId>/<frame>` — the URL an imported pack's frame is served at. */
export function companionPackFrameUrl(packId: string, frame: string): string {
  return `localfile://pet/${packId}/${frame}`;
}

/** The pack id and frame a `localfile://pet/…` URL names, validated. */
export function parseCompanionPackFrameUrl(url: string): { packId: string; frame: string } | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'localfile:' || u.hostname !== 'pet') return null;
    const parts = u.pathname.replace(/^\/+/, '').split('/').map((s) => decodeURIComponent(s));
    if (parts.length !== 2) return null;
    const [packId, frame] = parts;
    if (!isSafeCompanionPackId(packId) || !isSafeFrameName(frame)) return null;
    return { packId, frame };
  } catch {
    return null;
  }
}
