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
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { buildFilesIndex, FILES_ENUMERATORS, type FilesSqliteLike } from '../../main/filesApp/enumerators';
import { FILES_TREE, type FilesItem } from '../../shared/filesApp/catalog';
import { mineabilityOf } from '../../shared/filesApp/mining';

// Filter EVERY flag, not a named list: `--detail` slipped through a
// `!== '--mining'` filter and became the userData path, so the census walked a
// directory called `--detail`, found nothing, and printed a confident empty
// report next to a summary that said 1 finding.
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const miningMode = process.argv.includes('--mining');
const userDataPath = args[0] || path.join(process.env.APPDATA || '', 'jp-study-app');

const ctx = {
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
};

const snapshot = buildFilesIndex(ctx);

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

/* ------------------------------------------------------------------ *
 * `--mining` — MINING_UNIFICATION_PLAN.md gate 5.
 * ------------------------------------------------------------------ */

/**
 * Gate 5: "One call returns every mineable asset across the stores — YouTube
 * transcripts from `yt-transcripts/`, subtitle sidecars, harvested anime
 * subtitles, epubs — each carrying its provenance and media type. Report the
 * count per category against what is actually on disk. A category returning 0
 * while files exist for it is a FINDING; a category legitimately empty must say
 * so rather than be omitted."
 *
 * ONE call is the whole point, so this reuses the `buildFilesIndex` snapshot
 * already taken above rather than enumerating a second time, and filters it
 * with the PRODUCTION `mineabilityOf`. A private copy of that predicate would
 * make this census agree with itself and with nothing else.
 *
 * "Against what is actually on disk" needs a control that does NOT come from the
 * enumerators, or the comparison is the index checking its own homework. So the
 * directories below are spelled out here, from the gate's own words, and walked
 * with plain `fs`. This is not redundancy: `dictionary` was once spelled
 * `dictionaries` inside an enumerator and it printed a confident, wrong zero.
 */
interface DiskProbe {
  /** What the gate calls this category. */
  label: string;
  /** Where it lives, relative to userData — the gate's own words, not the code's. */
  dir: string;
  /** Recurse, or only the top level? */
  deep: boolean;
  /** Which files count. */
  match: (name: string) => boolean;
  /** Which index rows are supposed to answer for it. */
  claims: (item: FilesItem) => boolean;
}

const SUBTITLE_EXT = /\.(srt|vtt|ass|ssa|sub)$/i;

/** Is this path really inside `userData/<folder>`, and not merely near a folder of that name? */
function under(candidate: string | undefined, folder: string): boolean {
  if (!candidate) return false;
  const root = path.join(userDataPath, folder).toLowerCase() + path.sep;
  return candidate.toLowerCase().startsWith(root);
}

const DISK_PROBES: DiskProbe[] = [
  {
    label: 'YouTube transcripts',
    dir: 'yt-transcripts',
    deep: false,
    match: (n) => n.toLowerCase().endsWith('.json'),
    claims: (i) => i.kind === 'transcript',
  },
  {
    label: 'subtitle sidecars (downloads)',
    dir: 'downloads',
    deep: true,
    match: (n) => SUBTITLE_EXT.test(n),
    // Anchored at the userData root, NOT a bare `\downloads\` substring. The
    // loose form also matched `C:\Users\<user>\Downloads\...` — the user's own
    // Explorer folder — and reported a file that exists as a row pointing at a
    // file that is gone. The index was right and the probe was wrong.
    claims: (i) => i.kind === 'subtitle' && i.location.store === 'file'
      && under(i.location.path, 'downloads'),
  },
  {
    label: 'harvested anime subtitles',
    dir: 'subtitles',
    deep: true,
    match: (n) => SUBTITLE_EXT.test(n),
    claims: (i) => i.kind === 'subtitle' && i.location.store === 'file'
      && under(i.location.path, 'subtitles'),
  },
  {
    label: 'epubs / books',
    dir: 'library',
    deep: true,
    match: (n) => /\.(epub|txt|html?)$/i.test(n),
    claims: (i) => i.kind === 'book',
  },
];

function walk(dir: string, deep: boolean, match: (name: string) => boolean): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (deep) out.push(...walk(full, deep, match));
    } else if (entry.isFile() && match(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

if (miningMode) {
  console.log('');
  console.log('=== MINING gate 5 — every mineable asset, from ONE index call ===');
  console.log('');

  const mineable = snapshot.items.filter((i) => mineabilityOf(i).mineable);
  const refused = snapshot.items.length - mineable.length;
  console.log(`index rows: ${snapshot.items.length}`);
  console.log(`mineable:   ${mineable.length}`);
  console.log(`refused:    ${refused}`);

  console.log('');
  console.log('mineable by KIND (media type):');
  const byKind: Record<string, number> = {};
  for (const item of mineable) byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
  for (const [kind, n] of Object.entries(byKind).sort()) {
    console.log(`  ${kind.padEnd(14)} ${String(n).padStart(6)}`);
  }

  console.log('');
  console.log('mineable by PROVENANCE:');
  const byProv: Record<string, number> = {};
  for (const item of mineable) byProv[item.provenance] = (byProv[item.provenance] ?? 0) + 1;
  for (const [prov, n] of Object.entries(byProv).sort()) {
    console.log(`  ${prov.padEnd(20)} ${String(n).padStart(6)}`);
  }
  // Every value the type allows, so an absent one is STATED rather than omitted.
  const missingProv = ['human-subs', 'auto-captions', 'whisper-transcript', 'book-text']
    .filter((p) => !(p in byProv));
  console.log(`  (text provenances with no mineable row: ${missingProv.join(', ') || 'none'})`);

  console.log('');
  console.log('index vs DISK — the control walks the directories itself:');
  let findings = 0;
  for (const probe of DISK_PROBES) {
    const dir = path.join(userDataPath, probe.dir);
    const onDisk = walk(dir, probe.deep, probe.match);
    const claimed = snapshot.items.filter(probe.claims);
    const claimedMineable = claimed.filter((i) => mineabilityOf(i).mineable);
    /*
     * An index row pointing at a file that is gone is not automatically a
     * defect — it is only a defect if the index does not SAY so. The counts
     * differ legitimately when the difference is exactly the broken links, and
     * that is what this reconciles rather than leaving as an unexplained gap.
     */
    const present = new Set(onDisk.map((p) => p.toLowerCase()));
    const missing = claimed.filter((i) => !present.has((i.location.path ?? '').toLowerCase()));
    const missingAdmitted = missing.filter((i) => i.flags.brokenLink);
    const verdict =
      onDisk.length > 0 && claimed.length === 0
        ? 'FINDING — files exist, index says 0'
        : missing.length !== missingAdmitted.length
          ? `FINDING — ${missing.length - missingAdmitted.length} row(s) point at a file that is gone WITHOUT the brokenLink flag`
          : onDisk.length === 0 && claimed.length === 0
            ? 'empty on disk AND in the index — an honest zero'
            : missing.length
              ? `ok — ${missing.length} gone, all ${missingAdmitted.length} flagged brokenLink`
              : 'ok';
    if (verdict.startsWith('FINDING')) findings += 1;
    // Distinct paths, because two enumerators listing the same sidecar is a
    // duplicate ROW, not a second file, and the gate's count must not read as
    // more assets than exist.
    const distinct = new Set(claimed.map((i) => (i.location.path ?? '').toLowerCase())).size;
    console.log(
      `  ${probe.label.padEnd(30)} disk ${String(onDisk.length).padStart(5)}` +
        `  index ${String(claimed.length).padStart(5)}` +
        ` (${String(distinct).padStart(4)} distinct)` +
        `  mineable ${String(claimedMineable.length).padStart(5)}   ${verdict}`,
    );
  }

  console.log('');
  console.log('a refusal is NAMED, not silent — reasons across the whole index:');
  const reasons: Record<string, number> = {};
  for (const item of snapshot.items) {
    const m = mineabilityOf(item);
    if (!m.mineable) reasons[m.reasonKey] = (reasons[m.reasonKey] ?? 0) + 1;
  }
  for (const [key, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${key.padEnd(46)} ${String(n).padStart(6)}`);
  }

  console.log('');
  console.log(`GATE 5 FINDINGS: ${findings}`);
}

/**
 * `--mining --detail` names the rows the reconciliation above could not match,
 * because "1 row is wrong" is not actionable and the point of this census is a
 * number someone can act on.
 */
if (miningMode && process.argv.includes('--detail')) {
  console.log('');
  console.log('unmatched rows, per probe:');
  for (const probe of DISK_PROBES) {
    const present = new Set(
      walk(path.join(userDataPath, probe.dir), probe.deep, probe.match).map((p) => p.toLowerCase()),
    );
    for (const item of snapshot.items.filter(probe.claims)) {
      const p = (item.location.path ?? '').toLowerCase();
      if (!present.has(p)) {
        console.log(
          `  [${probe.dir}] brokenLink=${item.flags.brokenLink ? 'yes' : 'NO '} ` +
            `exists=${fs.existsSync(item.location.path ?? '') ? 'yes' : 'no '} ${item.location.path}`,
        );
      }
    }
  }
}

/**
 * `--dupes` — the same file claimed by more than one enumerator.
 *
 * Gate 5 reports a COUNT of assets, so a file listed twice overstates what the
 * user has. This says whether that is happening and which enumerators disagree
 * about who owns the row.
 *
 * It prints TWO passes over the same profile in one run. The CONTROL flattens
 * every enumerator's own output with no deduplication at all, which is what
 * `buildFilesIndex` did before 2026-09-01; the PRODUCTION pass is the shipped
 * snapshot. A fix that had merely stopped one enumerator from looking would
 * move both numbers together — only a deduplication moves the second while the
 * first stands still.
 */
if (process.argv.includes('--dupes')) {
  const groupByPath = (items: readonly FilesItem[]): Map<string, FilesItem[]> => {
    const byPath = new Map<string, FilesItem[]>();
    for (const item of items) {
      if (item.location.store !== 'file' || !item.location.path) continue;
      const key = item.location.path.toLowerCase();
      byPath.set(key, [...(byPath.get(key) ?? []), item]);
    }
    return byPath;
  };

  const report = (label: string, items: readonly FilesItem[], show: boolean): number => {
    const byPath = groupByPath(items);
    let dupes = 0;
    const pairs: Record<string, number> = {};
    for (const [key, group] of byPath) {
      if (group.length < 2) continue;
      dupes += group.length - 1;
      const sources = group.map((i) => i.id.split(':')[0]).sort().join(' + ');
      pairs[sources] = (pairs[sources] ?? 0) + 1;
      if (show && dupes <= 8) console.log(`  ${sources.padEnd(28)} ${key}`);
    }
    console.log(
      `${label}: ${items.length} rows, ${byPath.size} distinct files, ${dupes} duplicate rows`,
    );
    for (const [sources, n] of Object.entries(pairs).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${sources.padEnd(34)} ${n}`);
    }
    return dupes;
  };

  console.log('');
  console.log('files claimed by more than one row:');

  // CONTROL — every enumerator's raw output, concatenated, nothing dropped.
  const raw: FilesItem[] = [];
  for (const enumerator of FILES_ENUMERATORS) {
    try {
      raw.push(...enumerator.run(ctx));
    } catch {
      /* an unreadable store is already reported by the production pass */
    }
  }
  const rawDupes = report('  CONTROL (no dedupe)', raw, true);
  const liveDupes = report('  PRODUCTION (buildFilesIndex)', snapshot.items, false);

  console.log('');
  const dropped = snapshot.enumerators.reduce((n, r) => n + (r.duplicatePathCount ?? 0), 0);
  console.log('reported as dropped by their own enumerator:');
  for (const r of snapshot.enumerators) {
    if (r.duplicatePathCount) console.log(`    ${r.source.padEnd(14)} ${r.duplicatePathCount}`);
  }
  console.log(`    total ${dropped}`);
  console.log('');
  console.log(
    `GATE (dupes): ${rawDupes > 0 && liveDupes === 0 && dropped === rawDupes ? 'PASS' : 'FAIL'}` +
      `  control ${rawDupes} > 0, production ${liveDupes} === 0, reported ${dropped} === control`,
  );
}
