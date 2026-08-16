// Media that will not play, will not show, or is quietly costing the user
// hundreds of megabytes — ANKI_DECK_WORKBENCH_PLAN.md Phase 7, recipe 11
// ("find missing, broken, duplicate, or oversized media").
//
// The facts this reads are attached to the draft by `buildAnkiDraft`, not
// gathered here: `AnkiDraftMediaRef.present/bytes/duplicateOf` per reference and
// `AnkiDraft.media` for the folder as a whole. That split is deliberate. The
// full catalogue of a real deck is 22,168 files (`HSK_30_Vocabulary…apkg`,
// measured), which must never cross IPC on every page of notes; the per-note
// references do page, and they carry everything a verdict needs.
//
// The verdicts, healthiest first:
//
//   none        the note cites no media at all
//   ok          every reference resolves to a carried file of plausible size
//   unverified  the source did not report enough to judge
//   duplicate   a cited file is byte-identical to one stored under another name
//   oversized   a cited file exceeds the ceiling for its kind
//   broken      a cited file is carried but holds zero bytes
//   missing     a cited file is not in the package at all
//
// **`none` is dropped, not ranked** — the same treatment recipe 15 gives
// `not-generated`. A note with no media is not a healthy media note; it is out
// of this recipe's scope entirely, and letting it inflate the `ok` count would
// make "97% ok" mean nothing on a deck where 97% of notes carry no media.
//
// **`unverified` exists because `present: false` is ambiguous.** A draft built
// from AnkiConnect or a local deck has no media manifest, so every reference
// reads `present: false` while nothing is actually known to be absent. Calling
// that `missing` would hand the user a defect queue holding their entire deck.
//
// **`broken` is zero bytes, and nothing more is claimed.** Sizes come from the
// zip's central directory; the bytes themselves are never decompressed, because
// sniffing 22,168 files' magic numbers to catch the rare truncated mp3 is not a
// trade this surface can make. A zero-byte file is unambiguous, free, and the
// overwhelmingly common shape of broken media in a package that was assembled
// by a script.

import type { AnkiDraft, AnkiDraftMediaRef, AnkiDraftNote } from './ankiDraft';

export type MediaHealth =
  | 'none'
  | 'ok'
  | 'unverified'
  | 'duplicate'
  | 'oversized'
  | 'broken'
  | 'missing';

/** The verdicts, healthiest first — the order a surface should list them in. */
export const MEDIA_HEALTHS: readonly MediaHealth[] = [
  'none',
  'ok',
  'unverified',
  'duplicate',
  'oversized',
  'broken',
  'missing',
];

export function parseMediaHealth(value: string): MediaHealth | null {
  const key = value.trim().toLowerCase();
  return (MEDIA_HEALTHS as readonly string[]).includes(key) ? (key as MediaHealth) : null;
}

/**
 * Size ceilings per reference kind, in bytes.
 *
 * Calibrated against the packages on this machine rather than guessed: the two
 * audio-heavy decks measured 42.3 MB over 10,466 files and 223.5 MB over 22,168
 * files, so a mean clip is 4–10 KB and a 5 MB one is three orders of magnitude
 * off. `unknown` covers `<video>`/`<source>`, where a real embedded clip is
 * legitimately large.
 */
export const MEDIA_SIZE_CEILING: Readonly<Record<AnkiDraftMediaRef['kind'], number>> = {
  image: 1024 * 1024,
  audio: 5 * 1024 * 1024,
  unknown: 20 * 1024 * 1024,
};

export interface MediaHealthOptions {
  /** The source said which files the package carries, so `missing` is answerable. */
  hasManifest: boolean;
  /** The source said how big each one is, so `broken`/`oversized`/`duplicate` are answerable. */
  sized: boolean;
  /** Override the ceilings, e.g. from a saved recipe. */
  ceiling?: Partial<Record<AnkiDraftMediaRef['kind'], number>>;
}

/**
 * One reference's verdict. Never `none`: a reference exists, so something is cited.
 *
 * A carried file whose size was never read is `unverified` and not `ok`. The
 * presence check did pass, but three of the four things this recipe looks for
 * were not run, and a tally that counted it as healthy would say so out loud.
 */
export function refMediaHealth(ref: AnkiDraftMediaRef, options: MediaHealthOptions): MediaHealth {
  // Without a manifest `present` is false for everything, so it cannot be read
  // as absence — that would report a whole AnkiConnect deck as missing media.
  if (!options.hasManifest) return 'unverified';
  if (!ref.present) return 'missing';
  if (!options.sized || ref.bytes == null) return 'unverified';
  if (ref.bytes === 0) return 'broken';
  const ceiling = options.ceiling?.[ref.kind] ?? MEDIA_SIZE_CEILING[ref.kind];
  if (ref.bytes > ceiling) return 'oversized';
  return ref.duplicateOf != null ? 'duplicate' : 'ok';
}

const SEVERITY = new Map<MediaHealth, number>(MEDIA_HEALTHS.map((h, i) => [h, i]));

/**
 * The worst verdict across one note's references.
 *
 * An empty list is `none` — the note cites nothing, which is not a defect and
 * not a clean bill of health either.
 */
export function worstMediaHealth(healths: readonly MediaHealth[]): MediaHealth {
  const judged = healths.filter((h) => h !== 'none');
  if (judged.length === 0) return 'none';
  let worst: MediaHealth = 'ok';
  for (const health of judged) {
    if ((SEVERITY.get(health) ?? 0) > (SEVERITY.get(worst) ?? 0)) worst = health;
  }
  return worst;
}

export function noteMediaHealth(note: AnkiDraftNote, options: MediaHealthOptions): MediaHealth {
  if (note.media.length === 0) return 'none';
  return worstMediaHealth(note.media.map((ref) => refMediaHealth(ref, options)));
}

/**
 * Per-note verdicts for a whole draft, for the Browser's `media:` predicate.
 *
 * Precomputed for the same reason `CardHealthContext` is: the filter runs per
 * row on every keystroke. Unlike a render this is cheap, but the map also
 * carries the `sized` decision so a row cannot answer it differently.
 */
export type MediaHealthContext = ReadonlyMap<string, MediaHealth>;

export function buildMediaHealthContext(
  draft: AnkiDraft,
  ceiling?: MediaHealthOptions['ceiling'],
): MediaHealthContext {
  const options: MediaHealthOptions = {
    hasManifest: draft.media != null,
    sized: draft.media?.sized === true,
    ceiling,
  };
  const byNote = new Map<string, MediaHealth>();
  for (const note of draft.notes) byNote.set(note.id, noteMediaHealth(note, options));
  return byNote;
}

export interface MediaHealthTally {
  none: number;
  ok: number;
  unverified: number;
  duplicate: number;
  oversized: number;
  broken: number;
  missing: number;
}

export function emptyMediaHealthTally(): MediaHealthTally {
  return { none: 0, ok: 0, unverified: 0, duplicate: 0, oversized: 0, broken: 0, missing: 0 };
}

export function tallyMediaHealth(healths: Iterable<MediaHealth>): MediaHealthTally {
  const tally = emptyMediaHealthTally();
  for (const health of healths) tally[health] += 1;
  return tally;
}

export interface MediaFileDefect {
  fileName: string;
  health: Exclude<MediaHealth, 'none' | 'ok'>;
  kind: AnkiDraftMediaRef['kind'];
  bytes?: number;
  /** The canonical file this one copies, on `duplicate`. */
  duplicateOf?: string;
  /** How many notes cite it. */
  notes: number;
}

/**
 * The same verdicts counted per FILE rather than per note — and the surface must
 * show both.
 *
 * Measured on `HSK_30_Vocabulary_Mandarin_Chinese_Simplified_Characters.apkg`:
 * **one** file is absent (`1sec_silence.mp3`) and **11,084 of 11,086** notes
 * cite it. A note tally alone reads as eleven thousand defects; the file tally
 * says it is one download. Both numbers are true and neither is sufficient.
 *
 * Sorted worst verdict first, then by bytes descending, so the row that costs
 * the most is the row on top of its group.
 */
export function mediaFileDefects(
  draft: AnkiDraft,
  ceiling?: MediaHealthOptions['ceiling'],
): MediaFileDefect[] {
  const options: MediaHealthOptions = {
    hasManifest: draft.media != null,
    sized: draft.media?.sized === true,
    ceiling,
  };
  const byFile = new Map<string, MediaFileDefect>();
  for (const note of draft.notes) {
    const seen = new Set<string>();
    for (const ref of note.media) {
      const health = refMediaHealth(ref, options);
      if (health === 'ok' || health === 'none') continue;
      const existing = byFile.get(ref.fileName);
      if (existing) {
        // One note citing the same file from two fields is one affected note.
        if (!seen.has(ref.fileName)) existing.notes += 1;
      } else {
        byFile.set(ref.fileName, {
          fileName: ref.fileName,
          health,
          kind: ref.kind,
          bytes: ref.bytes,
          duplicateOf: ref.duplicateOf,
          notes: 1,
        });
      }
      seen.add(ref.fileName);
    }
  }
  return [...byFile.values()].sort(
    (a, b) =>
      (SEVERITY.get(b.health) ?? 0) - (SEVERITY.get(a.health) ?? 0) ||
      (b.bytes ?? 0) - (a.bytes ?? 0) ||
      a.fileName.localeCompare(b.fileName),
  );
}

/**
 * Bytes a deck would get back by dropping every duplicate copy and every file no
 * note cites. Reported, never acted on: this recipe's verb is "find", and
 * deleting media out of a package is not a change the tray can undo.
 */
export function reclaimableMediaBytes(draft: AnkiDraft): number | undefined {
  if (draft.media?.sized !== true) return undefined;
  let bytes = 0;
  const counted = new Set<string>();
  for (const note of draft.notes) {
    for (const ref of note.media) {
      if (ref.duplicateOf == null || ref.bytes == null) continue;
      if (counted.has(ref.fileName)) continue;
      counted.add(ref.fileName);
      bytes += ref.bytes;
    }
  }
  return bytes;
}
