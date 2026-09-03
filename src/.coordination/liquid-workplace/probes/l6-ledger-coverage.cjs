// Update the ledger's own `notWritten` and `controlCoverage` blocks. Both are CLAIMS the
// ledger makes about itself, so they are re-derived here from the rows and the spec file
// rather than decremented by hand.
//
// Run from the repo root: `node src/.coordination/liquid-workplace/probes/l6-ledger-coverage.cjs`
//
// RELOCATED 2026-09-03 from `debug/_p2g-notwritten.cjs`, which is GITIGNORED — while
// `controlCoverage.reason`, in the TRACKED ledger, named that path as the authority for its
// own numbers. An audit trail may not point outside the repository. See the same note in
// `l6-control-transcribe.cjs`; the debug copies are deleted, not mirrored.
const fs = require('node:fs');

const LEDGER = 'src/.coordination/liquid-workplace/parity-ledger.json';
const SPEC = 'src/.coordination/liquid-workplace/probes/l6-parity.js';
const META = 'src/.coordination/liquid-workplace/parity-row-metadata.json';

const l = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const meta = JSON.parse(fs.readFileSync(META, 'utf8')).apps;
const specLines = fs.readFileSync(SPEC, 'utf8').split('\n');
const specs = [];
specLines.forEach((line) => { const mm = /^ {4}([a-zA-Z]+): \{\s*$/.exec(line); if (mm) specs.push(mm[1]); });

const ledgerApps = [...new Set(l.rows.map((r) => r.app))];
const withoutMeta = specs.filter((s) => !meta[s]);
const ledgerOnly = ledgerApps.filter((a) => !specs.includes(a));
const left = specs.filter((s) => !ledgerApps.includes(s));

const text = `the other ${left.length} root components — was 19 on 2026-09-01, 17 and then 13 on 2026-09-02,`
  + ` and ${left.length} once the two tracks' concurrent b2 waves were MERGED (the drop is one merge, not one`
  + ` turn's throughput; each track measured only its own side and both figures were honest).`
  + ` calendar (5) and settings (7) left this list first; scraper (7), resources (7 of 8) and city (9) left it`
  + ` next, then shell (9), blancShell (8) and games (10) from this tree and flashcards/statistics/library/`
  + `music/video/youtube from the main tree — all derived from live cat6 PASS runs rather than hand-transcribed.`
  + ` files (8) left it LAST and arrived on this list after it was written: it is the 25th`
  + ` DESKTOP_WIN_SECTIONS entry, added since df751d60, so for one turn it was a section with`
  + ` neither spec nor row and \`left\` could not see it (this count reads SPECS, and there was none).`
  + ` Written in their own waves,`
  + ` against ALL_APPS_BASELINE.md. Counted mechanically, not decremented by hand: probes/l6-parity.js declares`
  + ` SPECS for ${specs.length} apps, parity-ledger.json carries rows for ${ledgerApps.length}, and`
  + ` ${left.length} declared specs still have NO row at all — ${left.join(', ')}.`
  + (ledgerOnly.length
    ? ` ${ledgerOnly.length} ledger app(s) (${ledgerOnly.join(', ')}) have rows but no spec, so they cannot be re-derived by this route at all.`
    : ' EVERY ledger app now has a spec: `mediaCenter` was the last one without, and got one on 2026-09-02, so the whole ledger is re-derivable by this route.')
  + ` resources contributes 7 of its 8 rows: collectedSections is written only`
  + ` when a profile has a collected tool, because its mutation cannot arm otherwise.`;

l.notWritten.apps[1] = text;
fs.writeFileSync(LEDGER, `${JSON.stringify(l, null, 2)}\n`, 'utf8');
console.log(text);

// ---------------------------------------------------------------------------
// The ledger's SECOND self-claim, added 2026-09-02 (primary2): how many of its own
// rows actually name a negative control. A row is "verified by side effect" only if
// something falsified it; 45 of 93 rows carried no control clause at all when this
// was first counted, and the ledger did not say so anywhere. Derived, never typed.
const l2 = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const withCtl = l2.rows.filter((r) => /negative control `/.test(r.observed));
const declaredNone = l2.rows.filter((r) => /negative control: NONE DECLARED/.test(r.observed));
const silent = l2.rows.filter((r) => !/negative control/.test(r.observed));
const byApp = {};
for (const r of silent) byApp[r.app] = (byApp[r.app] || 0) + 1;
// Split `silent` by CAUSE, because the two causes have different remedies and lumping them
// hid a claim this block had made about itself. A row written in the 2026-09-02 b2 wave by the
// main tree's `_pr4-rows.cjs` DID have per-row mutations run against it by cat6 — that writer
// simply does not transcribe `control.mutations` into `observed`, where this counter reads.
const wave = silent.filter((r) => /L12 b2, primary\)/.test(String(r.visualProof)));
const older = silent.filter((r) => !/L12 b2, primary\)/.test(String(r.visualProof)));
l2.controlCoverage = {
  reason: 'A ledger row claims "verified by side effect". That is only true if a mutation falsified it and the row fell. This block is re-derived from the rows themselves by probes/l6-ledger-coverage.cjs — never decremented by hand.',
  rows: l2.rows.length,
  withNamedControl: withCtl.length,
  declaredNone: declaredNone.length,
  silent: silent.length,
  silentByApp: byApp,
  silentByCause: {
    predatingTheClause: older.length,
    b2WaveNotTranscribed: wave.length,
    b2WaveApps: [...new Set(wave.map((r) => r.app))],
  },
  note: '`silent` means this ledger records no control clause for the row. It is a gap in the LEDGER, not a disproof of the row — but it is a real gap and it is not monotone. THIS BLOCK RETRACTS ITS OWN EARLIER CLAIM: it used to end "New rows now say NONE DECLARED explicitly, so `silent` can only shrink", and the 2026-09-02 merge of the two concurrent b2 waves falsified that — silent went 45/120 -> 93/168, because the main tree\'s row writer (debug/_pr4-rows.cjs) copies only `rowEvidence` into `observed` while this tree\'s (probes/l6-parity-rows.cjs) also copies `control.mutations`. See `silentByCause`: the `b2WaveNotTranscribed` rows DID have per-row mutations run by cat6 and their receipts survive, so those are recoverable by transcription; the `predatingTheClause` rows are the older ones written before any writer said anything about controls. Two writers, one ledger, one claim that only held for one of them.',
};
fs.writeFileSync(LEDGER, `${JSON.stringify(l2, null, 2)}\n`, 'utf8');
console.log(`controlCoverage: ${withCtl.length} named / ${declaredNone.length} none-declared / ${silent.length} silent of ${l2.rows.length}`);
console.log(`  silent by app: ${JSON.stringify(byApp)}`);

// The `derived` block arrived from the main tree (primary) as a machine-readable twin of the
// prose above. Two independent re-derivations of one fact are guaranteed to disagree after a
// merge, so there is ONE computation and both forms are written from it.
const l3 = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
l3.notWritten.derived = {
  at: new Date().toISOString().slice(0, 10) + ' (re-derived by probes/l6-ledger-coverage.cjs)',
  method: "l6-parity.js SPECS keys parsed from source, against the distinct `app` values in rows[] — the same computation that writes the prose in notWritten.apps[1], so the two cannot drift",
  harnessSpecs: specs.length,
  specsWithRows: ledgerApps.filter((a) => specs.includes(a)).length,
  specsWithNoRows: left.length,
  noRows: left,
  // SPLIT BY CAUSE (2026-09-02, primary2). "No rows" had been one bucket, and it hid the
  // difference between a spec nobody has authored yet and a spec whose SUBJECT this branch
  // deleted. `notebook` is the second kind and it is measured, not assumed -- see
  // PARITY_LEDGER.md 2026-09-02 (primary2) for the three-way control. Authoring rows for it
  // is not pending work; there is nothing to drive.
  noRowsByCause: {
    noSubjectOnThisBranch: left.filter((s) => s === 'notebook'),
    noSubjectEvidence: left.includes('notebook')
      ? 'notebook: FILES_APP_PLAN gate 7b deletes the Notebook section. `AppSection.tsx` has no `case \'notebook\'`, `LEGACY_WIN_SECTION_ALIASES` (shared/desktop.ts:76) maps notebook -> files, and `NotebookContent.tsx` survives only as a Blanc import. Driven live on this branch: os:open `notebook` opens a window titled "Files" whose body root is `DIV.lq-scaffold.fa-shell`, 52 buttons, 0 `.gx-notebook` in the whole document.'
      : null,
    awaitingAuthoring: left.filter((s) => s !== 'notebook'),
  },
  ledgerAppsWithNoSpec: ledgerOnly,
  note: 'Counts THIS tree. A worker measuring before a merge sees a smaller figure, honestly, and it is not the project total.',
};
fs.writeFileSync(LEDGER, `${JSON.stringify(l3, null, 2)}\n`, 'utf8');
console.log('derived:', l3.notWritten.derived.specsWithNoRows, 'specs with no rows;', l3.notWritten.derived.specsWithRows, 'with rows of', l3.notWritten.derived.harnessSpecs);
