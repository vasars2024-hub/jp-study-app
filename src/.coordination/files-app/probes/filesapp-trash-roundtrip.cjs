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

async function main() {
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
