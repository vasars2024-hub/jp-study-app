/**
 * L12 BULLET 4, second half — THE REMAINING-RISK REPORT.
 *
 * A release handoff's risk register is normally prose, and prose rots silently: the risk
 * gets fixed, nobody edits the document, and the next reader either chases a ghost or —
 * far worse — trusts a "closed" line that reopened. So this is a GENERATOR. Every risk
 * below carries a check that re-derives its CURRENT state from the tree, and the report is
 * regenerated rather than edited. A risk this file cannot measure is `unmeasured`, never
 * `closed`.
 *
 * The risks are not invented here. Each one is a defect this plan has already been bitten
 * by at least once, generalised from the single instance to the class:
 *
 *   R1  BUNDLED RUNTIME BLOBS ARE NOT IN GIT. A production boot from a clean branch
 *       checkout wrote 12 anonymous ERR_FILE_NOT_FOUND stacks; the cause was
 *       `public/kuromoji/dict`, gitignored. The class: anything under `public/` that the
 *       app loads at runtime but git does not carry is invisible until someone builds
 *       from a fresh clone, which is exactly what a release is.
 *
 *   R2  A SOURCE FILE THAT IS IMPORTED BUT UNTRACKED. `studyWorkspace.css` was imported by
 *       a committed module, existed in one working tree, and had no git history at all —
 *       so the production renderer build died on a clean checkout while dev never noticed,
 *       because dev resolves lazily and rollup resolves the whole graph. This check is the
 *       general form and it is the most valuable one here: it sweeps every relative
 *       specifier under `src/` and asks git whether the resolved target is tracked.
 *
 *   R3  FEATURE-PARITY ROWS STILL PENDING. The Liquid plan's own reversibility promise is
 *       only as good as the ledger behind it.
 *
 *   R4  PLAN BULLETS STILL OPEN, counted by the plan's own annotation format.
 *
 *   R5  ARCHITECTURE BASELINE DRIFT. `tools/architecture-audit.cjs` is a repo gate; a
 *       stale baseline entry fails it, and it has been red on inherited state.
 *
 *   R6  THE VISUAL ATLAS IS NOT CERTIFIABLE. Read straight out of the atlas's own verdict,
 *       so this register cannot disagree with the artifact it summarises.
 *
 *   R7  THE PACKAGER CANNOT RUN HERE. `node_modules` in this worktree is a junction to the
 *       main tree and electron-packager's copy stage reproduces it as a directory symlink,
 *       which needs Developer Mode. Environment, not product — but a release risk, because
 *       it means the packaging stage has never completed in this tree.
 *
 *   R9  BANKED EVIDENCE OVERWRITES ITSELF. Added 2026-09-02, the day the atlas's integrity
 *       check made its first live catch: 21 of the 650-cell run's plates no longer hashed
 *       to their recorded sha256, and all 21 on-disk hashes turned out to equal the tries40
 *       control run's own recorded values. Plate paths carry no run identity, so overlapping
 *       runs write the same file. The class: a JSON index over gitignored binaries that any
 *       later run may silently rewrite.
 *
 * ---------------------------------------------------------------------------------
 * THE CONTROL, `--control`, and why R2 gets the real one.
 *
 * A register where every check reports "clean" is indistinguishable from a register whose
 * checks are broken. R2 is the check worth arming, because it is the one whose failure
 * mode has actually shipped: it PLANTS a violation — an untracked module, imported by an
 * untracked importer, both under `src/` — reruns the sweep, and asserts the plant appears.
 * Then it removes both files and re-asserts the sweep is back to its original finding set.
 * A control that plants but cannot clean up would leave the defect it fabricated in the
 * tree, so the teardown is verified, not assumed.
 *
 * R3/R4 get in-memory mutation controls (their inputs are files this process parses).
 * R1, R5, R6 and R7 are reported `unfalsified` rather than given a fake control — R1 and
 * R7 would require damaging the tree or the environment, and R5/R6 are pass-throughs of
 * another instrument's own verdict.
 *
 * Run:
 *   node src/.coordination/liquid-workplace/probes/l12-risk-register.cjs \
 *     [--out <json>] [--md <markdown>] [--atlas <atlas.json>] [--control]
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const REPO = path.join(__dirname, '..', '..', '..', '..');
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const has = (name) => process.argv.indexOf(`--${name}`) >= 0;

const git = (args) => cp.spawnSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** Every path git tracks, as a Set of repo-relative POSIX paths. */
function trackedSet() {
  const r = git(['ls-files']);
  if (r.status !== 0) throw new Error(`git ls-files failed: ${r.stderr}`);
  return new Set(r.stdout.split('\n').map((s) => s.trim()).filter(Boolean));
}

function walk(dir, exts, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

const SPEC_RE = /(?:from\s*|import\s*|require\s*\(\s*)['"](\.[^'"]+)['"]/g;
const CSS_RE = /@import\s+(?:url\()?['"](\.[^'"]+)['"]/g;
const CANDIDATES = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.json',
  '/index.ts', '/index.tsx', '/index.js'];

/**
 * R2. Resolve every relative specifier under `src/` and ask git whether the file it lands
 * on is tracked. Query-suffixed specifiers (`?raw`, `?worker`) are stripped before
 * resolution — bullet 3's sweep found 63 false positives that were entirely this.
 */
function importedButUntracked(tracked) {
  const files = walk(path.join(REPO, 'src'), ['.ts', '.tsx', '.js', '.jsx', '.css']);
  const findings = [];
  let specifiers = 0;
  let resolved = 0;
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const re = f.endsWith('.css') ? CSS_RE : SPEC_RE;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      specifiers += 1;
      const raw = m[1].split('?')[0];
      const base = path.resolve(path.dirname(f), raw);
      let hit = null;
      for (const c of CANDIDATES) {
        const cand = base + c;
        if (fs.existsSync(cand) && fs.statSync(cand).isFile()) { hit = cand; break; }
      }
      if (!hit) continue;
      resolved += 1;
      const rel = path.relative(REPO, hit).replace(/\\/g, '/');
      if (!tracked.has(rel)) {
        findings.push({ importer: path.relative(REPO, f).replace(/\\/g, '/'), specifier: raw, resolvesTo: rel });
      }
    }
  }
  return { specifiers, resolved, findings };
}

/** R1. What `public/` holds, what git carries of it, and what .gitignore excludes. */
function publicBlobs(tracked) {
  const pub = path.join(REPO, 'public');
  const onDisk = fs.existsSync(pub) ? fs.readdirSync(pub) : [];
  const inGit = [...tracked].filter((p) => p.startsWith('public/'));
  const gi = fs.existsSync(path.join(REPO, '.gitignore'))
    ? fs.readFileSync(path.join(REPO, '.gitignore'), 'utf8').split('\n') : [];
  const ignoredUnderPublic = gi
    .map((l, i) => ({ line: i + 1, text: l.trim() }))
    .filter((l) => /^public\//.test(l.text) || /^\s*(models|ort|cedict|tesseract|kuromoji)\/\s*$/.test(l.text));
  // The main tree is where these blobs actually live; comparing the two entry counts is
  // what named the gap mechanically the first time.
  const mainPub = path.join(REPO, '..', 'jp-study-app', 'public');
  const mainEntries = fs.existsSync(mainPub) ? fs.readdirSync(mainPub) : null;
  return {
    entriesOnDisk: onDisk.length,
    entryNames: onDisk,
    pathsTrackedByGit: inGit.length,
    trackedNames: inGit,
    gitignoreLines: ignoredUnderPublic,
    referenceTreeEntries: mainEntries ? mainEntries.length : null,
    referenceTreeOnly: mainEntries ? mainEntries.filter((e) => !onDisk.includes(e)) : null,
  };
}

/** R3. */
function parityLedger() {
  const p = path.join(REPO, 'src', '.coordination', 'liquid-workplace', 'parity-ledger.json');
  if (!fs.existsSync(p)) return { available: false };
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const rows = Array.isArray(j) ? j : (j.rows || j.entries || []);
  const tally = {};
  for (const r of rows) {
    const s = r.status || r.state || 'unknown';
    tally[s] = (tally[s] || 0) + 1;
  }
  const pending = rows.filter((r) => (r.status || r.state) === 'pending');
  return {
    available: true,
    rows: rows.length,
    tally,
    pendingRows: pending.map((r) => ({ surface: r.surface || r.app || null, feature: r.feature || r.name || null, blocker: r.blocker || r.note || null })),
  };
}

/** R4, by the plan's own annotation format — the same grep the burn-down line uses. */
function planBullets(text) {
  const lines = text.split('\n');
  const closed = lines.filter((l) => /^- .*status: closed;/.test(l)).length;
  const open = lines.filter((l) => /^- .*status: open;/.test(l)).length;
  const unknown = lines.filter((l) => /^- .*status: unknown;/.test(l)).length;
  const openTitles = lines.filter((l) => /^- .*status: open;/.test(l))
    .map((l) => l.replace(/\s*<!--[\s\S]*$/, '').replace(/^- /, '').trim());
  return { closed, open, unknown, total: closed + open + unknown, openTitles };
}

/** R5. */
function architectureAudit() {
  const r = cp.spawnSync(process.execPath, [path.join('tools', 'architecture-audit.cjs')],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const num = (re) => { const m = out.match(re); return m ? Number(m[1]) : null; };
  return {
    exit: r.status,
    modules: num(/(\d+)\s+modules/),
    stale: num(/(\d+)\s+stale/i),
    fresh: num(/(\d+)\s+(?:new|fresh)/i),
    tail: out.trim().split('\n').slice(-6).join('\n'),
  };
}

/**
 * R8 — THE REPO'S OWN GATES. L12's third bullet is literally "run focused tests, full
 * suite, architecture/i18n gates", so a risk register for this bullet that carries no
 * gate result is missing the one number the release turns on.
 *
 * The two i18n gates are source scans with no build step, so they are run here. The full
 * vitest suite takes minutes and must NOT be run inside a generator that anything might
 * call in a loop — instead it is PARSED from a log the turn already produced
 * (`--vitest-log`). Parsing the artifact is the point: a hand-typed count is a claim, and
 * this repo has already had a `vitest | tail` pipeline report tail's exit code as the
 * suite's.
 */
function repoGates(vitestLog) {
  const run = (script) => {
    const r = cp.spawnSync(process.execPath, [path.join('tools', script)],
      { cwd: REPO, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    return { exit: r.status, lastLine: out.trim().split('\n').slice(-1)[0] || '' };
  };
  const i18n = run('i18n-check.cjs');
  const hardcoded = fs.existsSync(path.join(REPO, 'tools', 'i18n-hardcoded-check.cjs'))
    ? run('i18n-hardcoded-check.cjs') : { exit: null, lastLine: 'tools/i18n-hardcoded-check.cjs absent' };

  let vitest = { available: false, why: 'no --vitest-log given; the full suite is not run from inside this generator' };
  if (vitestLog && fs.existsSync(vitestLog)) {
    const text = fs.readFileSync(vitestLog, 'utf8');
    const files = text.match(/Test Files\s+(?:(\d+) failed \|\s*)?(\d+) passed/);
    const tests = text.match(/Tests\s+(?:(\d+) failed \|\s*)?(\d+) passed/);
    // `×` prefixes both a FAILING FILE and each failing test NAME beneath it, so an
    // unfiltered sweep returns "does", "renders", "returns" alongside the paths — verified
    // against a banked log. Only path-shaped entries are file identities.
    const failedNames = [...new Set((text.match(/^\s*(?:FAIL|×)\s+(\S+)/gm) || [])
      .map((l) => l.replace(/^\s*(?:FAIL|×)\s+/, '').split('>')[0].trim())
      .filter((s) => s.includes('/') && /\.(test|spec)\./.test(s)))];
    vitest = {
      available: !!(files || tests),
      log: path.relative(REPO, vitestLog).replace(/\\/g, '/'),
      filesFailed: files ? Number(files[1] || 0) : null,
      filesPassed: files ? Number(files[2]) : null,
      testsFailed: tests ? Number(tests[1] || 0) : null,
      testsPassed: tests ? Number(tests[2]) : null,
      failingFiles: failedNames.slice(0, 12),
    };
  }
  return { i18nCheck: i18n, i18nHardcoded: hardcoded, vitest };
}

/** R7. */
function packagerEnvironment() {
  const nm = path.join(REPO, 'node_modules');
  let kind = 'absent';
  if (fs.existsSync(nm)) {
    const st = fs.lstatSync(nm);
    kind = st.isSymbolicLink() ? 'reparse-point' : st.isDirectory() ? 'real-directory' : 'other';
  }
  return {
    nodeModules: kind,
    // The packager's copy stage reproduces a reparse point as a *directory* symlink, which
    // Windows refuses without Developer Mode. Measured, not reasoned: a `'junction'` link
    // succeeds in the same shell where `'dir'` returns EPERM.
    packagerCopyStageRunnable: kind === 'real-directory',
    outDirPresent: fs.existsSync(path.join(REPO, 'out')),
    viteBuildPresent: fs.existsSync(path.join(REPO, '.vite', 'build', 'main.js')),
  };
}

/**
 * R9. BANKED VISUAL EVIDENCE HAS NO PER-RUN NAMESPACE.
 *
 * Found 2026-09-02 by the atlas's own integrity check, on its first live catch: 21 of run
 * A's plates no longer hashed to their recorded sha256. Not guessed — all 21 were
 * `oled-black`, and all 21 on-disk hashes equalled the tries40 control run's OWN recorded
 * hashes. A plate is named `app__presentation__theme__state.png`, so two runs that overlap
 * on those four coordinates write the same path and the later one destroys the earlier
 * one's image. The manifest keeps asserting a hash for bytes that are gone.
 *
 * The class, and why it is a release risk rather than a tidiness one: every certification
 * artifact this plan produces is a JSON index over gitignored binaries. If a re-run can
 * silently overwrite them, the wall of pictures a reader is shown is not the wall the
 * verdict was computed from, and nothing in the JSON says so.
 *
 * Measured WITHOUT touching the images: read every committed matrix manifest, group the
 * declared plate paths, and count paths claimed by more than one run. That is the hazard
 * itself; whether a given tree currently shows the damage depends on which run happened to
 * go last, which is exactly what makes it silent.
 */
function plateNamespace() {
  const dir = path.join(REPO, 'src', '.coordination', 'liquid-workplace', 'baselines');
  if (!fs.existsSync(dir)) return { available: false };
  const files = fs.readdirSync(dir).filter((f) => /^l12-matrix-.*\.json$/.test(f));
  const owners = new Map();
  for (const f of files) {
    let m;
    try { m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    if (m.schema !== 'l12-visual-matrix/v1') continue;
    for (const c of m.cells || []) {
      if (!c.file) continue;
      if (!owners.has(c.file)) owners.set(c.file, []);
      owners.get(c.file).push({ run: f, sha256: c.sha256 || null });
    }
  }
  const shared = [...owners.entries()].filter(([, l]) => l.length > 1);
  // A shared path where the runs recorded DIFFERENT hashes is proof one image was lost;
  // a shared path with equal hashes is the same hazard that happened not to bite.
  const destructive = shared.filter(([, l]) => new Set(l.map((x) => x.sha256)).size > 1);
  return {
    available: true,
    manifests: files.length,
    declaredPlatePaths: owners.size,
    pathsClaimedByMoreThanOneRun: shared.length,
    pathsWhereRunsRecordDifferentBytes: destructive.length,
    examples: destructive.slice(0, 4).map(([f, l]) => ({ file: f, runs: l.map((x) => x.run) })),
  };
}

/** R6. */
function atlasVerdict(p) {
  if (!p || !fs.existsSync(p)) return { available: false };
  const a = JSON.parse(fs.readFileSync(p, 'utf8'));
  return {
    available: true,
    file: path.relative(REPO, p).replace(/\\/g, '/'),
    generatedAt: a.generatedAt,
    certifiable: !!a.certifiable,
    blockers: a.blockers || [],
    completeness: a.coverage && a.coverage.completeness,
    axes: Object.fromEntries((a.axisEffectiveness || []).map((x) => [x.axis, x.verdict])),
  };
}

// ---------------------------------------------------------------------------------
function build(atlasPath, vitestLog) {
  const tracked = trackedSet();
  const planPath = path.join(REPO, 'src', 'LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md');
  const planText = fs.readFileSync(planPath, 'utf8');

  const r1 = publicBlobs(tracked);
  const r2 = importedButUntracked(tracked);
  const r3 = parityLedger();
  const r4 = planBullets(planText);
  const r5 = architectureAudit();
  const r6 = atlasVerdict(atlasPath);
  const r7 = packagerEnvironment();
  const r8 = repoGates(vitestLog);
  const r9 = plateNamespace();

  const risks = [
    {
      id: 'R1',
      title: 'Runtime blobs the app loads from public/ are not in git',
      severity: 'high',
      state: r1.pathsTrackedByGit >= r1.entriesOnDisk ? 'closed' : 'open',
      measurement: r1,
      whyItMatters: 'A production build from a clean clone lacks them and fails at runtime with no useful diagnostic. This is how 12 anonymous ERR_FILE_NOT_FOUND stacks got into a production boot.',
      whatWouldCloseIt: 'Either track the blobs (they are large), or make the packaging step fetch/stage them and fail loudly when they are absent. The named-diagnostic fix landed in 96a7b579 makes the failure legible; it does not make the blobs present.',
      falsified: false,
    },
    {
      id: 'R2',
      title: 'A source file is imported by tracked code but is itself untracked',
      severity: 'high',
      state: r2.findings.length ? 'open' : 'closed',
      measurement: { specifiers: r2.specifiers, resolved: r2.resolved, findings: r2.findings },
      whyItMatters: 'Dev resolves imports lazily, rollup resolves the whole graph, so this class of defect is invisible from a working tree and kills the production build on a clean checkout.',
      whatWouldCloseIt: 'git add the resolved target, or delete the import.',
      falsified: null,
    },
    {
      id: 'R3',
      title: 'Feature-parity rows are still pending',
      severity: 'medium',
      state: r3.available ? ((r3.tally.pending || 0) ? 'open' : 'closed') : 'unmeasured',
      measurement: r3,
      whyItMatters: "The plan's reversibility promise is only as strong as the ledger behind it; a pending row is a feature nobody has shown survives the Liquid round trip.",
      whatWouldCloseIt: 'Each pending row names its own blocker in the ledger.',
      falsified: null,
    },
    {
      id: 'R4',
      title: 'Liquid plan bullets are still open',
      severity: 'medium',
      state: r4.open ? 'open' : 'closed',
      measurement: { closed: r4.closed, open: r4.open, unknown: r4.unknown, total: r4.total, openTitles: r4.openTitles },
      whyItMatters: 'The release gate is the plan’s own definition of done.',
      whatWouldCloseIt: 'Close each remaining bullet against its own words with live evidence.',
      falsified: null,
    },
    {
      id: 'R5',
      title: 'The architecture-audit gate is red',
      severity: 'medium',
      state: r5.exit === 0 ? 'closed' : 'open',
      measurement: r5,
      whyItMatters: 'It is one of the four repo gates; red on inherited state hides a genuinely new finding behind noise.',
      whatWouldCloseIt: 'Reconcile the stale baseline entries it names.',
      falsified: false,
    },
    {
      id: 'R6',
      title: 'The visual atlas is not certification evidence',
      severity: 'high',
      state: !r6.available ? 'unmeasured' : r6.certifiable ? 'closed' : 'open',
      measurement: r6,
      whyItMatters: 'L12 exists to certify the transformation visually. An atlas that cannot certify is the whole bullet unmet, however many images it holds.',
      whatWouldCloseIt: 'Every blocker the atlas lists, in its own words.',
      falsified: false,
    },
    {
      id: 'R7',
      title: 'The packaging stage has never completed in this tree',
      severity: 'low',
      state: r7.packagerCopyStageRunnable ? 'closed' : 'open',
      measurement: r7,
      whyItMatters: 'Compilation is proven (8 of 8 forge targets build), but the file-copy stage that produces a shippable app is unexercised here.',
      whatWouldCloseIt: 'Windows Developer Mode, or running the packager in a tree whose node_modules is a real directory. Environment, not product: the copy stage compiles nothing.',
      falsified: false,
    },
    {
      id: 'R8',
      title: "The repo's own gates are not green at this HEAD",
      severity: 'high',
      state: (() => {
        const bad = [r8.i18nCheck.exit, r8.i18nHardcoded.exit].some((e) => e !== null && e !== 0);
        if (bad) return 'open';
        if (!r8.vitest.available) return 'unmeasured';
        return r8.vitest.testsFailed ? 'open' : 'closed';
      })(),
      measurement: r8,
      whyItMatters: "L12's own third bullet is the gate run. A branch that is red alone and green only because of another track's uncommitted files has no clean release gate at all — that is boss-audit Finding 1, carried across audits.",
      whatWouldCloseIt: 'Each red identity fixed or hunk-scope committed by its owner, then a re-run that shows no NEW identity — never a smaller count.',
      falsified: false,
    },
    {
      id: 'R9',
      title: 'Banked visual evidence has no per-run namespace, so a re-run overwrites it',
      severity: 'high',
      state: !r9.available ? 'unmeasured'
        : r9.pathsClaimedByMoreThanOneRun ? 'open' : 'closed',
      measurement: r9,
      whyItMatters: "Every certification artifact here is a JSON index over gitignored binaries. A plate is named app__presentation__theme__state.png with nothing identifying the run, so two overlapping runs write the same path and the later one destroys the earlier image while its manifest keeps asserting a hash. Measured live: 21 of the 650-cell run's oled-black plates now hash to the tries40 run's recorded values. The wall of pictures a reader is shown is then not the wall the verdict was computed from, and nothing in the JSON says so.",
      whatWouldCloseIt: "l12-visual-matrix.cjs writing plates under a per-run directory (a run id or the manifest's own generatedAt), so no two runs can share a path. That file is bullet 1's and another worker's, so this is reported rather than repaired.",
      falsified: false,
    },
  ];

  const open = risks.filter((r) => r.state === 'open');
  return {
    schema: 'l12-risk-register/v1',
    bullet: 'L12 bullet 4 — remaining-risk report',
    generatedAt: new Date().toISOString(),
    head: git(['rev-parse', '--short', 'HEAD']).stdout.trim(),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim(),
    totals: {
      risks: risks.length,
      open: open.length,
      closed: risks.filter((r) => r.state === 'closed').length,
      unmeasured: risks.filter((r) => r.state === 'unmeasured').length,
      highOpen: open.filter((r) => r.severity === 'high').length,
    },
    risks,
  };
}

/**
 * The control. R2 gets a real plant; the file-parsing checks get in-memory mutation.
 * Anything that would require damaging the tree or the OS is reported `unfalsified`.
 */
function controls(base) {
  const out = {};

  // --- R2: plant an untracked module, imported by an untracked importer, both under src/.
  const dir = path.join(REPO, 'src', '.coordination', 'liquid-workplace');
  const victim = path.join(dir, '__l12risk_planted_target.ts');
  const importer = path.join(dir, '__l12risk_planted_importer.ts');
  let planted = null;
  try {
    fs.writeFileSync(victim, 'export const PLANTED = 1;\n');
    fs.writeFileSync(importer, "import { PLANTED } from './__l12risk_planted_target';\nexport default PLANTED;\n");
    const after = importedButUntracked(trackedSet());
    planted = after.findings.filter((f) => f.resolvesTo.includes('__l12risk_planted_target'));
  } finally {
    fs.rmSync(victim, { force: true });
    fs.rmSync(importer, { force: true });
  }
  const teardown = !fs.existsSync(victim) && !fs.existsSync(importer);
  const restored = importedButUntracked(trackedSet());
  out.r2 = {
    kind: 'plant-an-untracked-import/R2-must-find-it',
    plantFound: (planted || []).length,
    baseFindings: base.risks.find((r) => r.id === 'R2').measurement.findings.length,
    restoredFindings: restored.findings.length,
    teardownVerified: teardown,
    pass: (planted || []).length === 1 && teardown
      && restored.findings.length === base.risks.find((r) => r.id === 'R2').measurement.findings.length,
  };

  // --- R4: mutate the plan text in memory; the counter must move by exactly one.
  const planText = fs.readFileSync(path.join(REPO, 'src', 'LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md'), 'utf8');
  const b0 = planBullets(planText);
  const b1 = planBullets(`${planText}\n- A fabricated bullet.  <!-- status: open; evidence: control -->\n`);
  out.r4 = {
    kind: 'append-one-open-bullet/R4-count-must-rise-by-one',
    base: b0.open,
    mutated: b1.open,
    pass: b1.open === b0.open + 1,
  };

  // --- R3: the ledger tally, mutated in memory.
  const lp = path.join(REPO, 'src', '.coordination', 'liquid-workplace', 'parity-ledger.json');
  if (fs.existsSync(lp)) {
    const j = JSON.parse(fs.readFileSync(lp, 'utf8'));
    const rows = Array.isArray(j) ? j : (j.rows || j.entries || []);
    const before = rows.filter((r) => (r.status || r.state) === 'pending').length;
    const mutated = rows.map((r, i) => (i === 0 ? { ...r, status: 'pending', state: 'pending' } : r));
    const after = mutated.filter((r) => (r.status || r.state) === 'pending').length;
    out.r3 = {
      kind: 'force-one-row-pending/R3-count-must-rise-or-hold-if-already-pending',
      base: before,
      mutated: after,
      pass: after >= before && after === before + (((rows[0] || {}).status || (rows[0] || {}).state) === 'pending' ? 0 : 1),
    };
  } else out.r3 = { kind: 'force-one-row-pending', pass: null, note: 'n/a — no parity-ledger.json' };

  // --- R9: plant a manifest that claims a plate path an existing run already claims, with
  // different bytes. The collision count must rise by exactly one and fall back on teardown.
  // A real file plant, not an in-memory one, because the check reads the directory itself.
  const bdir = path.join(REPO, 'src', '.coordination', 'liquid-workplace', 'baselines');
  const plant = path.join(bdir, 'l12-matrix-__r9control.json');
  const b9 = base.risks.find((r) => r.id === 'R9').measurement;
  if (b9.available && b9.declaredPlatePaths) {
    let mutated = null;
    try {
      const donor = fs.readdirSync(bdir).filter((f) => /^l12-matrix-.*\.json$/.test(f) && f !== path.basename(plant))[0];
      const dm = JSON.parse(fs.readFileSync(path.join(bdir, donor), 'utf8'));
      const cell = (dm.cells || []).find((c) => c.file && c.sha256);
      fs.writeFileSync(plant, `${JSON.stringify({
        schema: 'l12-visual-matrix/v1',
        cells: [{ ...cell, sha256: `0${cell.sha256.slice(1)}` }],
      })}\n`);
      mutated = plateNamespace();
    } finally {
      fs.rmSync(plant, { force: true });
    }
    const restored = plateNamespace();
    out.r9 = {
      kind: 'plant-a-colliding-plate-path/R9-must-report-one-more-destructive-collision',
      base: b9.pathsWhereRunsRecordDifferentBytes,
      mutated: mutated && mutated.pathsWhereRunsRecordDifferentBytes,
      restored: restored.pathsWhereRunsRecordDifferentBytes,
      teardownVerified: !fs.existsSync(plant),
      pass: !!mutated && mutated.pathsWhereRunsRecordDifferentBytes === b9.pathsWhereRunsRecordDifferentBytes + 1
        && restored.pathsWhereRunsRecordDifferentBytes === b9.pathsWhereRunsRecordDifferentBytes
        && !fs.existsSync(plant),
    };
  } else out.r9 = { kind: 'plant-a-colliding-plate-path', pass: null, note: 'n/a — no matrix manifests to collide with' };

  out.unfalsified = ['R1', 'R5', 'R6', 'R7', 'R8'];
  out.unfalsifiedWhy = 'R1 and R7 would require damaging the tree or changing an OS setting to plant a violation; R5 and R6 are pass-throughs of another instrument’s own verdict and are falsified there, not here.';
  const vals = ['r2', 'r3', 'r4', 'r9'].map((k) => out[k] && out[k].pass);
  out.summary = { fired: vals.filter((v) => v === true).length, failed: vals.filter((v) => v === false).length };
  return out;
}

function markdown(reg) {
  const sev = { high: 'HIGH', medium: 'MED', low: 'LOW' };
  const rows = reg.risks.map((r) => `| ${r.id} | ${sev[r.severity]} | ${r.state.toUpperCase()} | ${r.title} |`).join('\n');
  const detail = reg.risks.map((r) => {
    const m = JSON.stringify(r.measurement, null, 2).split('\n').slice(0, 40).join('\n');
    return `### ${r.id} — ${r.title}\n\n**${r.severity.toUpperCase()} · ${r.state.toUpperCase()}**\n\n`
      + `Why it matters: ${r.whyItMatters}\n\nWhat would close it: ${r.whatWouldCloseIt}\n\n`
      + '```json\n' + m + '\n```\n';
  }).join('\n');
  return `# L12 bullet 4 — remaining-risk report\n\n`
    + `GENERATED, not written. Re-run \`node src/.coordination/liquid-workplace/probes/l12-risk-register.cjs --control\`\n`
    + `rather than editing this file; a hand-edit is a claim with no measurement behind it.\n\n`
    + `Branch \`${reg.branch}\` at \`${reg.head}\`, ${reg.generatedAt}.\n\n`
    + `**${reg.totals.open} of ${reg.totals.risks} risks open** (${reg.totals.highOpen} high, `
    + `${reg.totals.closed} closed, ${reg.totals.unmeasured} unmeasured).\n\n`
    + `| id | sev | state | risk |\n| --- | --- | --- | --- |\n${rows}\n\n${detail}`;
}

// ---------------------------------------------------------------------------------
(() => {
  const atlasPath = path.resolve(REPO, arg('atlas',
    path.join('src', '.coordination', 'liquid-workplace', 'baselines', 'l12-atlas.json')));
  const vl = arg('vitest-log', '');
  const reg = build(atlasPath, vl ? path.resolve(REPO, vl) : '');
  if (has('control')) reg.controls = controls(reg);
  else reg.controls = null;

  const outPath = path.resolve(REPO, arg('out',
    path.join('src', '.coordination', 'liquid-workplace', 'baselines', 'l12-risk-register.json')));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(reg, null, 2)}\n`);

  const mdPath = path.resolve(REPO, arg('md',
    path.join('src', '.coordination', 'liquid-workplace', 'L12_REMAINING_RISK.md')));
  fs.writeFileSync(mdPath, markdown(reg));

  console.log(JSON.stringify({
    out: path.relative(REPO, outPath).replace(/\\/g, '/'),
    md: path.relative(REPO, mdPath).replace(/\\/g, '/'),
    ...reg.totals,
    states: Object.fromEntries(reg.risks.map((r) => [r.id, r.state])),
    controls: reg.controls && reg.controls.summary,
  }, null, 2));
})();
