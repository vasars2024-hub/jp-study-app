/**
 * Gate 1's renderer half — the PRODUCTION renderer enumerators, run against
 * store values pulled out of the live app.
 *
 * The census (`census.ts`) can only see what MAIN sees. `jp-flashcard-deck`
 * and `jp-annotations:*` are renderer `localStorage`, which Chromium keeps in a
 * Snappy-blocked LevelDB — no main-process reader can decode it, so those rows
 * would read a permanent 0 in that output forever. That is the same FINDING
 * shape gate 1 names, produced by a process boundary rather than a wrong path.
 *
 * This is not a replica either: it imports `rendererEnumerators.ts` itself, so
 * a reader that drifts breaks this too. Both functions take their store value
 * as a parameter for exactly this reason — the argument is the seam that lets
 * production code run against real data outside the renderer that owns it.
 *
 * Input is the JSON body of one bridge `/eval` (see README), so nothing here
 * touches the app or its stores; it reads a file that was already fetched.
 */
import fs from 'node:fs';
import {
  annotationFilesItems,
  flashcardDeckFilesItems,
} from '../../renderer/components/filesapp/rendererEnumerators';
import { countByCategory, type FilesItem } from '../../shared/filesApp/catalog';

interface Pulled {
  deck: string | null;
  anno: Record<string, string>;
}

const file = process.argv[2] || 'debug/live-stores.json';
const envelope = JSON.parse(fs.readFileSync(file, 'utf-8')) as { ok: boolean; result: string };
if (!envelope.ok) throw new Error(`bridge returned not-ok: ${JSON.stringify(envelope).slice(0, 200)}`);
const pulled = JSON.parse(envelope.result) as Pulled;

const byBook: Record<string, ReturnType<typeof JSON.parse>> = {};
for (const [key, raw] of Object.entries(pulled.anno ?? {})) {
  // The store key is `jp-annotations:<bookId>`; the enumerator wants the id.
  byBook[key.slice('jp-annotations:'.length)] = JSON.parse(raw) as never;
}

const deckItems: FilesItem[] = flashcardDeckFilesItems(pulled.deck);
const annoItems: FilesItem[] = annotationFilesItems(byBook);
const items = [...deckItems, ...annoItems];

console.log(`deck store bytes: ${pulled.deck ? pulled.deck.length : 0}`);
console.log(`annotation keys:  ${Object.keys(pulled.anno ?? {}).length}`);
console.log('');
console.log(`local-deck rows:  ${deckItems.length}`);
console.log(`  mined-card      ${deckItems.filter((i) => i.kind === 'mined-card').length}`);
console.log(`  deck (folders)  ${deckItems.filter((i) => i.kind === 'deck').length}`);
console.log(`highlights rows:  ${annoItems.length}`);
console.log('');
console.log('per category:');
for (const count of countByCategory(items)) {
  if (count.total > 0) console.log(`  ${count.categoryId.padEnd(24)} ${count.total}`);
}
console.log('');
const provenance: Record<string, number> = {};
for (const item of items) provenance[item.provenance] = (provenance[item.provenance] ?? 0) + 1;
console.log(`provenance: ${JSON.stringify(provenance)}`);
const withDates = items.filter((i) => i.createdAt !== null).length;
console.log(`rows carrying a real createdAt: ${withDates} of ${items.length}`);
console.log(`rows ever reviewed: ${items.filter((i) => i.lastUsedAt !== null).length}`);
console.log(`ids unique: ${new Set(items.map((i) => i.id)).size === items.length}`);
