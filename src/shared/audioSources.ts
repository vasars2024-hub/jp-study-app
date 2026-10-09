/**
 * Where a word's pronunciation may come from, in the order the user chose.
 *
 * Yomitan plays from an ordered list of audio sources and falls through to the
 * next when one has no recording. The app had exactly one source (the
 * JapanesePod101 CDN, `dictionary/audio.ts`); this is the list around it, plus
 * the one other source learners actually install: a local folder of
 * user-provided recordings — the "local audio" packs Yomitan users keep on
 * disk. Nothing is ever downloaded into such a folder; the app only reads the
 * files the user put there.
 *
 * Two file layouts are understood, both common in those packs:
 *
 *   `<reading> - <term>.mp3`   the JapanesePod101 alternate layout (たべる - 食べる.mp3)
 *   `<term>.mp3`               one word per file, any sub-folder (forvo_files/<user>/食べる.mp3)
 *
 * A bare-name file matches on the written form; it matches on the reading only
 * when the word is itself written in kana, because a reading-named file for a
 * kanji word is as likely to be a homophone as the word.
 */

export type AudioSourceKind = 'jpod101' | 'local';

export interface AudioSourceConfig {
  /** Stable id: `jpod101`, or `local-<n>` for a folder. */
  id: string;
  kind: AudioSourceKind;
  enabled: boolean;
  /** Absolute folder path, for `local`. */
  folder?: string;
  /** The user's own name for the source; the folder name otherwise. */
  label?: string;
}

export interface AudioSourcesPrefs {
  sources: AudioSourceConfig[];
}

export const JPOD101_SOURCE_ID = 'jpod101';

export const DEFAULT_AUDIO_SOURCES: AudioSourcesPrefs = Object.freeze({
  sources: [{ id: JPOD101_SOURCE_ID, kind: 'jpod101', enabled: true }],
}) as AudioSourcesPrefs;

/** At most this many local folders; each is indexed in memory. */
export const MAX_LOCAL_AUDIO_FOLDERS = 8;

/** Anything read from disk or IPC, reduced to a valid ordered list. The CDN source is always present. */
export function normalizeAudioSourcesPrefs(raw: unknown): AudioSourcesPrefs {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { sources?: unknown }).sources)
    ? ((raw as { sources: unknown[] }).sources)
    : [];
  const out: AudioSourceConfig[] = [];
  const ids = new Set<string>();
  let locals = 0;
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const enabled = o.enabled !== false;
    if (o.kind === 'jpod101') {
      if (ids.has(JPOD101_SOURCE_ID)) continue;
      ids.add(JPOD101_SOURCE_ID);
      out.push({ id: JPOD101_SOURCE_ID, kind: 'jpod101', enabled });
      continue;
    }
    if (o.kind !== 'local' || typeof o.folder !== 'string' || !o.folder.trim()) continue;
    if (locals >= MAX_LOCAL_AUDIO_FOLDERS) continue;
    const id = typeof o.id === 'string' && /^local-[\w-]{1,40}$/.test(o.id) && !ids.has(o.id) ? o.id : `local-${locals + 1}`;
    if (ids.has(id)) continue;
    ids.add(id);
    locals += 1;
    const label = typeof o.label === 'string' && o.label.trim() ? o.label.trim().slice(0, 60) : undefined;
    out.push({ id, kind: 'local', enabled, folder: o.folder.trim(), ...(label ? { label } : {}) });
  }
  if (!ids.has(JPOD101_SOURCE_ID)) out.push({ id: JPOD101_SOURCE_ID, kind: 'jpod101', enabled: true });
  return { sources: out };
}

/** A free id for a new local folder. */
export function nextLocalAudioSourceId(prefs: AudioSourcesPrefs): string {
  const taken = new Set(prefs.sources.map((source) => source.id));
  for (let n = 1; n < 1000; n += 1) {
    const id = `local-${n}`;
    if (!taken.has(id)) return id;
  }
  return `local-${Date.now()}`;
}

export const LOCAL_AUDIO_EXTENSIONS = ['.mp3', '.ogg', '.opus', '.m4a', '.aac', '.wav', '.flac'] as const;

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
};

/** MIME type for an audio file extension (with the dot), or null when it is not one we play. */
export function localAudioMime(ext: string): string | null {
  return MIME[ext.toLowerCase()] ?? null;
}

/** File extension (no dot) for a clip's MIME type, for naming it in Anki's media folder. */
export function audioExtForMime(mime: string): string {
  switch (mime) {
    case 'audio/ogg':
      return 'ogg';
    case 'audio/mp4':
      return 'm4a';
    case 'audio/aac':
      return 'aac';
    case 'audio/wav':
      return 'wav';
    case 'audio/flac':
      return 'flac';
    default:
      return 'mp3';
  }
}

const KANA_ONLY = /^[぀-ヿー・]+$/u;

function nfc(text: string): string {
  return text.normalize('NFC').trim();
}

/** Index keys a file name (without extension) answers to. */
export function localAudioFileKeys(baseName: string): string[] {
  const base = nfc(baseName);
  if (!base) return [];
  const pair = /^(.+?)\s+-\s+(.+)$/u.exec(base);
  if (pair) {
    const reading = nfc(pair[1]);
    const term = nfc(pair[2]);
    return [`pair:${term}\u0001${reading}`];
  }
  return [`word:${base}`];
}

/** Keys to probe for a word, best match first. */
export function localAudioLookupKeys(term: string, reading?: string): string[] {
  const t = nfc(term);
  const r = nfc(reading || '') || t;
  if (!t) return [];
  const keys = [`pair:${t}\u0001${r}`];
  if (r !== t) keys.push(`pair:${t}\u0001${t}`);
  keys.push(`word:${t}`);
  if (KANA_ONLY.test(t) && r !== t) keys.push(`word:${r}`);
  if (r !== t && KANA_ONLY.test(r) && KANA_ONLY.test(t)) keys.push(`pair:${r}\u0001${r}`);
  return [...new Set(keys)];
}

/** How a source is named on screen: the user's label, else the folder's last segment. */
export function audioSourceDisplayName(source: AudioSourceConfig): string {
  if (source.label) return source.label;
  if (source.kind === 'local' && source.folder) {
    const parts = source.folder.split(/[\\/]+/).filter(Boolean);
    return parts[parts.length - 1] ?? source.folder;
  }
  return 'JapanesePod101';
}

/** What a source can say about one word before anything is played. */
export type AudioAvailability = 'yes' | 'no' | 'unknown';

export interface AudioSourceAvailability {
  id: string;
  kind: AudioSourceKind;
  name: string;
  available: AudioAvailability;
}
