/**
 * Gate 21's live half — the Recycle Bin round trip, on real Windows.
 *
 *   "Deleting a file-backed item places it in the Windows Recycle Bin
 *    (`shell.trashItem`) and it is restorable from there — verified by
 *    actually restoring one."
 *
 * Why this is a probe and not a vitest file: `shell.trashItem` is an Electron
 * main-process API backed by the Windows shell. A mock proving it was called
 * restates the mock, and vitest cannot run it. So this runs a real Electron
 * main process and calls the PRODUCTION `deleteFilesItemInMain` — the same
 * function `registerFilesDeletionIpc` hands the `filesapp:delete` channel —
 * with the real `shell.trashItem`. Only the renderer click is absent, and
 * `filesAppDeletionIntegration.test.tsx` covers that half through the real
 * component.
 *
 * Run:  npx electron src/.coordination/files-app/probes/filesapp-trash-roundtrip.cjs
 *
 * It writes its own fixture under the OS temp directory and restores or
 * removes it again. It touches nothing in userData, opens no window, and asks
 * the Recycle Bin about its own file by path — never enumerating or altering
 * anything else that happens to be in there.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const esbuild = require('esbuild');
const { app, shell } = require('electron');

const ROOT = path.join(__dirname, '..', '..', '..', '..');

function bundle(entry) {
  const { outputFiles } = esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    external: ['electron'],
    logLevel: 'silent',
  });
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func -- trusted local source, not user input
  new Function('module', 'exports', 'require', outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
}

/**
 * Quote a Windows path as a PowerShell string literal.
 *
 * NOT `JSON.stringify`. JSON escapes `\` as `\`, and PowerShell's escape
 * character is the backtick — so a JSON-quoted path arrives with every
 * separator doubled and compares equal to nothing. That is the second way this
 * probe reported a file as absent from a bin it was sitting in. A single-quoted
 * PowerShell literal interpolates nothing; only `'` needs doubling.
 */
function psLiteral(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Reconstruct a binned item's ORIGINAL full path.
 *
 * `Get-ChildItem` cannot see into the Recycle Bin; the Shell.Application
 * namespace can. Column 1 is the original folder and column 0 the name — but
 * column 0 honours Explorer's "hide extensions" setting and on this machine
 * returns `gate21-episode`, not `gate21-episode.mkv`. Naively joining the two
 * therefore never matches, and the first run of this probe reported a file as
 * absent from the bin while it was demonstrably sitting in it. The extension
 * is taken from the `$R` stub's own path, which always carries it.
 */
const BIN_ORIGINAL_PATH = `
function Get-OriginalPath($bin, $item) {
  $origin = $bin.GetDetailsOf($item, 1)
  $leaf = $bin.GetDetailsOf($item, 0)
  if (-not [System.IO.Path]::GetExtension($leaf)) {
    $leaf = $leaf + [System.IO.Path]::GetExtension($item.Path)
  }
  return (Join-Path $origin $leaf)
}
`;

function recycleBinEntryFor(originalPath) {
  const ps = `
${BIN_ORIGINAL_PATH}
$shell = New-Object -ComObject Shell.Application
$bin = $shell.Namespace(10)
foreach ($item in $bin.Items()) {
  $full = Get-OriginalPath $bin $item
  if ($full -ieq ${psLiteral(originalPath)}) {
    Write-Output ('FOUND|' + $item.Path + '|' + $full)
    exit 0
  }
}
Write-Output 'ABSENT'
`;
  const out = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', ps],
    { encoding: 'utf8' },
  ).trim();
  if (!out.startsWith('FOUND|')) return null;
  const [, binPath, origin] = out.split('|');
  return { binPath, origin };
}

/** Invoke the bin's own Restore verb — the same action the user's context menu runs. */
function restoreFromRecycleBin(originalPath) {
  const ps = `
${BIN_ORIGINAL_PATH}
$shell = New-Object -ComObject Shell.Application
$bin = $shell.Namespace(10)
foreach ($item in $bin.Items()) {
  $full = Get-OriginalPath $bin $item
  if ($full -ieq ${psLiteral(originalPath)}) {
    $verb = $item.Verbs() | Where-Object { $_.Name -replace '&','' -match '^(Restore|Restaurar|Wiederherstellen)$' }
    if ($verb) { $verb.DoIt(); Write-Output 'RESTORED'; exit 0 }
    Write-Output 'NO_VERB'; exit 0
  }
}
Write-Output 'ABSENT'
`;
  return execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', ps],
    { encoding: 'utf8' },
  ).trim();
}

const results = [];
function record(label, value) {
  results.push(`${label}: ${value}`);
  console.log(`  ${label}: ${value}`);
}

/* ------------------------------------------------------------------ *
 * Gate 32/35 — the same round trip, driven by the CLEANUP path.
 * ------------------------------------------------------------------ */

/**
 * Gates 32 and 35's live half, in this file rather than a second probe.
 *
 * The two gates ask the same physical question gate 21 does — did the bytes
 * land in the Windows Recycle Bin, and can the user get them back — so they
 * reuse the bin helpers above instead of restating them. What differs is the
 * production function under test: `runCleanupInMain` with a REAL
 * `shell.trashItem`, planning against a real temp userData that contains the
 * shape gate 33 is about (an unclaimed video in `downloads/`, which the
 * downloads enumerator stamps `orphan`).
 */
async function gate35(recordFn) {
  const { runCleanupInMain, planCleanupInMain, collectCleanupInputs } = bundle(
    path.join(ROOT, 'src', 'main', 'filesApp', 'cleanupIpc.ts'),
  );
  const { buildFilesIndex } = bundle(path.join(ROOT, 'src', 'main', 'filesApp', 'enumerators.ts'));

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-files-gate35-'));
  const downloads = path.join(root, 'downloads');
  fs.mkdirSync(downloads, { recursive: true });

  const videoBytes = Buffer.alloc(8192, 3);
  const fragmentBytes = Buffer.alloc(4096, 9);
  const video = path.join(downloads, 'gate35 irreplaceable [x9QKu3OLjaU].mp4');
  const fragment = path.join(downloads, 'gate35 unfinished.mp4.part');
  const empty = path.join(downloads, 'gate35 nothing.ja.vtt');
  fs.writeFileSync(video, videoBytes);
  fs.writeFileSync(fragment, fragmentBytes);
  fs.writeFileSync(empty, '');
  fs.writeFileSync(path.join(root, 'media.json'), JSON.stringify({ items: [] }));

  const settings = {
    enabledClasses: ['broken-links', 'partial-downloads', 'empty-files', 'orphan-files'],
    brokenLinkPolicy: 'mark',
  };
  const log = [];
  const deps = {
    getItems: () => buildFilesIndex({ userDataPath: root }).items,
    userDataPath: () => root,
    trashItem: (p) => shell.trashItem(p), // the real Windows shell
    softDeleteRow: async () => {
      throw new Error('no soft-delete adapter in this probe');
    },
    readSettings: () => settings,
    invalidate: () => {},
    appendLog: (entries) => log.push(...entries),
    now: () => Date.now(),
  };

  console.log('\n=== Gates 32/35 — cleanup to the Recycle Bin (real Electron, real shell) ===\n');
  recordFn('userData fixture', root);

  const report = planCleanupInMain(deps);
  const names = report.candidates.map((c) => c.name).sort();
  recordFn('dry run candidates', JSON.stringify(names));
  recordFn('dry run reclaimable bytes', report.classes.reduce((s, r) => s + r.reclaimableBytes, 0));
  recordFn('video still on disk after DRY RUN', fs.existsSync(video));
  recordFn(
    'video is in the report as PROTECTED',
    report.protectedItems.some((r) => r.name.includes('irreplaceable')),
  );
  recordFn(
    'video protection reason',
    report.protectedItems.find((r) => r.name.includes('irreplaceable'))?.reasonKey,
  );

  /* --- control: confirm EVERYTHING the app knows about, including the video --- */
  const everything = collectCleanupInputs(deps).map((i) => i.id);
  recordFn('CONTROL confirming ids', everything.length);
  const run = await runCleanupInMain(
    { confirmedItemIds: everything, reportBuiltAt: report.builtAt, settings },
    deps,
  );
  recordFn('CONTROL video survived a confirm-everything run', fs.existsSync(video));
  recordFn('CONTROL video bytes unchanged', fs.readFileSync(video).equals(videoBytes));

  recordFn('removed', JSON.stringify(run.log.map((e) => e.name).sort()));
  recordFn('log matches the report item for item', JSON.stringify(names) === JSON.stringify(run.log.map((e) => e.name).sort()));
  recordFn('fragment gone from disk', !fs.existsSync(fragment));
  recordFn('every log destination', JSON.stringify([...new Set(run.log.map((e) => e.destination))]));

  /* --- gate 35: the binned item is really restorable --- */
  const entry = recycleBinEntryFor(fragment);
  recordFn('fragment in Recycle Bin', entry ? 'yes' : 'NO');
  const restore = restoreFromRecycleBin(fragment);
  recordFn('restore verb', restore);
  recordFn('fragment back on disk', fs.existsSync(fragment));
  const restored = fs.existsSync(fragment) ? fs.readFileSync(fragment) : Buffer.alloc(0);
  recordFn('fragment bytes identical', restored.equals(fragmentBytes));

  /* --- the empty file too, so "each removed item" is more than one --- */
  const emptyEntry = recycleBinEntryFor(empty);
  recordFn('empty file in Recycle Bin', emptyEntry ? 'yes' : 'NO');
  const emptyRestore = restoreFromRecycleBin(empty);
  recordFn('empty file restore verb', emptyRestore);

  const pass =
    fs.existsSync(video) &&
    fs.readFileSync(video).equals(videoBytes) &&
    report.protectedItems.some((r) => r.name.includes('irreplaceable')) &&
    run.log.length === 2 &&
    run.log.every((e) => e.destination === 'recycle-bin' && e.path) &&
    JSON.stringify(names) === JSON.stringify(run.log.map((e) => e.name).sort()) &&
    Boolean(entry) &&
    restore === 'RESTORED' &&
    restored.equals(fragmentBytes) &&
    Boolean(emptyEntry) &&
    emptyRestore === 'RESTORED';

  console.log(`\nGATES 32/35 LIVE: ${pass ? 'PASS' : 'FAIL'}\n`);
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* temp cleanup is best-effort */
  }
  return pass;
}

/* ------------------------------------------------------------------ *
 * Gate 28 — "PASTE a folder sorts all of it", on the real clipboard.
 * ------------------------------------------------------------------ */

/**
 * Gate 28's first three words, live.
 *
 * Here for the same reason gates 32/35 are: this needs a real Electron main
 * process and a real Windows API — `clipboard.availableFormats()` and
 * `clipboard.readBuffer('FileNameW')`, neither of which vitest can run and
 * neither of which a mock can say anything true about. The PRODUCTION
 * `folderCandidatesFrom` and `resolveFolders` are bundled out of
 * `shared/filesApp/clipboardPaths.ts` and driven with the real `fs.statSync`,
 * so what is scored is the shipped code against real bytes and real folders.
 *
 * THE CLIPBOARD IS THE USER'S. Two protections, both load-bearing:
 *
 * - if a file selection (`FileNameW`) is already on it, the write half is
 *   REFUSED outright rather than destroying something restorable only by the
 *   user going back to Explorer and copying again;
 * - otherwise the text is captured, written, and restored byte-identical, and
 *   the comparison is reported rather than assumed.
 */
async function gate28(recordFn) {
  const { clipboard } = require('electron');
  const { folderCandidatesFrom, resolveFolders } = bundle(
    path.join(ROOT, 'src', 'shared', 'filesApp', 'clipboardPaths.ts'),
  );

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-files-gate28-'));
  const folder = path.join(root, 'anime pack');
  const nested = path.join(folder, 'season 1');
  fs.mkdirSync(nested, { recursive: true });
  const episode = path.join(nested, 'ep01.mkv');
  fs.writeFileSync(episode, Buffer.alloc(2048, 3));
  const absent = path.join(root, 'never-existed');

  console.log('\n=== Gate 28 — paste a folder (real Electron, real clipboard) ===\n');
  recordFn('fixture folder', folder);
  recordFn('fixture file', episode);

  const probe = {
    kindOf: (p) => {
      try {
        const st = fs.statSync(p);
        return st.isDirectory() ? 'directory' : st.isFile() ? 'file' : null;
      } catch {
        return null;
      }
    },
    parentOf: (p) => path.dirname(p),
  };

  /* --- what is on the user's clipboard right now, read-only --- */
  const formatsBefore = clipboard.availableFormats();
  const hadFileSelection = formatsBefore.includes('FileNameW');
  const textBefore = clipboard.readText() ?? '';
  recordFn('formats before', JSON.stringify(formatsBefore));
  recordFn('held a file selection', hadFileSelection ? 'YES — write half refused' : 'no');
  recordFn('text before (chars)', textBefore.length);

  let wroteText = false;
  let textRestored = null;
  let liveTextFolders = null;
  if (!hadFileSelection) {
    // Explorer's "Copy as path" shape, quoted, which is what a user actually
    // has after the context-menu command.
    clipboard.writeText(`"${folder}"`);
    wroteText = true;
    const reading = { fileNameW: null, text: clipboard.readText() ?? '' };
    liveTextFolders = resolveFolders(folderCandidatesFrom(reading), probe);
    recordFn('live text clipboard -> folders', JSON.stringify(liveTextFolders));
  }

  /* --- the FileNameW half, on bytes shaped exactly as Explorer sets them --- */
  const wide = Buffer.alloc((folder.length + 1) * 2 + 40, 0);
  wide.write(folder, 0, 'ucs2');
  const wideFolders = resolveFolders(
    folderCandidatesFrom({ fileNameW: new Uint8Array(wide), text: '' }),
    probe,
  );
  recordFn('padded FileNameW -> folders', JSON.stringify(wideFolders));

  /* --- a FILE resolves to the folder it sits in --- */
  const fromFile = resolveFolders(folderCandidatesFrom({ text: episode }), probe);
  recordFn('pasted FILE -> folders', JSON.stringify(fromFile));

  /* --- CONTROL 1: a path from another machine is DROPPED, not offered --- */
  const control1 = resolveFolders(folderCandidatesFrom({ text: absent }), probe);
  recordFn('CONTROL absent path -> folders', JSON.stringify(control1));

  /* --- CONTROL 2: pasted prose produces no filesystem candidates at all --- */
  const prose = 'Here are the episodes I downloaded.\nThey are in the usual place.';
  const control2 = folderCandidatesFrom({ text: prose });
  recordFn('CONTROL prose -> candidates', JSON.stringify(control2));

  /* --- CONTROL 3: the padding really is there, and really is stripped --- */
  const naive = Buffer.from(wide).toString('ucs2');
  recordFn('CONTROL naive decode length', `${naive.length} vs path ${folder.length}`);
  recordFn('CONTROL naive decode is a real folder', probe.kindOf(naive) === 'directory');

  /* --- restore the user's clipboard, and say whether it matched --- */
  if (wroteText) {
    clipboard.writeText(textBefore);
    const after = clipboard.readText() ?? '';
    textRestored = after === textBefore;
    recordFn('clipboard text restored byte-identical', textRestored);
  }

  const pass =
    wideFolders.length === 1 &&
    wideFolders[0].toLowerCase() === folder.toLowerCase() &&
    fromFile.length === 1 &&
    fromFile[0].toLowerCase() === nested.toLowerCase() &&
    control1.length === 0 &&
    control2.length === 0 &&
    probe.kindOf(naive) !== 'directory' &&
    (hadFileSelection || (liveTextFolders.length === 1 && textRestored === true));

  console.log(`\nGATE 28 LIVE: ${pass ? 'PASS' : 'FAIL'}\n`);
  if (hadFileSelection) {
    console.log(
      '  NOTE: the live-clipboard write half was refused because the user had a\n' +
        '  file selection copied. Re-run with an empty or text clipboard for it.\n',
    );
  }
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* temp cleanup is best-effort */
  }
  return pass;
}

async function main() {
  // `--gate 35` runs the cleanup round trip instead; `--gate 28` the clipboard
  // one. All three share every helper above, so there is one probe for "what
  // does the real Windows shell do", not three.
  const gateArg = process.argv.includes('--gate')
    ? process.argv[process.argv.indexOf('--gate') + 1]
    : '21';
  if (gateArg === '28') {
    const ok = await gate28(record);
    app.exit(ok ? 0 : 1);
    return;
  }
  if (gateArg === '35' || gateArg === '32') {
    const ok = await gate35(record);
    app.exit(ok ? 0 : 1);
    return;
  }

  const { deleteFilesItemInMain } = bundle(
    path.join(ROOT, 'src', 'main', 'filesApp', 'deletionIpc.ts'),
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-files-gate21-'));
  const target = path.join(dir, 'gate21-episode.mkv');
  const bystander = path.join(dir, 'gate21-bystander.mkv');
  const bytes = Buffer.alloc(4096, 7);
  fs.writeFileSync(target, bytes);
  fs.writeFileSync(bystander, bytes);

  console.log('\n=== Gate 21 — Recycle Bin round trip (real Electron, real shell) ===\n');
  record('fixture', target);
  record('exists before', fs.existsSync(target));
  record('bystander exists before', fs.existsSync(bystander));

  // The authoritative index main would resolve from. Two rows, so "removes
  // exactly it" (gate 9) has something to be wrong about.
  const item = (id, name, filePath) => ({
    id,
    name,
    kind: 'video',
    location: { store: 'file', path: filePath },
    sizeBytes: 4096,
    flags: {},
  });
  const items = [item('media:target', 'gate21-episode.mkv', target), item('media:bystander', 'gate21-bystander.mkv', bystander)];

  let invalidated = 0;
  const deps = {
    lookupItem: (id) => {
      const row = items.find((i) => i.id === id);
      return row
        ? {
            id: row.id,
            name: row.name,
            kind: row.kind,
            location: row.location,
            sizeBytes: row.sizeBytes,
            referenced: false,
          }
        : null;
    },
    trashItem: (p) => shell.trashItem(p), // the real Windows shell
    onTrashed: () => {
      invalidated += 1;
    },
  };

  /* --- control 1: irreplaceable media refuses without its confirmation (gate 9) --- */
  const unconfirmed = await deleteFilesItemInMain({ itemId: 'media:target' }, deps);
  record('CONTROL unconfirmed ok', unconfirmed.ok);
  record('CONTROL unconfirmed reason', unconfirmed.reasonKey);
  record('CONTROL file still on disk', fs.existsSync(target));

  /* --- control 2: an id that is not in the index --- */
  const missing = await deleteFilesItemInMain(
    { itemId: 'media:nope', confirmedItemId: 'media:nope' },
    deps,
  );
  record('CONTROL unknown id ok', missing.ok);
  record('CONTROL unknown id reason', missing.reasonKey);

  /* --- the real delete --- */
  const deleted = await deleteFilesItemInMain(
    { itemId: 'media:target', confirmedItemId: 'media:target' },
    deps,
  );
  record('delete ok', deleted.ok);
  record('delete mode', deleted.mode);
  record('index invalidated', invalidated);
  record('exists after delete', fs.existsSync(target));
  record('BYSTANDER still on disk', fs.existsSync(bystander));

  /* --- it is IN the bin, found by its original path --- */
  const entry = recycleBinEntryFor(target);
  record('in Recycle Bin', entry ? 'yes' : 'NO');
  if (entry) record('bin stub', entry.binPath);

  /* --- restore it, the way the user would --- */
  const restore = restoreFromRecycleBin(target);
  record('restore verb', restore);
  record('exists after restore', fs.existsSync(target));
  const restoredBytes = fs.existsSync(target) ? fs.readFileSync(target) : Buffer.alloc(0);
  record('bytes identical', restoredBytes.equals(bytes));
  record('still in bin after restore', recycleBinEntryFor(target) ? 'yes' : 'no');

  const pass =
    unconfirmed.ok === false &&
    missing.ok === false &&
    deleted.ok === true &&
    deleted.mode === 'trash' &&
    fs.existsSync(bystander) &&
    Boolean(entry) &&
    restore === 'RESTORED' &&
    fs.existsSync(target) &&
    restoredBytes.equals(bytes);

  console.log(`\nGATE 21 LIVE: ${pass ? 'PASS' : 'FAIL'}\n`);

  // Clean up after itself; the fixture was ours and lives in temp.
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* temp cleanup is best-effort */
  }
  app.exit(pass ? 0 : 1);
}

app.whenReady().then(() =>
  main().catch((err) => {
    console.error('PROBE FAILED:', err);
    app.exit(2);
  }),
);
