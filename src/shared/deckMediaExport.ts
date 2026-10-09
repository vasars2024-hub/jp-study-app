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

import type { LocalSrsState } from './localSrs';

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
  /** A managed picture (mined screenshot, imported image); exported with `includeImages`. */
  imagePath?: string;
  /** The card's local schedule; exported with `includeSchedule`. */
  srs?: LocalSrsState;
  suspended?: boolean;
}

/** What an export carries beyond the original text + audio columns. Both off by default. */
export interface DeckMediaExportOptions {
  /** Add an `Image` column and copy each card's managed picture. */
  includeImages?: boolean;
  /** Return each card's schedule so the package keeps reviewed cards reviewed. */
  includeSchedule?: boolean;
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
  /** Per card row, with `includeSchedule`: what the package writes as Anki scheduling columns. */
  schedules?: Array<{ srs?: LocalSrsState; suspended?: boolean } | null>;
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
  options: DeckMediaExportOptions = {},
): DeckMediaExport {
  const rows: string[][] = [options.includeImages ? [...DECK_EXPORT_HEADERS, 'Image'] : [...DECK_EXPORT_HEADERS]];
  const media: DeckMediaItem[] = [];
  const used = new Set<string>();
  const schedules: Array<{ srs?: LocalSrsState; suspended?: boolean } | null> = [];
  let withoutAudio = 0;
  // Two cards sharing an id would be a bug elsewhere, but a collision here
  // would silently export one card's media under another's name.
  const claim = (name: string): string => {
    let unique = name;
    let n = 2;
    while (used.has(unique)) unique = name.replace(/(\.[^.]+)$/, `-${n++}$1`);
    used.add(unique);
    return unique;
  };

  for (const card of cards) {
    let fileName = mediaFileNameFor(card);
    if (fileName) {
      fileName = claim(fileName);
      media.push(card.audioPath
        ? { fileName, sourcePath: card.audioPath }
        : { fileName, dataUrl: card.audioDataUrl });
    } else {
      withoutAudio += 1;
    }
    const row = [
      card.word ?? '',
      card.reading ?? '',
      card.meaning ?? '',
      card.sentence ?? '',
      card.front ?? '',
      card.back ?? '',
      fileName ? `[sound:${fileName}]` : '',
    ];
    if (options.includeImages) {
      let imageName = imageFileNameFor(card);
      if (imageName && card.imagePath) {
        imageName = claim(imageName);
        media.push({ fileName: imageName, sourcePath: card.imagePath });
      }
      row.push(imageName ? `<img src="${imageName}">` : '');
    }
    rows.push(row);
    if (options.includeSchedule) {
      schedules.push(card.srs || card.suspended
        ? { ...(card.srs ? { srs: card.srs } : {}), ...(card.suspended ? { suspended: true } : {}) }
        : null);
    }
  }

  return { rows, media, withoutAudio, ...(options.includeSchedule ? { schedules } : {}) };
}

const IMAGE_EXTENSION = /\.(png|jpe?g|webp|gif|avif)$/i;

/** The exported picture's filename: card-keyed like the audio, under its own prefix. */
export function imageFileNameFor(card: Pick<DeckMediaExportCard, 'id' | 'imagePath'>): string | null {
  if (!card.imagePath) return null;
  const extension = IMAGE_EXTENSION.exec(card.imagePath)?.[1]?.toLowerCase();
  if (!extension) return null;
  const safeId = card.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(-40) || 'card';
  return `jpstudy-img-${safeId}.${extension === 'jpeg' ? 'jpg' : extension}`;
}
