/**
 * Gate 28's first three words — "**Paste a folder** sorts all of it".
 *
 * Gate 27 recorded a decision that the scan root is TYPED rather than browsed,
 * because a native directory dialog is something no agent on this side can
 * drive and the gate's own evidence would then depend on a human clicking. That
 * decision stands and is not being reversed here: paste is a THIRD way in, not
 * a replacement for the field, and it needs no dialog at all.
 *
 * Two shapes arrive on a Windows clipboard when a user has "copied a folder",
 * and they are genuinely different things:
 *
 * 1. **`FileNameW`** — Explorer's own format, set by Ctrl+C on a folder in the
 *    file list. A UTF-16LE, NUL-terminated path. This is the literal reading of
 *    the gate and the one a user means.
 * 2. **Plain text** — what Ctrl+C in the address bar, or in a terminal, or in a
 *    chat message produces. Explorer's "Copy as path" quotes it.
 *
 * Both are accepted, `FileNameW` first, because when both are present the
 * binary format is Explorer speaking precisely and the text is a rendering of
 * it. Neither is trusted: this module produces CANDIDATES, and the caller
 * confirms each one is a real directory. That split is deliberate — it keeps
 * the parsing pure and testable, and it means a paste of prose cannot become a
 * filesystem call per line.
 */

/** Nothing longer than this is a path; it is a document that got pasted. */
const MAX_PATH_CHARS = 4096;

/** How many lines of a pasted block are even considered. */
const MAX_CANDIDATES = 8;

export interface ClipboardReading {
  /** The raw `FileNameW` buffer, or null when the format is absent. */
  fileNameW?: Uint8Array | null;
  /** `clipboard.readText()`. */
  text?: string | null;
}

/**
 * Decode Explorer's `FileNameW`: UTF-16LE, NUL-terminated.
 *
 * The terminator matters. Windows sets the buffer to a fixed width and pads it,
 * so decoding the whole thing yields a path followed by a run of `\u0000` — a
 * string that no `statSync` will ever match and that would make a correct paste
 * look like a folder that does not exist.
 */
export function decodeFileNameW(buffer: Uint8Array | null | undefined): string | null {
  if (!buffer || buffer.length < 2) return null;
  let text = '';
  for (let i = 0; i + 1 < buffer.length; i += 2) {
    const code = buffer[i] | (buffer[i + 1] << 8);
    if (code === 0) break;
    text += String.fromCharCode(code);
  }
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Is this string even shaped like a local path?
 *
 * A cheap guard rather than a validation: the point is that pasting a paragraph
 * produces zero candidates instead of one `statSync` per line. A drive letter,
 * a UNC prefix, or a POSIX absolute path all pass; a sentence does not.
 */
export function looksLikePath(value: string): boolean {
  if (!value || value.length > MAX_PATH_CHARS) return false;
  // A NUL means it was never one path. Written as `includes` rather than folded
  // into the character class below because a NUL inside a regex is a lint error
  // (`no-control-regex`), and a suppression comment here would be noise.
  if (value.includes(String.fromCharCode(0))) return false;
  // A newline or a tab inside a single candidate means it was never one path.
  if (/[\r\n\t]/.test(value)) return false;
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\') || value.startsWith('/');
}

/** Explorer's "Copy as path" wraps in double quotes; a shell paste may too. */
function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Path-shaped candidates from one clipboard reading, best first, deduplicated.
 *
 * Deduplication is case-insensitive and ignores a trailing separator, matching
 * `ingest.ts`'s `sameRoot` — `C:\dl` and `c:\dl\` are one folder, and returning
 * both would make a paste of a single folder look like a paste of two.
 */
export function folderCandidatesFrom(reading: ClipboardReading): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const value = unquote(raw);
    if (!looksLikePath(value)) return;
    const key = value.replace(/[\\/]+$/, '').toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    if (out.length < MAX_CANDIDATES) out.push(value);
  };

  const explorer = decodeFileNameW(reading.fileNameW);
  if (explorer) push(explorer);

  const text = typeof reading.text === 'string' ? reading.text : '';
  if (text && text.length <= MAX_PATH_CHARS * MAX_CANDIDATES) {
    for (const line of text.split(/\r?\n/)) {
      if (out.length >= MAX_CANDIDATES) break;
      if (line.trim()) push(line);
    }
  }

  return out;
}

/** What the caller's filesystem probe has to be able to answer. */
export interface CandidateProbe {
  /** `null` when the path is absent or unreadable — never a throw. */
  kindOf(path: string): 'directory' | 'file' | null;
  /** `path.dirname`, injected so this module needs no node imports. */
  parentOf(path: string): string;
}

/**
 * Candidates → the folders actually on this machine, in order.
 *
 * Three rules, and the middle one is the only judgement call:
 *
 * - a directory is itself;
 * - a FILE is answered with its PARENT rather than refused. Someone who copied
 *   `ep01.mkv` and pasted it into a folder scanner means the folder it sits in,
 *   and refusing would be technically correct and useless;
 * - anything the probe cannot confirm is DROPPED silently. Offering it would
 *   make the scan report "unreadable root", which blames the folder for a
 *   clipboard that held a path from another machine.
 */
export function resolveFolders(candidates: string[], probe: CandidateProbe): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const keep = (value: string) => {
    const key = value.replace(/[\\/]+$/, '').toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(value);
  };
  for (const candidate of candidates) {
    const kind = probe.kindOf(candidate);
    if (kind === 'directory') {
      keep(candidate);
    } else if (kind === 'file') {
      const parent = probe.parentOf(candidate);
      // `dirname('C:\\')` is `'C:\\'` — a root has no parent, and keeping it
      // would silently offer the whole drive as a scan root.
      if (parent && parent !== candidate) keep(parent);
    }
  }
  return out;
}
