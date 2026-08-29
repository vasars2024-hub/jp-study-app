/**
 * Getting a local deck — with its audio — out of the app.
 *
 * Everything this lane produces (aligned clips cut from a video, offline
 * speech, generated readings) lived only inside the app: the one export path
 * from the local deck was a six-column CSV that dropped audio entirely. A deck
 * you cannot take to Anki is a deck you can lose.
 *
 * The route is Anki's own documented one for a *new* deck — a text file with a
 * `[sound:…]` field plus the media beside it — not the package editor in
 * `main/anki/`, which by contract rewrites an existing `.apkg` against its
 * fingerprint and has no way to author one from nothing.
 *
 * Pure on purpose: the filename rules are where a wrong answer is silent (two
 * cards overwriting one file exports a deck where half the audio is somebody
 * else's), so they are decided here and tested without a filesystem.
 */

/** The card fields this export reads. Structural, so both card shapes fit. */
export interface DeckMediaExportCard {
  id: string;
  word?: string;
  reading?: string;
  meaning?: string;
  sentence?: string;
  front?: string;
  back?: string;
  audioPath?: string;
  audioDataUrl?: string;
}

/** One file to write next to the text export. */
export interface DeckMediaItem {
  /** Filename inside the media folder, and what the `[sound:…]` tag names. */
  fileName: string;
  /** A managed file to copy. Mutually exclusive with `dataUrl`. */
  sourcePath?: string;
  /** An inline clip to decode and write. Mutually exclusive with `sourcePath`. */
  dataUrl?: string;
}

export interface DeckMediaExport {
  /** Header first, then one row per card, in deck order. */
  rows: string[][];
  media: DeckMediaItem[];
  /** Cards carrying no audio at all. Reported, never presented as exported. */
  withoutAudio: number;
}

export const DECK_EXPORT_HEADERS = [
  'Expression',
  'Reading',
  'Meaning',
  'Sentence',
  'Front',
  'Back',
  'Audio',
];

const EXTENSION = /\.(mp3|wav|aiff|aif|m4a|ogg|opus|flac)$/i;

/** The extension a data URL's mime type implies, defaulting to the common case. */
export function extensionForDataUrl(dataUrl: string): string {
  const mime = /^data:audio\/([a-z0-9.+-]+)/i.exec(dataUrl)?.[1]?.toLowerCase() ?? '';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('aiff') || mime.includes('aif')) return 'aiff';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  return 'mp3';
}

/**
 * The media filename for one card.
 *
 * Keyed on the card id, not on the word: a deck legitimately holds the same
 * word twice, and naming by word would make the second card silently overwrite
 * the first. The id is sanitised rather than hashed so a user looking in the
 * folder can still tell which file belongs to which card.
 */
export function mediaFileNameFor(card: DeckMediaExportCard, prefix = 'jpstudy'): string | null {
  const safeId = card.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(-40) || 'card';
  if (card.audioPath) {
    const extension = EXTENSION.exec(card.audioPath)?.[1]?.toLowerCase() ?? 'mp3';
    return `${prefix}-${safeId}.${extension}`;
  }
  if (card.audioDataUrl) return `${prefix}-${safeId}.${extensionForDataUrl(card.audioDataUrl)}`;
  return null;
}

/**
 * Build the rows and the media list for one deck.
 *
 * A card with both a file and an inline clip exports the file: it is the
 * managed asset with a real location the app can reveal, and the data URL is
 * the same audio carried a heavier way.
 */
export function buildDeckMediaExport(
  cards: readonly DeckMediaExportCard[],
): DeckMediaExport {
  const rows: string[][] = [[...DECK_EXPORT_HEADERS]];
  const media: DeckMediaItem[] = [];
  const used = new Set<string>();
  let withoutAudio = 0;

  for (const card of cards) {
    let fileName = mediaFileNameFor(card);
    if (fileName) {
      // Two cards sharing an id would be a bug elsewhere, but a collision here
      // would silently export one card's audio under another's name.
      let unique = fileName;
      let n = 2;
      while (used.has(unique)) unique = fileName.replace(/(\.[^.]+)$/, `-${n++}$1`);
      used.add(unique);
      fileName = unique;
      media.push(card.audioPath
        ? { fileName, sourcePath: card.audioPath }
        : { fileName, dataUrl: card.audioDataUrl });
    } else {
      withoutAudio += 1;
    }
    rows.push([
      card.word ?? '',
      card.reading ?? '',
      card.meaning ?? '',
      card.sentence ?? '',
      card.front ?? '',
      card.back ?? '',
      fileName ? `[sound:${fileName}]` : '',
    ]);
  }

  return { rows, media, withoutAudio };
}
