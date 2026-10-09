/**
 * The manga reader's "Import .mokuro" action: read the picked file, hand its
 * text to main, and say what happened in the UI language.
 *
 * Kept out of `MangaReader.tsx` so the outcome wording is testable without
 * mounting the reader.
 */
import type { MangaMokuroImportResult } from '../shared/mangaOcrIpc';
import { MOKURO_VOLUME_MAX_BYTES } from '../shared/mokuroVolume';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export interface MokuroImportOutcome {
  ok: boolean;
  message: string;
}

/** The sentence for an import result. */
export function mokuroImportMessage(result: MangaMokuroImportResult, t: Translate): string {
  if (result.ok) {
    const done = t('read2.manga.mokuro.imported', { count: result.pages });
    const order = result.matchedBy === 'order' ? ` ${t('read2.manga.mokuro.byOrder')}` : '';
    const left = result.unmatched > 0 ? ` ${t('read2.manga.mokuro.unmatched', { count: result.unmatched })}` : '';
    return `${done}${order}${left}`;
  }
  return t(`read2.manga.mokuro.error.${result.reason}`);
}

/** Read `file` and import it into `itemId`'s OCR cache. Never throws. */
export async function importMokuroFile(
  itemId: string,
  file: Pick<File, 'size' | 'text'>,
  t: Translate,
): Promise<MokuroImportOutcome> {
  if (file.size > MOKURO_VOLUME_MAX_BYTES) {
    return { ok: false, message: t('read2.manga.mokuro.error.tooLarge') };
  }
  const run = window.api.mangaOcrImportMokuro;
  if (typeof run !== 'function') return { ok: false, message: t('read2.manga.mokuro.error.invalid') };
  try {
    const result = await run(itemId, await file.text());
    return { ok: result.ok, message: mokuroImportMessage(result, t) };
  } catch {
    return { ok: false, message: t('read2.manga.mokuro.error.invalid') };
  }
}
