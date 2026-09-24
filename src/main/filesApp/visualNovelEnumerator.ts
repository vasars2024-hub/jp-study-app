import fs from 'node:fs';
import path from 'node:path';
import { categoryForKind, type FilesItem } from '../../shared/filesApp/catalog';
import {
  normalizeVisualNovelDatabase,
  VISUAL_NOVEL_DATABASE_FILE,
} from '../../shared/visualNovel';
import type { FilesEnumerator } from './enumerators';

/**
 * The Visual Novels shelf (`sources/visual-novels`).
 *
 * The category existed in the tree and `openPlan.ts` knew where a
 * `visual-novel` row should open, but no enumerator ever produced one, so the
 * shelf read a permanent 0 however many novels the library held. Each library
 * entry is one row; the row points at the entry in the library store rather
 * than at the game's executable, because opening it means "show me this novel",
 * not "run this program", and the router would rightly refuse an `.exe`.
 *
 * Reads the store through `normalizeVisualNovelDatabase`, the same normaliser
 * main uses, so a row here is exactly an entry the app itself would show.
 */
export const visualNovelEnumerator: FilesEnumerator = {
  source: 'visual-novels',
  run(ctx) {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(ctx.userDataPath, VISUAL_NOVEL_DATABASE_FILE), 'utf-8'));
    } catch {
      return [];
    }
    const database = normalizeVisualNovelDatabase(raw);
    return database.entries.map((entry): FilesItem => ({
      id: `visual-novel:${entry.id}`,
      name: entry.japaneseTitle && entry.japaneseTitle !== entry.title
        ? `${entry.title} (${entry.japaneseTitle})`
        : entry.title,
      kind: 'visual-novel',
      categoryId: categoryForKind('visual-novel'),
      provenance: 'installed',
      sizeBytes: null,
      createdAt: entry.createdAt || null,
      modifiedAt: entry.updatedAt || null,
      lastUsedAt: entry.lastPlayedAt,
      location: {
        store: 'json',
        file: VISUAL_NOVEL_DATABASE_FILE,
        pointer: `/entries/${entry.id}`,
      },
      flags: {},
      source: 'visual-novels',
    }));
  },
};
