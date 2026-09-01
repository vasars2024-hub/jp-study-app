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
import { spawn } from 'node:child_process';
import Database from 'better-sqlite3';
import { buildFilesIndex, FILES_ENUMERATORS, type FilesSqliteLike } from '../../main/filesApp/enumerators';
import {
  FILES_TREE,
  categoryForKind,
  deriveCrossStoreFlags,
  revealTargetFor,
  type FilesItem,
  type FilesProvenance,
} from '../../shared/filesApp/catalog';
import {
  FILES_SMART_FOLDER_PRESETS,
  smartFolderMembers,
  type FilesSmartCriteria,
} from '../../shared/filesApp/smartFolders';
import {
  buildFilesMineDrafts,
  buildFilesMineNoteRequest,
  deckProvenanceFor,
  mineabilityOf,
} from '../../shared/filesApp/mining';
// `--gateAudio` only. The PRODUCTION dub decision, not a replica of it — the
// same module `main/media.ts` calls before it builds a single yt-dlp argument.
import {
  audioLangMatches,
  audioLangRefusalMessage,
  listAudioTrackLanguages,
  listAudioTracks,
  normalizeYouTubeAudioLang,
  planYoutubeAudioTrack,
  youtubeAudioProbeArgs,
  youtubeFormatArgs,
  type YtDlpFormat,
} from '../../shared/ytAudioLang';
// Reaches `main/mining.ts`, which imports `electron` at module scope — the
// bundle aliases that to `./electron-stub`, exactly as the mineSource suite
// stubs it with `vi.mock`. See this directory's README for the command.
import { readFilesMineSource } from '../../main/filesApp/mineSource';
// `--gate9` only. `registerMiningIpc` is the production registration the app
// itself calls; `capturedIpcHandlers` is where the aliased stub records what it
// bound, so the census can call `mining:analyzeEpub` — the same channel the
// renderer invokes — instead of a private re-implementation of `analyzeBook`.
import { registerMiningIpc } from '../../main/mining';
import { buildEpubDeckExport, exportDeckFileContent } from '../../shared/epubDeck';
import type { EpubMiningAnalysis, TraditionalMiningConfig } from '../../shared/miningTypes';
import { capturedIpcHandlers } from './electron-stub';

// Filter EVERY flag, not a named list: `--detail` slipped through a
// `!== '--mining'` filter and became the userData path, so the census walked a
// directory called `--detail`, found nothing, and printed a confident empty
// report next to a summary that said 1 finding.
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const miningMode = process.argv.includes('--mining');
const userDataPath = args[0] || path.join(process.env.APPDATA || '', 'jp-study-app');
// `--gate9` reaches main-process readers that resolve the profile through
// `app.getPath('userData')`. Point the stub at the SAME profile this run is
// measuring, so one census cannot read the index from one place and the library
// from another. Set before any handler is called; main code that resolves a
// root at module-eval time would already have used the stub's default, which is
// this same path unless a non-default `userDataPath` argument was given — in
// which case export `JP_CENSUS_USERDATA` in the shell as well.
process.env.JP_CENSUS_USERDATA = userDataPath;

// Declared once, at module scope, deliberately: a `\s` written inside a shell
// heredoc has already shipped in this repo as the literal letter `s`, so the
// two regexes the gate modes need live here where they are read back as source.
const WHITESPACE = /\s+/g;
const NEWLINE = /\r?\n/;

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

/**
 * `--gate68` — mining gates 6 and 8, on the live profile, read-only.
 *
 * Gate 6: "take a video transcribed earlier, whose transcript file exists, and
 * find it in the catalogue WITHOUT navigating to that video." So the video is
 * reached only through `smartFolderMembers` and the shipped preset criteria —
 * the same predicate the Files app runs — and never by looking up a video page.
 * Gate 8: "the categories come from the asset's own provenance", i.e. no
 * enumerator hand-files a row.
 *
 * Three controls, because a flag that is always true proves nothing:
 *  (a) the two presets must PARTITION the videos — no row in both, none in
 *      neither, so `transcribed` is discriminating and not decorative;
 *  (b) re-deriving with the transcript rows withheld must take the marked
 *      count to 0, which is what ties the flag to the transcripts;
 *  (c) every transcript row's file must be on disk, checked with `statSync`,
 *      because a row pointing at nothing would satisfy the count and not the
 *      gate.
 */
if (process.argv.includes('--gate68')) {
  console.log('');
  console.log('=== MINING gates 6 & 8 — transcribed assets are findable in the catalogue ===');
  console.log('');

  const preset = (id: string): FilesSmartCriteria => {
    const found = FILES_SMART_FOLDER_PRESETS.find((f) => f.id === id);
    if (!found) throw new Error(`no such preset: ${id}`);
    return found.criteria;
  };

  const videos = snapshot.items.filter((i) => i.kind === 'video');
  const transcribed = smartFolderMembers(snapshot.items, preset('preset:transcribed-video'));
  const untranscribed = smartFolderMembers(snapshot.items, preset('preset:untranscribed-video'));
  const transcriptRows = snapshot.items.filter((i) => i.kind === 'transcript');

  console.log(`videos in the index:            ${videos.length}`);
  console.log(`transcript rows in the index:   ${transcriptRows.length}`);
  console.log(`"Transcribed video" folder:     ${transcribed.length}`);
  console.log(`"Untranscribed video" folder:   ${untranscribed.length}`);
  console.log('');
  console.log('reached through the folder alone, never through a video page:');
  for (const item of transcribed) {
    const target = revealTargetFor(item.location);
    console.log(`  ${item.name}`);
    console.log(`    reveal: ${target ?? 'NONE'}`);
  }

  // (c) — the transcript each one refers to is a real file, not just a row.
  let transcriptsOnDisk = 0;
  for (const t of transcriptRows) {
    const p = t.location.store === 'file' ? t.location.path : '';
    try {
      if (p && fs.statSync(p).isFile()) transcriptsOnDisk += 1;
    } catch {
      /* counted as absent */
    }
    const mine = mineabilityOf(t);
    console.log(
      `  transcript ${t.name.slice(0, 40).padEnd(42)} mineable=${mine.mineable}${mine.mineable ? '' : ` (${mine.reasonKey})`}`,
    );
  }

  // (a) — partition.
  const inBoth = transcribed.filter((i) => untranscribed.some((j) => j.id === i.id)).length;
  const inNeither = videos.filter(
    (i) => !transcribed.some((j) => j.id === i.id) && !untranscribed.some((j) => j.id === i.id),
  ).length;

  // (b) — widen: withhold the transcript rows and re-derive from the same input.
  const withheld = deriveCrossStoreFlags(
    snapshot.items.filter((i) => i.kind !== 'transcript').map((i) => ({
      ...i,
      flags: { ...i.flags, transcribed: undefined },
    })),
  ).filter((i) => i.kind === 'video' && i.flags.transcribed).length;

  // Gate 8 — every row's category is reproducible from the row itself.
  const handFiled = snapshot.items.filter((i) => i.categoryId !== categoryForKind(i.kind));

  console.log('');
  console.log(`control (a) partition:      in both ${inBoth}, in neither ${inNeither} (both must be 0)`);
  console.log(`control (b) transcripts withheld: ${withheld} videos still marked (must be 0)`);
  console.log(`control (c) transcript files on disk: ${transcriptsOnDisk} of ${transcriptRows.length}`);
  console.log(`gate 8 — rows whose category is not derived from their kind: ${handFiled.length} of ${snapshot.items.length}`);
  for (const i of handFiled.slice(0, 5)) console.log(`    ${i.source} ${i.id} ${i.categoryId}`);

  const g6 =
    transcribed.length > 0 &&
    transcribed.every((i) => revealTargetFor(i.location) !== null) &&
    transcriptsOnDisk === transcriptRows.length &&
    transcriptRows.length > 0 &&
    transcriptRows.every((t) => mineabilityOf(t).mineable) &&
    inBoth === 0 &&
    inNeither === 0 &&
    withheld === 0;
  console.log('');
  console.log(`GATE 6: ${g6 ? 'PASS' : 'FAIL'}`);
  console.log(`GATE 8: ${handFiled.length === 0 ? 'PASS' : 'FAIL'}`);
}

/**
 * `--gate7` — mining gate 7, end to end on the live profile.
 *
 * "Pick an asset in the catalogue and mine it end to end without opening its
 * original context, for at least one asset of each category." So: take the
 * catalogue ROW — the same object the list renders — and walk the whole
 * production chain off it and nothing else.
 *
 *   mineabilityOf -> readFilesMineSource -> buildFilesMineDrafts
 *                 -> buildFilesMineNoteRequest
 *
 * Not one of those is reimplemented here, and no video id, playlist, player or
 * reader is consulted at any step: the row's own `location.path` and `kind`
 * are the entire input, which IS the gate's "without opening its original
 * context".
 *
 * Nothing is written. The chain stops at the built `MineNoteRequest`, which is
 * the last step before AnkiConnect; posting real cards into the user's deck is
 * not something a census gets to do.
 *
 * Controls, because a chain that always says yes proves nothing:
 *  (a) a VIDEO row from the same index must refuse, and name
 *      `mediaHasNoText` — the refusal points at the transcript that works;
 *  (b) a row whose file is deleted must refuse `brokenLink` rather than mine
 *      zero cards, so an empty result and a failure stay distinguishable;
 *  (c) every draft's sentence must actually contain Japanese, checked here
 *      rather than trusted, since a chain that emitted credits and blank lines
 *      would still report a healthy card count.
 */
if (process.argv.includes('--gate7')) {
  console.log('');
  console.log('=== MINING gate 7 — one-click mine from the list, end to end ===');
  console.log('');

  const HAS_JA = /[぀-ゟ゠-ヿ一-鿿]/;
  let failures = 0;

  /** Run the whole chain off one catalogue row. */
  const mineOne = (item: FilesItem, label: string): boolean => {
    const mineability = mineabilityOf(item);
    if (!mineability.mineable) {
      console.log(`  ${label}: REFUSED at the catalogue — ${mineability.reasonKey}`);
      return false;
    }
    const filePath = item.location.store === 'file' ? item.location.path : '';
    const read = readFilesMineSource(filePath, item.kind as 'transcript' | 'subtitle' | 'book');
    if (!read.ok) {
      console.log(`  ${label}: REFUSED at the reader — ${read.reasonKey}${read.detail ? ` (${read.detail})` : ''}`);
      return false;
    }
    const plan = buildFilesMineDrafts(item, read.passages);
    const requests = plan.drafts.map(buildFilesMineNoteRequest);
    const notJapanese = plan.drafts.filter((d) => !HAS_JA.test(d.sentence)).length;

    console.log(`  ${label}`);
    console.log(`    row:        ${item.kind} / ${item.provenance} / ${item.source}`);
    console.log(`    name:       ${item.name.slice(0, 60)}`);
    console.log(`    passages:   read ${read.readCount}, kept ${read.passages.length}`);
    console.log(
      `    drafts:     ${plan.drafts.length} cards  (skipped: ${plan.skippedNotJapanese} not-Japanese, ${plan.skippedDuplicate} duplicate, ${plan.skippedOverCap} over cap)`,
    );
    console.log(`    requests:   ${requests.length} MineNoteRequest built`);
    if (requests[0]) {
      const r = requests[0];
      console.log(`    route:      ${r.route.source} / ${r.route.cardKind} / ${r.route.language}`);
      console.log(`    tags:       ${(r.extraTags ?? []).join(', ')}`);
      console.log(`    first card: ${String(r.sentence).slice(0, 60)}`);
    }
    console.log(`    control (c) drafts with no Japanese in them: ${notJapanese} (must be 0)`);
    const ok = requests.length > 0 && requests.length === plan.drafts.length && notJapanese === 0;
    if (!ok) failures += 1;
    return ok;
  };

  // One asset of EACH mineable category, picked from the live index by kind —
  // the largest of each, so the sample is not an empty file that mines nothing.
  const pick = (kind: string): FilesItem | undefined =>
    snapshot.items
      .filter((i) => i.kind === kind && mineabilityOf(i).mineable)
      .sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0))[0];

  const kinds = ['transcript', 'subtitle', 'book'];
  const mined: string[] = [];
  for (const kind of kinds) {
    const item = pick(kind);
    if (!item) {
      console.log(`  ${kind}: NO ASSET IN THE INDEX — cannot be claimed`);
      failures += 1;
      continue;
    }
    if (mineOne(item, kind)) mined.push(kind);
    console.log('');
  }

  // (a) — a video row, from the same index, must refuse and say why.
  const video = snapshot.items.find((i) => i.kind === 'video');
  const videoRefusal = video ? mineabilityOf(video) : null;
  console.log(
    `  control (a) a video row: ${videoRefusal ? (videoRefusal.mineable ? 'MINEABLE — WRONG' : `refused ${videoRefusal.reasonKey}`) : 'no video in the index'}`,
  );

  // (b) — a row whose file is gone. Built by hand from a real row so nothing
  // on disk is touched: the path is real, plus a suffix that is not.
  const ghostSource = pick('subtitle');
  const ghostRead = ghostSource
    ? readFilesMineSource(
        (ghostSource.location.store === 'file' ? ghostSource.location.path : '') + '.gone',
        'subtitle',
      )
    : null;
  console.log(
    `  control (b) a row whose file is gone: ${ghostRead && !ghostRead.ok ? `refused ${ghostRead.reasonKey}` : 'DID NOT REFUSE — WRONG'}`,
  );

  const controlsOk =
    videoRefusal !== null &&
    !videoRefusal.mineable &&
    videoRefusal.reasonKey === 'filesApp.mine.refuse.mediaHasNoText' &&
    ghostRead !== null &&
    !ghostRead.ok &&
    ghostRead.reasonKey === 'filesApp.mine.refuse.brokenLink';

  console.log('');
  console.log(`mined end to end: ${mined.join(', ') || 'none'} (${mined.length} of ${kinds.length} categories)`);
  console.log(
    `GATE 7: ${failures === 0 && mined.length === kinds.length && controlsOk ? 'PASS' : 'FAIL'}`,
  );
}

/**
 * `--gate9` — mining gate 9, both outlets, on the SAME book.
 *
 * "Epub mining produces a `MineNoteRequest` through the shared contract, with
 * the existing CSV/table export still working — the batch path is not removed,
 * it gains a second outlet."
 *
 * Two claims, so two runs against one epub and both counts reported:
 *
 *   OUTLET A (the new one)  catalogue row -> mineabilityOf -> readFilesMineSource
 *                           -> buildFilesMineDrafts -> buildFilesMineNoteRequest
 *   OUTLET B (the old one)  library itemId -> `mining:analyzeEpub` (the real IPC
 *                           handler, registered by `registerMiningIpc`)
 *                           -> buildEpubDeckExport -> csv / rows
 *
 * Neither is reimplemented. Outlet B calls the same `buildEpubDeckExport` that
 * `EpubMiningSimplePanel.downloadDeck` calls, with the default filter — which is
 * exactly the panel's own `filterEpubCandidates(analysis.candidates, config)`
 * followed by `skipFilter: true`, i.e. the identical set from the identical
 * function.
 *
 * NOT exercised, and stated rather than hidden: `mining:renderEpubDeck`'s Qwen /
 * API enrichment pass, which fills translation fields. It can load a local LLM,
 * and a census does not get to spend that. Analysis-time enrichment (offline
 * dictionary glosses, `glossOnly`) DOES run, because `analyzeBook` does it. The
 * run prints the configured translation engine so the reader can see which.
 *
 * Nothing is written: no CSV is saved, no card is posted.
 *
 * Controls:
 *  (a) SAME BOOK — the two outlets must be reading the same bytes. The row's
 *      `library:<id>` maps to outlet B's `analysis.itemId`, the titles must
 *      agree, and both character counts come from `extractEpubSections` on one
 *      file, so they are printed side by side.
 *  (b) NOT A CONSTANT — re-render outlet B from an analysis with its candidates
 *      emptied. `cardCount` must go to 0. A deck builder that returned a fixed
 *      number, or read something other than what it was handed, would not move.
 *  (c) DIFFERENT SHAPES — outlet A's product is a `MineNoteRequest` bound for
 *      AnkiConnect, outlet B's is text. Both are printed, so "a second outlet"
 *      is visible rather than asserted.
 *  (d) THE WHOLE TABLE FAMILY — every `exportDeckFileContent` format must return
 *      non-empty content, not just `csv`; "the table export still works" covers
 *      the formats the panel offers, not one of them.
 */
if (process.argv.includes('--gate9')) {
  void (async () => {
    console.log('');
    console.log('=== MINING gate 9 — epub keeps its CSV/table outlet AND gains the shared one ===');
    console.log('');

    let failures = 0;
    const fail = (why: string): void => {
      failures += 1;
      console.log(`  FAILURE: ${why}`);
    };

    // The same pick as gate 7: the largest mineable book in the live index.
    const book = snapshot.items
      .filter((i) => i.kind === 'book' && mineabilityOf(i).mineable)
      .sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0))[0];
    if (!book) {
      console.log('  NO MINEABLE BOOK IN THE INDEX — gate 9 cannot be claimed');
      console.log('GATE 9: FAIL');
      return;
    }
    const bookPath = book.location.store === 'file' ? book.location.path : '';
    console.log(`book: ${book.name}`);
    console.log(`  row id:   ${book.id}`);
    console.log(`  path:     ${bookPath}`);
    console.log(`  size:     ${book.sizeBytes ?? 0} bytes`);
    console.log('');

    /* ---- OUTLET A — the shared MineNoteRequest contract ---- */
    const read = readFilesMineSource(bookPath, 'book');
    if (!read.ok) {
      fail(`outlet A refused at the reader — ${read.reasonKey}`);
      console.log('GATE 9: FAIL');
      return;
    }
    const plan = buildFilesMineDrafts(book, read.passages);
    const requests = plan.drafts.map(buildFilesMineNoteRequest);
    const outletAChars = read.passages.reduce(
      (n, passage) => n + passage.text.replace(WHITESPACE, '').length,
      0,
    );
    console.log('OUTLET A — shared contract (MineNoteRequest -> AnkiConnect)');
    console.log(`  passages read:  ${read.readCount}, kept ${read.passages.length}`);
    console.log(
      `  drafts:         ${plan.drafts.length}  (skipped: ${plan.skippedNotJapanese} not-Japanese, ${plan.skippedDuplicate} duplicate, ${plan.skippedOverCap} over cap)`,
    );
    console.log(`  requests:       ${requests.length} MineNoteRequest`);
    if (requests[0]) {
      console.log(
        `  route:          ${requests[0].route.source} / ${requests[0].route.cardKind} / ${requests[0].route.language}`,
      );
      console.log(`  tags:           ${(requests[0].extraTags ?? []).join(', ')}`);
      console.log(`  first card:     ${String(requests[0].sentence).slice(0, 60)}`);
    }
    if (requests.length === 0) fail('outlet A produced 0 MineNoteRequests');
    if (requests[0] && requests[0].route.source !== 'epub') {
      fail(`outlet A route.source is ${requests[0].route.source}, not epub`);
    }
    console.log('');

    /* ---- OUTLET B — the pre-existing CSV/table export ---- */
    registerMiningIpc();
    const getConfig = capturedIpcHandlers.get('mining:getConfig');
    const analyzeEpub = capturedIpcHandlers.get('mining:analyzeEpub');
    if (!getConfig || !analyzeEpub) {
      const bound = [...capturedIpcHandlers.keys()].filter((k) => k.startsWith('mining:'));
      fail(`the batch path's IPC channels are not registered (have: ${bound.join(', ') || 'none'})`);
      console.log('GATE 9: FAIL');
      return;
    }
    const traditional = getConfig() as TraditionalMiningConfig;
    const itemId = book.id.startsWith('library:') ? book.id.slice('library:'.length) : book.id;
    const started = Date.now();
    let analysis: EpubMiningAnalysis;
    try {
      analysis = (await analyzeEpub(null, itemId)) as EpubMiningAnalysis;
    } catch (error) {
      fail(`mining:analyzeEpub threw — ${error instanceof Error ? error.message : String(error)}`);
      console.log('GATE 9: FAIL');
      return;
    }
    const deck = buildEpubDeckExport(analysis, traditional);
    const csvBytes = Buffer.byteLength(deck.csv, 'utf-8');
    console.log('OUTLET B — the pre-existing batch export (CSV / table rows)');
    console.log("  entry point:    ipcMain 'mining:analyzeEpub' -> buildEpubDeckExport");
    console.log(`  analyzer:       ${analysis.analyzer}, ${Date.now() - started}ms`);
    console.log(`  candidates:     ${analysis.candidates.length} (before the export filter)`);
    console.log(`  cardCount:      ${deck.cardCount}`);
    console.log(`  rows:           ${deck.rows.length}`);
    console.log(`  csv:            ${csvBytes} bytes`);
    console.log(
      `  translation:    engine=${traditional.export?.translationEngine ?? 'default'} (enrichment beyond offline glosses NOT run here)`,
    );
    const csvLines = deck.csv.split(NEWLINE);
    console.log(`  csv line 1:     ${(csvLines[0] ?? '').slice(0, 80)}`);
    console.log(`  csv line 2:     ${(csvLines[1] ?? '').slice(0, 80)}`);
    if (deck.cardCount === 0) fail('outlet B produced 0 cards — the batch export is not working');
    if (deck.rows.length !== deck.cardCount) {
      fail(`outlet B cardCount ${deck.cardCount} disagrees with rows ${deck.rows.length}`);
    }
    console.log('');

    /* ---- controls ---- */
    console.log('controls');
    const sameId = analysis.itemId === itemId;
    const sameChars = outletAChars === analysis.totalCharacters;
    console.log(`  (a) same book:  itemId ${analysis.itemId} vs ${itemId} -> ${sameId ? 'match' : 'MISMATCH'}`);
    console.log(
      `      characters: outlet A ${outletAChars} vs outlet B totalCharacters ${analysis.totalCharacters} -> ${sameChars ? 'EQUAL' : 'DIFFER'}`,
    );
    if (!sameId) fail('control (a): the two outlets did not read the same library item');
    if (!sameChars) fail('control (a): the two outlets read different amounts of text');
    // Titles are NOT compared, and the reason is worth carrying: the catalogue
    // row's name comes from `library.json`'s `title` (what the Library UI shows,
    // here an Anna's Archive filename), while `analysis.title` comes from the
    // EPUB's own OPF metadata. Two authorities for one book, both legitimate —
    // asserting equality made this control FAIL on a run where every byte
    // matched, which is a control measuring the wrong thing.
    console.log(`      titles differ by design: row "${book.name.slice(0, 40)}…" / opf "${analysis.title}"`);

    const emptied = buildEpubDeckExport({ ...analysis, candidates: [] }, traditional);
    console.log(
      `  (b) not a constant: candidates emptied -> cardCount ${emptied.cardCount}, csv ${Buffer.byteLength(emptied.csv, 'utf-8')} bytes (must be 0 cards)`,
    );
    if (emptied.cardCount !== 0) {
      fail('control (b): the deck builder returned cards for no candidates');
    }

    console.log(
      `  (c) different shapes: A = MineNoteRequest object, fields {${Object.keys(requests[0] ?? {}).join(',')}}, profileId ${requests[0]?.profileId ?? '(routed by mining rules)'}`,
    );
    console.log(
      `      B = ${csvBytes} bytes of text, columns ${(csvLines[0] ?? '').split(',').length}, row fields {${Object.keys(deck.rows[0] ?? {}).join(',')}}`,
    );
    // Not a failure — the honest headline. The two outlets are scoped
    // differently on purpose: the one-click shared route caps at
    // FILES_MINE_MAX_CARDS so a list click cannot dump a whole novel into a
    // deck, while the batch export is the whole book. That difference IS what
    // "the batch path is not removed, it gains a second outlet" means.
    console.log(
      `      scope:  A ${requests.length} (capped, ${plan.skippedOverCap} over cap) vs B ${deck.cardCount} (whole book)`,
    );

    const formats: TraditionalMiningConfig['export']['format'][] = [
      'csv',
      'anki',
      'txt',
      'txt-rep',
      'yomitan',
    ];
    const formatSizes = formats.map((format) => {
      const out = exportDeckFileContent(deck, format);
      return `${format}=${Buffer.byteLength(out.content, 'utf-8')}b/.${out.ext}`;
    });
    console.log(`  (d) table family: ${formatSizes.join('  ')}`);
    for (const format of formats) {
      if (!exportDeckFileContent(deck, format).content.length) {
        fail(`control (d): format ${format} produced empty content`);
      }
    }

    console.log('');
    console.log(
      `both outlets from one book: A ${requests.length} MineNoteRequest, B ${deck.cardCount} deck rows`,
    );
    console.log(`GATE 9: ${failures === 0 ? 'PASS' : 'FAIL'}`);
  })();
}

/**
 * `--gate10` — what the Mining catalogue lists, on the live profile.
 *
 * "One Mining surface hosts the catalogue, replacing the epub-only 'simple
 * mining' entry point without losing any capability it had."
 *
 * `miningCataloguePanel.test.tsx` proves the panel's behaviour on a four-row
 * fixture: the filters narrow, the empty categories say so, the machine mark
 * appears only where it should. What a fixture cannot say is how many real
 * assets the tab opens onto, or that the provenance axis is *discriminating* on
 * this profile rather than every row landing in one bucket. That is this mode.
 *
 * It re-derives the panel's own partition — `mineabilityOf` -> media kind ->
 * provenance — from the production predicates, over the same one
 * `buildFilesIndex` call every other mode uses.
 *
 * Controls:
 *  (a) THE PARTITION IS COMPLETE — the per-provenance counts must sum to the
 *      mineable total. A bucket silently dropped would leave assets that appear
 *      under no filter, which is the same defect as omitting an empty category.
 *  (b) THE PANEL REFUSES SOMETHING — every `video` and `audio` row in the index
 *      must be absent from the listed set. A catalogue that lists the whole
 *      index is not applying `mineabilityOf` at all, and would read as a
 *      healthy count.
 *  (c) IT IS NOT EPUB-ONLY, which is the gate's actual claim: at least one
 *      NON-book asset must be listed. The three tabs it sits beside are all
 *      EPUB tools, so a catalogue of books alone would change nothing.
 */
if (process.argv.includes('--gate10')) {
  console.log('');
  console.log('=== MINING gate 10 — what the catalogue tab lists, live ===');
  console.log('');

  let failures = 0;
  const listed = snapshot.items.filter((item) => mineabilityOf(item).mineable);
  const byKind = new Map<string, number>();
  const byProvenance = new Map<string, number>();
  // Every provenance the panel offers, seeded at 0 so an empty one PRINTS.
  for (const key of ['human-subs', 'auto-captions', 'whisper-transcript', 'book-text', 'unknown']) {
    byProvenance.set(key, 0);
  }
  for (const item of listed) {
    byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1);
    byProvenance.set(item.provenance, (byProvenance.get(item.provenance) ?? 0) + 1);
  }

  console.log(`index rows:        ${snapshot.items.length}`);
  console.log(`catalogue lists:   ${listed.length}`);
  console.log('');
  console.log('by kind (the secondary filter):');
  for (const [kind, count] of [...byKind].sort()) console.log(`  ${kind.padEnd(12)} ${count}`);
  console.log('');
  console.log('by provenance (the PRIMARY axis — every value printed, including 0):');
  for (const [key, count] of byProvenance) console.log(`  ${key.padEnd(20)} ${count}`);

  const provenanceTotal = [...byProvenance.values()].reduce((a, b) => a + b, 0);
  console.log('');
  console.log(
    `  control (a) partition complete: ${provenanceTotal} across the buckets vs ${listed.length} listed -> ${provenanceTotal === listed.length ? 'EQUAL' : 'LOSES ROWS'}`,
  );
  if (provenanceTotal !== listed.length) {
    failures += 1;
  }

  const mediaRows = snapshot.items.filter((i) => i.kind === 'video' || i.kind === 'audio');
  const mediaListed = listed.filter((i) => i.kind === 'video' || i.kind === 'audio').length;
  console.log(
    `  control (b) media refused: ${mediaRows.length} video/audio rows in the index, ${mediaListed} listed (must be 0)`,
  );
  if (mediaListed !== 0 || mediaRows.length === 0) failures += 1;

  const nonBook = listed.filter((i) => i.kind !== 'book').length;
  console.log(
    `  control (c) not epub-only: ${nonBook} of ${listed.length} listed assets are NOT books`,
  );
  if (nonBook === 0) failures += 1;

  console.log('');
  console.log(`GATE 10 (catalogue contents): ${failures === 0 ? 'PASS' : 'FAIL'}`);
}

/**
 * MINING gates 1 and 2 — the DUB, live against a real YouTube video.
 *
 *   node debug/filesapp-census.cjs --gateAudio <url> [wanted] [absent]
 *
 * It runs `yt-dlp -J` itself — no Electron, no app, no download — and feeds the
 * manifest through the PRODUCTION `planYoutubeAudioTrack` / `youtubeFormatArgs`
 * that `main/media.ts` calls. That is the point: if those helpers drift, this
 * mode drifts with them, whereas a replica of the selection logic here could
 * report a pass the app does not have.
 *
 * The three things it prints, in the gates' own terms:
 *   gate 1 — the language of the track it selected, read from the video's
 *            manifest, and the exact `-f` string that language produced.
 *   gate 2 — the NEGATIVE CONTROL: a language the video demonstrably does not
 *            ship must refuse by name, with no format string a caller could run
 *            anyway. If the same video answers both, the pass is not a
 *            coincidence of the video having every language.
 *   control — `original` must produce args byte-identical to the pre-feature
 *            strings, proving the new field cannot alter an ordinary download.
 */
if (process.argv.includes('--gateAudio')) {
  const rest = process.argv.slice(process.argv.indexOf('--gateAudio') + 1).filter((a) => !a.startsWith('--'));
  const url = rest[0] ?? '';
  const wanted = normalizeYouTubeAudioLang(rest[1] ?? 'ja');
  const absent = normalizeYouTubeAudioLang(rest[2] ?? 'ru');

  void (async () => {
    console.log('');
    console.log('=== MINING gates 1 & 2 — which dub, live ===');
    console.log('');
    if (!url) {
      console.log('FAIL: pass a video URL: --gateAudio <url> [wantedLang] [absentLang]');
      return;
    }
    let failures = 0;
    const fail = (why: string): void => {
      failures += 1;
      console.log(`  FAIL ${why}`);
    };

    const raw = await new Promise<string | null>((resolve) => {
      const proc = spawn('yt-dlp', youtubeAudioProbeArgs(url), { shell: true });
      let out = '';
      proc.stdout.on('data', (d: Buffer) => (out += d.toString()));
      proc.on('error', () => resolve(null));
      proc.on('close', (code) => resolve(code === 0 ? out : null));
    });
    let formats: YtDlpFormat[] | null = null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { formats?: unknown; title?: unknown };
        console.log(`video:  ${String(parsed.title ?? '(untitled)')}`);
        formats = Array.isArray(parsed.formats) ? (parsed.formats as YtDlpFormat[]) : null;
      } catch {
        formats = null;
      }
    }
    console.log(`url:    ${url}`);
    console.log(`formats in manifest: ${formats?.length ?? 0}`);
    if (!formats) {
      console.log('  the probe itself failed — that is `audioProbeFailed`, not a pass');
    }
    const tracks = formats ? listAudioTracks(formats) : [];
    console.log(`tagged audio tracks: ${tracks.length}`);
    for (const track of tracks) {
      console.log(
        `  ${track.formatId.padEnd(8)} ${track.language.padEnd(8)} ${String(track.abr ?? '-').padStart(5)} kbps  ${track.ext ?? ''}${track.isOriginal ? '  [original]' : ''}`,
      );
    }
    console.log(`languages: ${JSON.stringify(formats ? listAudioTrackLanguages(formats) : [])}`);

    console.log('');
    console.log(`gate 1 — asked for "${wanted}":`);
    const plan = planYoutubeAudioTrack(wanted, formats);
    if (plan.action === 'select') {
      console.log(`  selected format_id ${plan.track.formatId}, manifest language "${plan.track.language}"`);
      console.log(`  -f ${youtubeFormatArgs(plan, false)[1]}`);
      if (!audioLangMatches(plan.track.language, wanted)) fail('selected track does not match the request');
      // The gate says "a video with TWO AUDIO TRACKS downloads the Japanese
      // one". Counting formats is the wrong instrument and read PASS on a
      // single-language video: `lSRBZNEjbpg` ships four ja formats (139/249/
      // 140/251 — bitrates and codecs of one dub), which is not a choice
      // between dubs at all. Count distinct LANGUAGES.
      const distinct = formats ? listAudioTrackLanguages(formats).length : 0;
      if (distinct < 2) {
        fail(
          `only ${distinct} distinct audio language across ${tracks.length} tagged formats — the gate needs a video with two DUBS, not two bitrates`,
        );
      }
    } else if (plan.action === 'refuse') {
      fail(`refused "${wanted}": ${plan.reason} — ${audioLangRefusalMessage(plan)}`);
    } else {
      fail('nothing was asked for');
    }

    console.log('');
    console.log(`gate 2 — negative control, asked for "${absent}" on the SAME video:`);
    const control = planYoutubeAudioTrack(absent, formats);
    if (control.action === 'refuse') {
      console.log(`  refused by name: ${control.reason} (${control.reasonKey})`);
      console.log(`  message: ${audioLangRefusalMessage(control)}`);
      if (control.reason === 'noSuchAudioLanguage' && control.available.length === 0) {
        fail('refusal named no available languages, so it cannot tell the user what IS there');
      }
    } else {
      fail(`"${absent}" did NOT refuse — the control is void, pick a language this video lacks`);
    }

    console.log('');
    const defaultVideo = youtubeFormatArgs({ action: 'default' }, false);
    const defaultAudio = youtubeFormatArgs({ action: 'default' }, true);
    console.log('control (c) — "original" must not change an ordinary download:');
    console.log(`  video: -f ${defaultVideo[1]}`);
    console.log(`  audio: -f ${defaultAudio[1]}`);
    if (defaultVideo[1] !== 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b') fail('default video args changed');
    if (defaultAudio[1] !== 'ba[ext=m4a]/ba/b') fail('default audio args changed');

    console.log('');
    console.log(`GATES 1 & 2: ${failures === 0 ? 'PASS' : 'FAIL'}`);
  })();
}

/**
 * `--gate4` — MINING gate 4, the transcript MARK.
 *
 * "A card mined from that transcript reaches its destination AND renders as
 * transcript-derived; a card from human subtitles on the same surface does not
 * carry that mark."
 *
 * Two clauses, and the second is the whole point: a build that tagged *every*
 * card `provenance-transcript` would satisfy the first clause and be worthless.
 * The design constraint this gate enforces is the fusion track's lesson —
 * mixing an unrefereed Whisper transcript in with human subtitles silently is
 * exactly the defect. So both are mined on the SAME surface, through the SAME
 * chain, and the marks are compared.
 *
 * The chain is the production one (`mineabilityOf` -> `readFilesMineSource` ->
 * `buildFilesMineDrafts` -> `buildFilesMineNoteRequest`), stopping at the built
 * request, which is the last step before AnkiConnect. Nothing is posted.
 *
 * "Reaches its destination" is read as the request being ROUTABLE, and it is
 * checked rather than assumed: a `route` and a non-empty sentence and front.
 *
 * Controls:
 *  (a) THE MARK IS NOT UNIVERSAL — the human-subs card must carry
 *      `provenance-human-subs` and must NOT carry `provenance-transcript`.
 *  (b) THE MARK IS NOT COSMETIC — it must survive onto `extraTags`, i.e. into
 *      Anki, not only onto the in-app draft field the review screen reads.
 *  (c) THE RENDERER HAS A STRING FOR IT — `deckProvenanceFor` must map the
 *      catalogue's provenance to a deck value the review screen can render;
 *      a card marked with a value the UI has no key for renders as nothing.
 */
if (process.argv.includes('--gate4')) {
  console.log('');
  console.log('=== MINING gate 4 — transcript-derived cards are marked, subtitle cards are not ===');
  console.log('');

  let failures = 0;
  const fail = (why: string): void => {
    failures += 1;
    console.log(`  FAIL ${why}`);
  };

  interface MinedSample {
    item: FilesItem;
    tags: string[];
    textProvenance: string | undefined;
    cards: number;
    routable: boolean;
  }

  const mineFirst = (kind: 'transcript' | 'subtitle', want: FilesProvenance): MinedSample | null => {
    // Largest first, so the sample is not an empty file that mines nothing —
    // and filtered to the provenance the gate names, because `subtitle` rows
    // in this index are a mix of human subs and auto-captions and taking
    // whichever sorted first would compare the wrong two things.
    const candidates = snapshot.items
      .filter((i) => i.kind === kind && i.provenance === want && mineabilityOf(i).mineable)
      .sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0));
    for (const item of candidates) {
      const filePath = item.location.store === 'file' ? item.location.path : '';
      const read = readFilesMineSource(filePath, kind);
      if (!read.ok) continue;
      const plan = buildFilesMineDrafts(item, read.passages);
      if (plan.drafts.length === 0) continue;
      const request = buildFilesMineNoteRequest(plan.drafts[0]);
      return {
        item,
        tags: request.extraTags ?? [],
        textProvenance: plan.drafts[0].textProvenance,
        cards: plan.drafts.length,
        routable: Boolean(request.route && String(request.sentence).length > 0 && String(request.front).length > 0),
      };
    }
    return null;
  };

  const transcript = mineFirst('transcript', 'whisper-transcript');
  const human = mineFirst('subtitle', 'human-subs');

  for (const [label, sample] of [
    ['transcript', transcript],
    ['human-subs', human],
  ] as const) {
    if (!sample) {
      fail(`no mineable ${label} asset in the live index — the gate cannot be claimed`);
      continue;
    }
    console.log(`  ${label}`);
    console.log(`    row:            ${sample.item.kind} / ${sample.item.provenance}`);
    console.log(`    name:           ${sample.item.name.slice(0, 60)}`);
    console.log(`    cards mined:    ${sample.cards}`);
    console.log(`    textProvenance: ${sample.textProvenance ?? '(none)'}`);
    console.log(`    extraTags:      ${sample.tags.join(', ')}`);
    console.log(`    routable:       ${sample.routable}`);
    console.log('');
  }

  if (transcript) {
    if (transcript.textProvenance !== 'transcript') {
      fail(`transcript card's textProvenance is "${transcript.textProvenance}", not "transcript"`);
    }
    if (!transcript.tags.includes('provenance-transcript')) {
      fail('control (b): the mark did not survive onto extraTags, so Anki never sees it');
    }
    if (!transcript.routable) fail('transcript card is not routable — it does not reach a destination');
  }
  if (human) {
    console.log(
      `  control (a) the mark is NOT universal: human-subs card carries provenance-transcript = ${human.tags.includes('provenance-transcript')} (must be false)`,
    );
    if (human.tags.includes('provenance-transcript')) {
      fail('control (a): a human-subtitle card was marked transcript-derived');
    }
    if (!human.tags.includes('provenance-human-subs')) {
      fail('human-subs card carries no provenance mark at all');
    }
    if (!human.routable) fail('human-subs card is not routable');
  }

  console.log('');
  console.log('  control (c) every catalogue provenance maps to a deck value the review screen can render:');
  for (const provenance of ['human-subs', 'auto-captions', 'whisper-transcript', 'book-text', 'unknown'] as const) {
    const mapped = deckProvenanceFor(provenance);
    console.log(`    ${provenance.padEnd(20)} -> ${mapped ?? '(unmarked)'}`);
  }
  if (deckProvenanceFor('whisper-transcript') !== 'transcript') fail('control (c): whisper-transcript does not map to transcript');
  if (deckProvenanceFor('human-subs') !== 'human-subs') fail('control (c): human-subs does not map to human-subs');
  // `unknown` must map to nothing: inventing a provenance for a row whose text
  // origin was never established is the same lie the mark exists to prevent.
  if (deckProvenanceFor('unknown') !== undefined) fail('control (c): unknown provenance was given a mark');

  console.log('');
  console.log(`GATE 4 (transcript mark): ${failures === 0 ? 'PASS' : 'FAIL'}`);
}
