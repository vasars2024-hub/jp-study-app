/**
 * Gate 1's live census — the PRODUCTION `buildFilesIndex`, run against the real
 * profile outside Electron.
 *
 * Bundled with esbuild -- see this directory's README for the command -- so the
 * numbers it prints come from the
 * same module the IPC handler calls, not from a replica that can drift away
 * from it. `defaultFilesContext()` is not reusable here because it calls
 * `app.getPath`; the userData path is passed in instead, which is exactly why
 * the context is injected rather than read inside each enumerator.
 *
 * Read-only: it opens `dict.db` in readonly mode and touches nothing else.
 */
import path from 'node:path';
import Database from 'better-sqlite3';
import { buildFilesIndex, FILES_ENUMERATORS, type FilesSqliteLike } from '../../main/filesApp/enumerators';
import { FILES_TREE } from '../../shared/filesApp/catalog';

const userDataPath = process.argv[2] || path.join(process.env.APPDATA || '', 'jp-study-app');

const snapshot = buildFilesIndex({
  userDataPath,
  openDictionary: () => {
    try {
      // `dictionaryDir()` is `userData/dictionary` — singular. The plural spelt
      // here first opened nothing and printed a confident `dictionaries 0`,
      // which is exactly the shape of the zero gate 1 calls a FINDING.
      return new Database(path.join(userDataPath, 'dictionary', 'dict.db'), {
        readonly: true,
        fileMustExist: true,
      }) as unknown as FilesSqliteLike;
    } catch {
      return null;
    }
  },
});

console.log(`userData: ${userDataPath}`);
console.log(`items: ${snapshot.items.length}`);
console.log('');
console.log('per enumerator:');
for (const report of snapshot.enumerators) {
  console.log(
    `  ${report.source.padEnd(14)} ${String(report.itemCount).padStart(6)}  ${report.elapsedMs}ms${report.error ? `  ERROR ${report.error}` : ''}`,
  );
}
console.log('');
console.log('per category:');
for (const node of FILES_TREE) {
  const count = snapshot.counts.find((c) => c.categoryId === node.id);
  const indent = node.isLeaf ? '    ' : '  ';
  console.log(`${indent}${node.id.padEnd(30 - indent.length)} ${String(count?.total ?? 0).padStart(6)}`);
}

const bytes = snapshot.items.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0);
console.log('');
console.log(`total sized bytes: ${bytes} (${(bytes / 1024 ** 3).toFixed(2)} GB)`);
console.log(`enumerators registered: ${FILES_ENUMERATORS.length}`);
console.log(`broken links: ${snapshot.items.filter((i) => i.flags.brokenLink).length}`);
console.log(`orphans: ${snapshot.items.filter((i) => i.flags.orphan).length}`);
const byProvenance: Record<string, number> = {};
for (const item of snapshot.items) byProvenance[item.provenance] = (byProvenance[item.provenance] ?? 0) + 1;
console.log(`provenance: ${JSON.stringify(byProvenance)}`);
const transcripts = snapshot.items.filter((i) => i.kind === 'transcript');
console.log(`transcript rows: ${transcripts.length}`);
for (const item of transcripts) {
  console.log(`  ${item.flags.orphan ? 'orphan ' : '       '}${item.name}`);
}
const subs = snapshot.items.filter((i) => i.kind === 'subtitle');
console.log(`subtitle rows: ${subs.length}`);
for (const item of subs) {
  console.log(`  ${item.provenance.padEnd(18)} ${item.flags.orphan ? 'orphan ' : '       '}${item.name}`);
}
