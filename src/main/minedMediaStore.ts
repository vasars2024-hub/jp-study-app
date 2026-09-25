// Content-addressed card media, without Electron.
//
// Split out of `flashcardAudio.ts` so the .apkg import can store a deck's
// media from the utility process that parses it (`anki/apkgNoteRead.ts`): the
// directory arrives in the job message, and the naming here is the same one
// `storeMinedMedia` uses, so a clip imported twice is stored once and the
// managed-library sweep treats both routes alike.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MINED_MEDIA_EXTENSIONS = new Set([
  '.webm', '.mp3', '.ogg', '.m4a', '.wav', '.mp4', '.png', '.jpg', '.jpeg', '.webp',
]);
/** A mined clip or screenshot; a larger payload is not a card asset. */
export const MINED_MEDIA_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Where mined and imported card media live: `<userData>/flashcard-audio/mined`,
 * inside the managed audio root `flashcardAudio.ts` reads and sweeps. Takes
 * userData as an argument so a utility process and main agree without either
 * importing Electron here.
 */
export function minedMediaDirectoryUnder(userData: string): string {
  return path.join(userData, 'flashcard-audio', 'mined');
}

export interface StoredMinedMedia {
  ok: boolean;
  path?: string;
  error?: string;
}

/** Write `bytes` as `<sha256[0..24]><ext>` under `directory` (once). */
export function writeMinedMediaBytes(directory: string, bytes: Uint8Array, extension: string): StoredMinedMedia {
  const ext = extension.toLowerCase();
  if (!MINED_MEDIA_EXTENSIONS.has(ext)) return { ok: false, error: 'unsupported-type' };
  if (!bytes.length) return { ok: false, error: 'empty' };
  if (bytes.length > MINED_MEDIA_MAX_BYTES) return { ok: false, error: 'too-large' };
  const output = path.join(
    directory,
    `${crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 24)}${ext}`,
  );
  try {
    fs.mkdirSync(directory, { recursive: true });
    if (!fs.existsSync(output)) fs.writeFileSync(output, bytes);
    return { ok: true, path: output };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
