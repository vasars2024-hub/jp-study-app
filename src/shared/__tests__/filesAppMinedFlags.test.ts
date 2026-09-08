// @vitest-environment node
/**
 * D421 — the mining half of gate 19, which the transcription half already had.
 *
 * Gate 19 asks that a saved search change its membership after the thing it
 * asks about happens, "with the count before and after both reported". That was
 * true for *Untranscribed videos* and structurally impossible for *Text not yet
 * mined*: `flags.mined` was written only onto deck cards, never onto the
 * subtitle/transcript/book a card came out of, so the preset matched every text
 * item forever. Live, it read 98 before 141 cards were mined out of it and 98
 * after.
 *
 * Every membership assertion here is therefore a NUMBER, for the same reason the
 * transcription suite says so: "membership changed" is an adjective.
 */
import { describe, expect, it } from 'vitest';
import {
  EMPTY_SMART_FOLDERS_DOC,
  matchesSmartFolder,
  smartFolderById,
} from '../filesApp/smartFolders';
import { deriveMinedFlags, type FilesItem } from '../filesApp/catalog';
import { mineBookIdFor, minedSourceIdFromBookId } from '../filesApp/mining';

function item(
  over: Partial<FilesItem> & Pick<FilesItem, 'id' | 'name' | 'kind' | 'categoryId'>,
): FilesItem {
  return {
    provenance: 'unknown',
    sizeBytes: null,
    createdAt: null,
    modifiedAt: null,
    lastUsedAt: null,
    location: { store: 'derived', describes: 'test' },
    flags: {},
    source: 'test',
    ...over,
  };
}

const UNMINED = smartFolderById(EMPTY_SMART_FOLDERS_DOC, 'preset:unmined-text')?.criteria ?? {
  kinds: ['subtitle', 'transcript', 'book'],
  flags: { mined: false },
};

/** One of each kind the preset asks about, plus a video it must never touch. */
const TEXTS: FilesItem[] = [
  item({ id: 'downloads:ep39.ass', name: 'ep39.ass', kind: 'subtitle', categoryId: 'text' }),
  item({ id: 'transcript:abcdefghijk', name: 'vlog.vtt', kind: 'transcript', categoryId: 'text' }),
  item({ id: 'books:1q84', name: '1Q84', kind: 'book', categoryId: 'books' }),
  item({ id: 'downloads:movie.mkv', name: 'movie.mkv', kind: 'video', categoryId: 'video' }),
];

function unminedCount(items: readonly FilesItem[]): number {
  return items.filter((i) => matchesSmartFolder(i, UNMINED)).length;
}

describe('deriveMinedFlags — gate 19 for mining', () => {
  it('leaves every text item unmined when the deck is empty', () => {
    const derived = deriveMinedFlags(TEXTS, new Set());
    expect(unminedCount(derived)).toBe(3);
    // Absent, not false: "we could not tell" and "not mined" are different answers.
    expect(derived.every((i) => i.flags.mined === undefined)).toBe(true);
  });

  it('drops a text item out of the saved search once a card names it as its source', () => {
    expect(unminedCount(TEXTS)).toBe(3);
    const mined = deriveMinedFlags(TEXTS, new Set(['downloads:ep39.ass']));
    expect(unminedCount(mined)).toBe(2);
    expect(mined.find((i) => i.id === 'downloads:ep39.ass')?.flags.mined).toBe(true);
  });

  it('reports the whole before/after count as more sources are mined', () => {
    expect(unminedCount(TEXTS)).toBe(3);
    const all = deriveMinedFlags(
      TEXTS,
      new Set(['downloads:ep39.ass', 'transcript:abcdefghijk', 'books:1q84']),
    );
    expect(unminedCount(all)).toBe(0);
  });

  it('never marks a kind the preset does not ask about, even when named', () => {
    const derived = deriveMinedFlags(TEXTS, new Set(['downloads:movie.mkv']));
    expect(derived.find((i) => i.id === 'downloads:movie.mkv')?.flags.mined).toBe(undefined);
    expect(unminedCount(derived)).toBe(3);
  });

  it('leaves an unnamed text item absent rather than false', () => {
    const derived = deriveMinedFlags(TEXTS, new Set(['downloads:ep39.ass']));
    expect(derived.find((i) => i.id === 'books:1q84')?.flags.mined).toBe(undefined);
  });

  it('round-trips the deck link, so the two directions cannot drift', () => {
    const source = TEXTS[0];
    expect(minedSourceIdFromBookId(mineBookIdFor(source))).toBe(source.id);
  });

  it('claims nothing from a card this app did not mine out of a Files row', () => {
    // The harvest flow writes `harvest:…` and an import writes `import-…`.
    expect(minedSourceIdFromBookId('harvest:jojo')).toBe(null);
    expect(minedSourceIdFromBookId('import-zzprobe-headerless')).toBe(null);
    expect(minedSourceIdFromBookId(undefined)).toBe(null);
    expect(minedSourceIdFromBookId('files:')).toBe(null);
  });

  it('does not clear a mined flag an enumerator already set', () => {
    const card = item({
      id: 'deck-card:1',
      name: 'card',
      kind: 'mined-card',
      categoryId: 'mined',
      flags: { mined: true },
    });
    const derived = deriveMinedFlags([card], new Set(['something-else']));
    expect(derived[0].flags.mined).toBe(true);
  });
});
