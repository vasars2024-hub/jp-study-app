// Do the reasons this track keeps carrying still hold? — slice 36.
//
// Slice 34 acted on a reason slice 4 had recorded as *verified* — "no analyse API is exposed
// in preload.ts at all" — and found it had been false for days. Nothing in the record could
// have said so; the grep had to be re-run. Slice 32 carried "delete the old player" for
// sixteen slices after slice 16 had already deleted it. Slice 33 spent a slice discovering
// that a measurement it inherited counted the wrong thing.
//
// The lesson those three share is that **a verified reason has a shelf life**, and the only
// way a shelf life is enforced is by re-running the check. That is this file. Each entry is a
// claim the carried list makes, the state the records currently assert, and a check that asks
// reality. A divergence exits 1 and names the record line to fix — it is NOT a product defect
// and must not be read as one.
//
// Adding an entry is the point, not an afterthought: whenever a session defers something "for
// a verified reason", the reason belongs here, so the next session is told when it expires.
//
// usage:
//   node docs/migration/tools/audit-carried-items.mjs [--json]

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

const read = (relative) => {
  const file = path.join(REPO, relative);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
};

const tracked = (relative) => {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', relative], { cwd: REPO, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
};

const uncommittedLines = (relative) => {
  try {
    const out = String(execFileSync('git', ['diff', '--numstat', 'HEAD', '--', relative], {
      cwd: REPO,
      stdio: ['pipe', 'pipe', 'pipe'],
    }));
    const [added = '0', removed = '0'] = out.trim().split(/\s+/);
    return { added: Number(added), removed: Number(removed) };
  } catch {
    return { added: 0, removed: 0 };
  }
};

const reachable = (port, host = '127.0.0.1', timeoutMs = 1_500) => new Promise((resolve) => {
  const socket = net.connect({ port, host });
  const done = (value) => {
    socket.destroy();
    resolve(value);
  };
  socket.setTimeout(timeoutMs);
  socket.once('connect', () => done(true));
  socket.once('timeout', () => done(false));
  socket.once('error', () => done(false));
});

/**
 * `holds: true` means the claim is still TRUE of the tree — i.e. the reason for carrying the
 * item is intact. `recordedAs: 'holds'` is what the records assert today. Divergence is the
 * whole output of this tool.
 */
const CLAIMS = [
  {
    id: 'analyse-api-absent-from-preload',
    claim: 'No analyse-shaped API is exposed in preload.ts at all (slice 4).',
    recordedAs: 'expired',
    where: 'progress.json nextActions — two entries, corrected by slice 36',
    check: () => {
      const preload = read('src/preload.ts') ?? '';
      const line = preload.split('\n').findIndex((text) => text.includes('studyPrepare:')) + 1;
      return { holds: line === 0, evidence: line ? `preload.ts:${line} exposes studyPrepare` : 'no studyPrepare in preload.ts' };
    },
  },
  {
    id: 'analyse-handler-untracked',
    claim: 'The study:prepare HANDLER lives in an untracked main/mediaStudyOrchestrator.ts, so the main side of the bar is unmet (slice 34).',
    // Expired 2026-08-02, slice 43: committed as 1f5e327, its own commit, that path only.
    recordedAs: 'expired',
    where: 'NEXT_SESSION.md slice 34, progress.json analyseRowActionWired20260801',
    check: () => {
      const exists = fs.existsSync(path.join(REPO, 'src/main/mediaStudyOrchestrator.ts'));
      const isTracked = tracked('src/main/mediaStudyOrchestrator.ts');
      return {
        holds: exists && !isTracked,
        evidence: `file ${exists ? 'exists' : 'missing'}, ${isTracked ? 'TRACKED — the bar is met, wire the prop' : 'untracked'}`,
      };
    },
  },
  {
    id: 'analyse-action-unwired-in-production',
    claim: 'MediaWorkspaceHost mounts <SeanimeStudyLibraryPanel /> with no props, so the analyse action ships offered-but-unsupplied (slice 34).',
    // Expired 2026-08-02, slice 43. NOTE for whoever reads the record next: the claim was
    // right that the action was unsupplied and WRONG that the fix was one prop. It is three
    // — `onAnalyse` makes the button work, and without `orchestrator` + `fingerprints` the
    // row it acts on can never leave `unanalyzed`, so a one-prop fix would have shipped a
    // button that reports success and changes nothing visible.
    recordedAs: 'expired',
    where: 'NEXT_SESSION.md slice 34 "production wiring is one prop"',
    check: () => {
      const host = read('src/media/MediaWorkspaceHost.tsx') ?? '';
      const bare = host.includes('<SeanimeStudyLibraryPanel />');
      return { holds: bare, evidence: bare ? 'mounted with no props' : 'the panel now takes props — the one-prop claim is stale' };
    },
  },
  {
    id: 'palette-renders-behind-the-workspace',
    claim: 'The command palette (z 1201) renders behind the media workspace (z 9999) and the layering question is undecided.',
    recordedAs: 'expired',
    where: 'progress.json nextActions — closed by slice 10, corrected by slice 36',
    check: () => {
      const styles = read('src/renderer/styles.css') ?? '';
      const tokens = read('src/renderer/theme/tokens.css') ?? '';
      const onScale = styles.includes('z-index: var(--z-shell-overlay, 20001)');
      const declared = /--z-shell-overlay:\s*(\d+)/.exec(tokens)?.[1];
      return {
        holds: !onScale,
        evidence: onScale
          ? `.palette sits on --z-shell-overlay (${declared ?? 'undeclared'}), above the workspace's 9999`
          : '.palette is not on the shell layer scale',
      };
    },
  },
  {
    id: 'blanc-routing-not-started',
    claim: "Route Blanc's media panel to the adopted player — decided by the user 2026-07-31 and NOT STARTED.",
    recordedAs: 'expired',
    where: 'progress.json nextActions — done in slice 15, corrected by slice 36',
    check: () => {
      const blanc = read('src/renderer/components/blanc/BlancStudyPlayer.tsx') ?? '';
      const routed = blanc.includes("import('../../../media/MediaPlayerSurface')");
      return { holds: !routed, evidence: routed ? 'BlancStudyPlayer.tsx lazy-imports MediaPlayerSurface' : 'no route to the adopted surface' };
    },
  },
  {
    id: 'resultpanels-shell-handoff-open',
    claim: 'ResultPanels.tsx:235 in a scraper pop-out is the next unfixed seam of slice 14’s class.',
    recordedAs: 'expired',
    where: 'progress.json nextActions — fixed already, corrected by slice 36',
    check: () => {
      const panels = read('src/renderer/components/scraper/result/ResultPanels.tsx') ?? '';
      const gated = panels.includes('reachMediaWorkspace');
      return { holds: !gated, evidence: gated ? 'reachMediaWorkspace is applied here' : 'the seam is ungated' };
    },
  },
  {
    id: 'three-segment-switch-unseen-live',
    claim: 'The Library / Readiness / Review switch has only been seen in jsdom and the dev harness.',
    recordedAs: 'expired',
    where: 'progress.json nextActions — closed by the 2026-07-31 live pass, corrected by slice 36',
    check: () => {
      const proof = read('docs/migration/proof/phase6-live-20260731/phase6-live-pass.json');
      const passed = !!proof && JSON.parse(proof).proven?.libraryReadinessReviewSwitch?.result === 'PASS';
      return { holds: !passed, evidence: passed ? 'phase6-live-pass.json: libraryReadinessReviewSwitch PASS under real clicks' : 'no live record' };
    },
  },
  {
    // Slice 42 replaced the old `anki-unreachable` claim. Reachability flips whenever the
    // user opens or closes Anki, so a claim keyed on it reports DRIFT for a fact about
    // somebody's desktop rather than about this project. What is genuinely still open is
    // narrower, and it is not a live probe: the rollup has been exercised against a live
    // collection HEADLESSLY (slice 42, with a probe-fixture history) but never in the app
    // against the user's own mining history, which lives in renderer localStorage.
    id: 'rollup-unseen-in-the-app',
    claim: 'The per-row mining rollup has never been seen in the real UI against a real mining history.',
    recordedAs: 'expired',
    where: 'NEXT_SESSION.md slice 47; progress.json miningRollupLive20260802',
    // 2026-08-02 (slice 42 → 46): the blocker was measured rather than restated. The dev
    // server was up, the panel was reachable and Anki was answering; what was missing was
    // the HISTORY — `jp-video-core-mining-history-v1` was `[]`, because nobody had ever
    // mined a card through VideoCore on this machine. The row then concluded that only the
    // user could create one.
    //
    // EXPIRED 2026-08-02 by proof/mining-rollup-live-<stamp>/, slice 47. That conclusion did
    // not follow: driving the app's OWN mine button, on a real cue, against live Anki, is not
    // a fixture — it is the path a user's click takes, and nothing in the harness writes to
    // the store. The rollup was then read out of the real Review panel's DOM: one card,
    // `Cards 1`, the mined sentence as its term.
    //
    // What it does NOT show is a STAGE. See `interval-snapshot-stalls-the-review-panel`.
    check: () => {
      const dir = path.join(REPO, 'docs/migration/proof');
      const runs = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((name) => name.startsWith('mining-rollup-live-'))
        : [];
      const passed = runs.filter((name) => {
        try {
          const file = path.join(dir, name, 'mining-rollup-live.json');
          return JSON.parse(fs.readFileSync(file, 'utf8')).verdict === 'PASS';
        } catch { return false; }
      });
      return {
        holds: passed.length === 0,
        evidence: passed.length
          ? `seen in the real Review panel against a card the app itself mined: ${passed.join(', ')}`
          : 'no PASSing mining-rollup-live-* run — the rollup is still unseen in the app',
      };
    },
  },
  {
    id: 'interval-snapshot-stalls-the-review-panel',
    claim: 'The Review panel cannot put a STAGE on any card until `ankiGetIntervals()` returns, and on a real collection that does not happen in 90 seconds — so every mined card reads `untracked` and the panel sits at "Reading your mining history…".',
    // FIXED 2026-08-02, slice 47c, by user decision. `intervalsForNotes` + the
    // `anki:getIntervalsForNotes` channel ask about the note ids the rollup actually holds
    // instead of walking every profile's sync query, and both rollup panels use it.
    //
    // Measured on the same harness, before and after, with the main process rebuilt between:
    // never settled in 90 s -> settled in 3,196 ms; stage `untracked` -> `new`; "Not tracked
    // 1" -> "New 1". That is slice 42's own discriminator, now satisfied IN THE APP rather
    // than headlessly.
    //
    // The fix also drops the poll's word-only expression filter for this path, which was the
    // SECOND defect hiding behind the stall: `runPoll` skips any term with whitespace or over
    // 24 characters, and a mined sentence card is what the panel produces by default — so a
    // snapshot that finished would still have staged it `untracked`.
    recordedAs: 'expired',
    where: 'NEXT_SESSION.md slice 47c; src/main/anki/intervals.ts intervalsForNotes',
    // Measured 2026-08-02 in proof/mining-rollup-live-20260802slice47mine4/. The panel reads
    // history synchronously and renders cards at once, then awaits `ankiStatus` and
    // `ankiGetIntervals` (SeanimeWatchLoopPanel.tsx:107-142). Until the snapshot lands,
    // `seanimeWatchLoopCards(history, null)` stages every card `untracked` by construction.
    //
    // WHY it does not land: the default profile's `syncQuery` is `deck:*`
    // (`shared/profiles.ts:235`), and on this machine `deck:*` matches **155,377 notes**.
    // `intervals.ts` then walks them in SEQUENTIAL chunks of 500 — 311 `notesInfo` calls plus
    // at least as many `cardsInfo` calls. One measured `notesInfo(500)` is 55 ms, so notesInfo
    // alone projects to ~17 s and the pair to well past a minute before any parsing.
    //
    // The rollup itself needs intervals for the note ids IN THE MINING HISTORY — one, in that
    // run. It asks for the whole collection because that is the only snapshot API there is.
    // The fix is a narrower request, not a faster loop; it is unimplemented on purpose,
    // because it needs a new IPC surface and that is its own slice.
    check: () => {
      const dir = path.join(REPO, 'docs/migration/proof');
      const runs = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((name) => name.startsWith('mining-rollup-live-'))
        : [];
      // The claim expires the moment any run reports a settled snapshot — i.e. the panel
      // finished loading and could stage its cards.
      const settled = runs.filter((name) => {
        try {
          const file = path.join(dir, name, 'mining-rollup-live.json');
          return typeof JSON.parse(fs.readFileSync(file, 'utf8')).snapshotSettleMs === 'number';
        } catch { return false; }
      });
      const stages = runs.flatMap((name) => {
        try {
          const file = path.join(dir, name, 'mining-rollup-live.json');
          return JSON.parse(fs.readFileSync(file, 'utf8')).rollup?.stages ?? [];
        } catch { return []; }
      });
      return {
        holds: settled.length === 0,
        evidence: settled.length
          ? `a run settled its snapshot: ${settled.join(', ')} — the stall has lifted`
          : `no run has ever seen the snapshot settle; every staged card so far reads `
            + `${JSON.stringify([...new Set(stages)])} across ${runs.length} run(s)`,
      };
    },
  },
  {
    id: 'mediacontent-uncommitted',
    claim: 'MediaContent.tsx carries another track’s uncommitted insertions, so its 16 dead MediaState members must not be deleted by a session passing through (slice 33).',
    // THIS ROW IS A STANDING GUARD, NOT A TASK. Reviewed 2026-08-02 (slice 47) and left open
    // deliberately: `OPEN` here means "the reason still holds", which is the desired state.
    // Nobody should try to close it by committing that file.
    //
    // It is also not one stray file. The working tree carries ~1,050 changed paths, and
    // CURRENT_STATE.md:721 records the policy this track works under: parallel-session work
    // stays uncommitted and owned by its sessions, and this track stages only its own files —
    // once via `git hash-object` + `git update-index` precisely so the working tree was not
    // disturbed. Committing MediaContent.tsx here would adopt another session's in-flight work
    // and, as that entry notes for the sibling case, could produce a BROKEN commit rather than
    // merely a polluted one, because such work imports still-untracked modules.
    //
    // The number has not moved since slice 33 (1267/231), which is what the check reports.
    recordedAs: 'holds',
    where: 'NEXT_SESSION.md slice 33, progress.json mediaStateDeadSurfaceAnswered20260801',
    check: () => {
      const { added, removed } = uncommittedLines('src/renderer/components/media/MediaContent.tsx');
      return {
        holds: added > 0,
        evidence: `${added} insertions / ${removed} deletions against HEAD (slice 33 measured 1267/231)`,
      };
    },
  },
  {
    id: 'media-unreachable-by-vitest',
    claim: 'src/media/** is outside every vitest include glob, so a rule that lives in the component has no test (slices 24 and 35).',
    // Expired 2026-08-02, slice 43: vitest.config.ts collects src/media/**/*.test.ts, and
    // both exiled rules moved to src/media/ beside StudyPlayerSlice.tsx with their tests.
    recordedAs: 'expired',
    where: 'media/directstreamOpenRecovery.ts and media/videoCoreResumeWrite.ts header comments',
    check: () => {
      const config = read('vitest.config.ts') ?? '';
      const covered = /include:[\s\S]*?src\/media/.test(config);
      return { holds: !covered, evidence: covered ? 'vitest.config.ts now includes src/media — move the rules back' : 'no src/media glob in vitest.config.ts' };
    },
  },
  {
    id: 'open-channel-unwired',
    claim: 'shared/directstreamOpenChannel.ts is complete, tested and NOT imported by the product, so the stale-open rule changes nothing (slices 37 and 39).',
    // Expired 2026-08-02, slice 44: StudyPlayerSlice.tsx supersedes on the launch, asks the
    // channel before every stage-1 recovery, and settles on the RESPONSE rather than the
    // abort. The architecture audit's test-only-module finding for this file cleared as a
    // consequence, which is the same fact from the other side.
    recordedAs: 'expired',
    where: 'directstreamOpenChannel.ts header, NEXT_SESSION.md slices 37/39/44',
    check: () => {
      const slice = read('src/media/StudyPlayerSlice.tsx') ?? '';
      const wired = slice.includes("from '../shared/directstreamOpenChannel'");
      return {
        holds: !wired,
        evidence: wired ? 'StudyPlayerSlice.tsx imports the channel' : 'no consumer outside its own test',
      };
    },
  },
  {
    id: 'open-generation-not-in-the-build',
    claim: 'patches/seanime/0004 is absent from build-patched-sidecar.mjs, so NO sidecar this app launches can refuse a stale open — the client sends a generation nothing reads (slices 41 and 44).',
    // The sharp end of the stale-open fix. Slice 41 verified the patch against the pin and
    // slice 44 sends the field, but until 0004 joins the build list the ONLY live protection
    // is the client-side channel, and the residual hole the channel names — an open the
    // client abandons and the sidecar processes anyway — is still open. Expires the day the
    // patch is added, and that day needs a rebuilt sidecar and a run against it.
    //
    // EXPIRED 2026-08-02: 0004 is in the list and the build was proven end to end. The "rebuilt
    // sidecar" half of that sentence did NOT come with it, which is why it moved to its own row
    // (patched-sidecar-not-deployed) instead of being folded in here — one row per fact, or a
    // half-done thing reads as done.
    recordedAs: 'expired',
    where: 'NEXT_SESSION.md slice 44, directstreamOpenChannel.ts "the one hole"',
    check: () => {
      const build = read('docs/migration/tools/build-patched-sidecar.mjs') ?? '';
      const listed = build.includes('0004-directstream-open-generation.patch');
      return {
        holds: !listed,
        evidence: listed
          ? '0004 joined the patch list 2026-08-02 and the build was run end to end: '
            + '`go test ./internal/directstream` passes with the patch\'s own '
            + 'open_generation_test.go, and the compiled exe contains "stale open request: '
            + 'generation". A NEW sidecar can now refuse. Whether the one this app LAUNCHES '
            + 'can is a separate question — see patched-sidecar-not-deployed.'
          : 'the built sidecar accepts `generation` and ignores it',
      };
    },
  },
  {
    id: 'patched-sidecar-not-deployed',
    claim: 'The sidecar binary this app actually launches carries NONE of this project\'s Go patches — not 0004, and not 0002 either.',
    // Added 2026-08-02, the day 0004 joined the build list. Fixing the BUILD and shipping the
    // BUILD OUTPUT are two different things, and the gap between them is exactly the shape of
    // mistake this file exists to catch: the patch list now reads as done, while every open
    // the running app sends is still unrefusable. Deploying it means overwriting an 80 MB exe
    // in a sibling checkout outside this repo, which is the user's call, not an agent's.
    //
    // To close: stop the sidecar, run
    //   node docs/migration/tools/build-patched-sidecar.mjs <abs-path>
    // and put the result at ../seanime-upstream/seanime.exe (dev) or resources/seanime/ (packaged).
    //
    // Slice 46 removed every reason to hesitate EXCEPT the user's call. A patched binary has
    // now been built and driven: `open-generation-wire-gate.mjs` runs the same seven-step
    // sequence against it and against this very exe as the control, and only the patched one
    // refuses (proof/open-generation-wire-*). So "the deployed binary ignores generation" is
    // no longer an inference from a missing string — the control run IS that binary ignoring
    // it, measured. What is left is copying a file the user owns.
    //
    // AND IT IS BIGGER THAN 0004. Slice 46 also read the deployed binary for `0002`'s own
    // function name and did not find it. Go keeps function names in pclntab for stack traces,
    // so `-ldflags=-s -w` does not remove them: `flushTerminalSubtitleBatch` is present in a
    // patched build and ABSENT here. The deployed exe is the bare pin. That means the
    // dual-subtitle fix — Phase 3's terminal-cue-batch flush, recorded as CLOSED — is not in
    // the binary the app launches, and every live proof of it ran against a purpose-built exe
    // handed over via `SEANIME_EXE`. Nothing sets that variable in normal operation
    // (`exePath.ts` falls through to the sibling checkout), and the packaging plugin stages
    // the same resolved binary, so a package built today would ship the unpatched one too.
    //
    // EXPIRED 2026-08-02, slice 46, BY EXPLICIT USER DECISION — they were asked, because this
    // overwrites an 84 MB binary in a checkout outside this repo, and chose "deploy, keep a
    // backup". `../seanime-upstream/seanime.exe` is now the 2026-08-02 build carrying 0002 and
    // 0004; the bare pin it replaced is beside it as `seanime.exe.pre-patches-20260727`, sha256
    // 62d6af1b… , and that file is what `open-generation-wire-gate.mjs` now uses as its control.
    // Both hashes were verified after each copy. The app had to be down for it (no lock), and it
    // was. Nothing is distributed by this: GPL source-publication obligations attach on
    // distribution, and `package.json` is `private: true`.
    recordedAs: 'expired',
    where: 'main/seanime/exePath.ts DEV_SIBLING_CHECKOUT; build-patched-sidecar.mjs',
    check: () => {
      // The dev-tree resolution in exePath.ts: <repo>/../seanime-upstream/seanime.exe.
      const exe = path.resolve(REPO, '..', 'seanime-upstream', 'seanime.exe');
      if (!fs.existsSync(exe)) {
        return { holds: true, evidence: `no sidecar at ${exe} — nothing to launch, so nothing refuses` };
      }
      // One needle per patch. 0004 ships an error string; 0002 ships no new literal at all, so
      // it is probed by its own FUNCTION NAME — Go keeps those in pclntab for stack traces and
      // `-ldflags=-s -w` strips the symbol table, not that. Both are cheap and honest.
      const bytes = fs.readFileSync(exe);
      const has = (needle) => bytes.includes(Buffer.from(needle));
      const carried = [
        ['0004', 'stale open request: generation'],
        ['0002', 'flushTerminalSubtitleBatch'],
      ].map(([id, needle]) => ({ id, present: has(needle) }));
      const missing = carried.filter((entry) => !entry.present).map((entry) => entry.id);
      const built = fs.statSync(exe).mtime.toISOString().slice(0, 10);
      return {
        holds: missing.length > 0,
        evidence: missing.length === 0
          ? `the deployed sidecar (built ${built}) carries every Go patch`
          : `the deployed sidecar (built ${built}) is missing ${missing.join(' and ')}`
            + ` — ${missing.includes('0004') ? 'it accepts `generation` and ignores it' : ''}`
            + `${missing.length === 2 ? '; and the dual-subtitle terminal flush is not in it either' : ''}`,
      };
    },
  },
  {
    id: 'open-generation-only-unit-tested',
    claim: 'Patch 0004 is proven only in-process: `open_generation_test.go` builds a `Manager` and calls the rule, which cannot show that a JSON body ever reaches it (slices 41, 43).',
    // Two of the patch's three parts had never been executed — the `json:"generation"` field on
    // the handler's body struct, and the `Generation: b.Generation` it forwards. A unit test
    // that constructs the receiver by hand can never fail on either.
    //
    // EXPIRED 2026-08-02 by proof/open-generation-wire-<stamp>/, slice 46. Seven POSTs at a
    // real binary over real HTTP, then the identical seven at the DEPLOYED unpatched binary as
    // a control. Only two steps differ, and they are the two the patch is about. Read the
    // README before citing it: the refusal has NO positive observable (no log line, and the
    // HTTP answer is a byte-identical `500 {"message":"Internal Server Error"}` for both
    // outcomes), so the verdict is the DIFFERENCE between the two binaries, never an absence
    // read on its own.
    recordedAs: 'expired',
    where: 'NEXT_SESSION.md slice 46; patches/seanime/0004-directstream-open-generation.patch',
    check: () => {
      const dir = path.join(REPO, 'docs/migration/proof');
      const runs = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((name) => name.startsWith('open-generation-wire-'))
        : [];
      return {
        holds: runs.length === 0,
        evidence: runs.length
          ? `measured over HTTP: ${runs.join(', ')}`
          : 'no open-generation-wire-* run recorded — the wire path is still only argued',
      };
    },
  },
  {
    id: 'open-channel-unmeasured-live',
    claim: 'The wired open channel has never been observed against a running sidecar: every claim for it is a unit test or an argument (slice 44).',
    // The one thing slice 44 could NOT do — it had no way to drive the running app, and said
    // so rather than implying a measurement. This is the standing item, and it is mechanical
    // on purpose: record the run as docs/migration/proof/open-channel-live-<stamp>/ and this
    // claim expires by itself. What the run must show is in NEXT_SESSION.md slice 44.
    //
    // EXPIRED 2026-08-02 by proof/open-channel-live-20260802043116/. Read that README before
    // citing it — three things it does NOT show are listed there. The headline is that
    // **Blanc's first open PASSED** (readyState 4, playing, 1920x1080) against a live sidecar,
    // and the second open fired one POST with `recoveryFired: false` — rule 3 of the channel,
    // a recovery dropped rather than queued, seen in a real run. The thin margin slice 44
    // worried about held: the first POST landed at 9,696 ms against a stage-1 tick at
    // ~10,018 ms. It is ONE run of a ~300-800 ms margin, and the first open still cost 4
    // directstream POSTs and 2 `video-terminated` frames, so it is not a clean single-POST
    // open and must not be cited as one. No sidecar refused a generation — see
    // `patched-sidecar-not-deployed`.
    //
    // Two setup facts worth not re-deriving:
    //   * `cue-probe-dual.mkv` is NOT in the tree any more. The media survives inside
    //     yesterday's datadirs — `%TEMP%/gplay-dd-slice35/cue-library/Sousou no Frieren - 01.mkv`
    //     prepares a fresh one cleanly (mediaId 154587). Do not pre-create the destination;
    //     `prepare-gplay-datadir.mjs` refuses one that already exists.
    //   * An earlier run the same morning died at `no library card`
    //     (proof/blanc-open-retry-20260802012909/) and the stall did NOT recur. It was
    //     transient, nothing was changed to fix it, and the probe now classifies that failure
    //     into `noItems` / `allFiltered` / `zeroHeight` / `mediaTabNeverOpened` instead of one
    //     string — because `.media-card` comes from a *virtualised* grid, so "no card" has
    //     three unrelated causes. That classifier has never fired; it is for next time.
    recordedAs: 'expired',
    where: 'NEXT_SESSION.md slice 44 "what is still unproven"',
    check: () => {
      const dir = path.join(REPO, 'docs/migration/proof');
      const runs = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((name) => name.startsWith('open-channel-live-'))
        : [];
      return {
        holds: runs.length === 0,
        evidence: runs.length ? `measured: ${runs.join(', ')}` : 'no open-channel-live-* run recorded',
      };
    },
  },
  {
    id: 'accessibility-never-measured',
    claim: 'Accessibility is a Phase 9 hardening item and nothing has ever measured it.',
    // EXPIRED 2026-08-02, slice 47k, by proof/packaged-a11y-<stamp>/: 148 visible controls and
    // 15 form fields across nine surfaces of the packaged app, 0 unnamed, 0 unlabelled, 0
    // positive tabindex, 0 duplicate ids, document lang present.
    //
    // Read the README before citing it. It is a FLOOR, not a conformance claim — no keyboard
    // walk, no contrast, no player surfaces, and `imagesWithoutAlt` is 0-out-of-0 because this
    // app renders icons as inline <svg> and no artwork was reachable. That check is UNTESTED,
    // not passing.
    recordedAs: 'expired',
    where: 'NEXT_SESSION.md slice 47k; docs/migration/tools/packaged-a11y-gate.mjs',
    check: () => {
      const dir = path.join(REPO, 'docs/migration/proof');
      const runs = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((name) => name.startsWith('packaged-a11y-'))
        : [];
      // A clean sweep that examined nothing is not a result — slice 47k's first run returned
      // exactly that. Only a run with real coverage counts.
      const meaningful = runs.filter((name) => {
        try {
          const file = path.join(dir, name, 'packaged-a11y.json');
          const record = JSON.parse(fs.readFileSync(file, 'utf8'));
          const controls = Math.max(0, ...(record.surfaces ?? []).map((s) => s.counted?.controls ?? 0));
          const fields = Math.max(0, ...(record.surfaces ?? []).map((s) => s.counted?.fields ?? 0));
          return record.verdict === 'PASS' && controls >= 100 && fields >= 10;
        } catch { return false; }
      });
      return {
        holds: meaningful.length === 0,
        evidence: meaningful.length
          ? `measured on the packaged app with real coverage: ${meaningful.join(', ')}`
          : runs.length
            ? `a11y runs exist but none PASSED with real coverage (>=100 controls, >=10 fields): ${runs.join(', ')}`
            : 'no packaged-a11y-* run — accessibility is still unmeasured',
      };
    },
  },
  {
    id: 'offline-first-never-measured-on-the-artifact',
    claim: 'This is an offline-first study app and "offline works" has been an architectural intention throughout, never measured on the shipped artifact.',
    // EXPIRED 2026-08-02, slice 47j, by proof/packaged-offline-<stamp>/: a packaged first run
    // with DNS blackholed mounts, answers local dictionary lookups, and degrades its
    // network-dependent surface promptly (searchDiscovery: 6 results online -> 0 results
    // offline in ~1s, empty list rather than a hang or a thrown error).
    //
    // Read the README before citing it. The gate's FIRST version blocked through the
    // renderer's CDP Fetch domain and reported 0 blocked while the app returned 6 real
    // results — this app networks in the MAIN process, which a renderer CDP session cannot
    // see. The block is `--host-resolver-rules` now, applied by Chromium's stack, which
    // Electron's `net` uses too.
    recordedAs: 'expired',
    where: 'NEXT_SESSION.md slice 47j; docs/migration/tools/packaged-offline-gate.mjs',
    check: () => {
      const dir = path.join(REPO, 'docs/migration/proof');
      const runs = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((name) => name.startsWith('packaged-offline-'))
        : [];
      const passed = runs.filter((name) => {
        try {
          const file = path.join(dir, name, 'packaged-offline.json');
          return JSON.parse(fs.readFileSync(file, 'utf8')).verdict === 'PASS';
        } catch { return false; }
      });
      return {
        holds: passed.length === 0,
        evidence: passed.length
          ? `a packaged first run survives with no internet: ${passed.join(', ')}`
          : runs.length
            ? `packaged-offline runs exist but none PASSED: ${runs.join(', ')}`
            : 'no packaged-offline-* run — offline is still an intention',
      };
    },
  },
  {
    id: 'transitive-license-tree-never-audited',
    claim: 'LICENSING_PLAN.md audits 17 declared runtime dependencies and carries "`npx license-checker --production` over the transitive tree" as an unchecked box.',
    // The tree had grown to 81 declared and 623 shipped non-dev packages under an audit of 17.
    //
    // EXPIRED 2026-08-02, slice 47i, by license-audit-gate.mjs — which reads the INSTALLED
    // tree rather than a registry, because what ships is what is on disk. 0 AGPL; 2 strong
    // copyleft, one of which (`rvfc-polyfill`, GPL-3.0) was in no record at all.
    //
    // The gate itself is the standing check: it fails if a THIRD unacknowledged strong-copyleft
    // package appears, if AGPL ever lands, if the declaration or the LICENSE file drifts off
    // GPL-3.0, or if the staged sidecar carries patch markers while patches/seanime/ is empty.
    recordedAs: 'expired',
    where: 'LICENSING_PLAN.md "Transitive audit — 2026-08-02"; docs/migration/tools/license-audit-gate.mjs',
    check: () => {
      const gate = path.join(REPO, 'docs/migration/tools/license-audit-gate.mjs');
      if (!fs.existsSync(gate)) {
        return { holds: true, evidence: 'license-audit-gate.mjs is missing — the tree is unaudited again' };
      }
      const plan = read('docs/migration/LICENSING_PLAN.md') ?? '';
      const recorded = /Transitive audit — 2026-08-02/.test(plan);
      return {
        holds: !recorded,
        evidence: recorded
          ? 'the transitive tree is audited by a re-runnable gate and the result is in LICENSING_PLAN.md'
          : 'the gate exists but LICENSING_PLAN.md does not carry its result',
      };
    },
  },
  {
    id: 'packaged-csp-never-verified-in-a-packaged-build',
    claim: 'The Content-Security-Policy is attached to the `app:` origin, which only exists in a PACKAGED build, so every claim for it has been an argument about source code.',
    // PHASE_6_5_AUDIT.md §3's chained High finding is mitigated by this policy and no dev run
    // could ever exercise it — the Vite origin is deliberately untouched.
    //
    // EXPIRED 2026-08-02 by proof/packaged-csp-<stamp>/, slice 47h: the header is served on
    // app://bundle/index.html and is ENFORCED — an inline <script> is refused with
    // violatedDirective `script-src-elem` and does not run.
    //
    // Read the README before citing it. The gate's FIRST version used `eval` and reported it
    // allowed, on a build whose header is correct: `Runtime.evaluate` bypasses the page's CSP
    // by design, like the DevTools console. That would have been a fabricated finding about a
    // live security control.
    recordedAs: 'expired',
    where: 'NEXT_SESSION.md slice 47h; docs/migration/tools/packaged-csp-gate.mjs',
    check: () => {
      const dir = path.join(REPO, 'docs/migration/proof');
      const runs = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((name) => name.startsWith('packaged-csp-'))
        : [];
      const passed = runs.filter((name) => {
        try {
          const file = path.join(dir, name, 'packaged-csp.json');
          return JSON.parse(fs.readFileSync(file, 'utf8')).verdict === 'PASS';
        } catch { return false; }
      });
      return {
        holds: passed.length === 0,
        evidence: passed.length
          ? `delivered AND enforced in a packaged build: ${passed.join(', ')}`
          : runs.length
            ? `packaged-csp runs exist but none PASSED: ${runs.join(', ')}`
            : 'no packaged-csp-* run — the policy is still only an argument about source code',
      };
    },
  },
  {
    id: 'agent-allowlist-enforced-only-at-plan-time',
    claim: 'The agent profile’s per-operation allow-list is checked only in parseLocalAgentModelPlan, so a PERSISTED task keeps the authorization it was planned with after the profile is narrowed.',
    // Phase 7 requires authorization computed outside the model. It was — but once, at the
    // planning boundary. `executeAgentTaskStep` re-evaluated the permission LEVEL and never
    // the profile's `enabledOperations`, while `AgentTaskQueue` persists up to 100 tasks with
    // paused/resumed states. A task planned while a profile enabled `flashcard.delete-deck`
    // stayed runnable after the user removed that operation.
    //
    // FIXED 2026-08-02, slice 47e: `evaluateAgentToolAccess` takes the allow-list itself and
    // both boundaries call the one rule, so they cannot drift. The check verifies the guard
    // is present at the EXECUTION site specifically — a fix that only re-tightened the parser
    // would leave the persisted-task path exactly as it was.
    recordedAs: 'expired',
    where: 'NEXT_SESSION.md slice 47e; src/shared/localAgent.ts evaluateAgentToolAccess',
    check: () => {
      const agent = read('src/shared/localAgent.ts') ?? '';
      const panels = read('src/renderer/components/blanc/BlancReadyToolPanels.tsx') ?? '';
      const ruleTakesAllowList = /export function evaluateAgentToolAccess\([^)]*allowedOperations/s.test(agent);
      const executionPassesIt = /const access = evaluateAgentToolAccess\(request, options\.permission, options\.allowedOperations\)/.test(agent);
      // NARROWED 2026-08-02, slice 51. This counted `allowedOperations: activeProfile?.…`
      // in the panel and required >= 2, because 47e left the renderer with TWO execution
      // boundaries and both had to pass the allow-list. Slice 51 merged them into one
      // (`runAgentTaskStep` in localAgentQueueRun.ts), so the count legitimately fell to 1 and
      // the >= 2 proxy started reporting DRIFT against a tree that had got STRICTER. The real
      // invariant is what is asserted now: the renderer has exactly one execution boundary, it
      // passes the allow-list, and the panel supplies the profile to it.
      const queueRun = read('src/renderer/localAgentQueueRun.ts') ?? '';
      const boundaryPassesIt = /allowedOperations: options\.allowedOperations/.test(queueRun);
      const panelSuppliesProfile = (panels.match(/allowedOperations: activeProfile\?\.enabledOperations/g) ?? []).length;
      const panelCallsDirectly = /executeAgentTaskStep\(/.test(panels);
      const holds = !(ruleTakesAllowList && executionPassesIt && boundaryPassesIt
        && panelSuppliesProfile >= 1 && !panelCallsDirectly);
      return {
        holds,
        evidence: holds
          ? `the allow-list is not enforced at execution (rule takes it: ${ruleTakesAllowList},`
            + ` execution passes it: ${executionPassesIt}, the single renderer boundary passes it:`
            + ` ${boundaryPassesIt}, panel supplies the profile: ${panelSuppliesProfile},`
            + ` panel still calls executeAgentTaskStep directly: ${panelCallsDirectly})`
          : 'one rule at both boundaries, and since slice 51 ONE renderer execution boundary'
            + ` (localAgentQueueRun.runAgentTaskStep) carrying the allow-list; the panel supplies`
            + ` the profile at ${panelSuppliesProfile} call site(s) and never calls the executor itself`,
      };
    },
  },
  {
    id: 'dual-subtitle-fix-unexercised-by-the-deployed-binary',
    claim: 'Patch 0002 is in the deployed sidecar as of slice 46, but every live proof of it ran against a purpose-built exe handed over through SEANIME_EXE — which nothing sets in normal operation. The binary the product launches has never been seen to deliver a terminal subtitle batch.',
    // Phase 3 recorded terminal cue delivery as closed. Slice 46 found that the deployed exe
    // was the bare pin and carried neither 0002 nor 0004, so what "closed" rested on was a
    // binary the product never launched.
    //
    // EXPIRED 2026-08-02 by proof/subtitle-tail-<stamp>/, slice 47 — measured IN THE APP,
    // against both binaries, on identical input. The deployed build delivered cues to
    // 24,148 ms of a 30.386 s fixture; the pin it replaced stopped at 6,500 ms, with no error
    // anywhere. Three runs each, both orders, always those two numbers.
    //
    // Read the README before citing it. In particular the discriminator is
    // `subtitlesRun.maxStartTimeMs` and NOT a cue count: the patch changes one of the
    // goroutine's three exits, which of the probe's two opens reaches it moves between runs,
    // and the subject's own runs split 2/12 and 11/3 across the steps while agreeing on the
    // latest cue.
    recordedAs: 'expired',
    where: 'NEXT_SESSION.md slice 47; patches/seanime/0002-directstream-terminal-subtitle-flush.patch',
    check: () => {
      const dir = path.join(REPO, 'docs/migration/proof');
      const runs = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((name) => name.startsWith('subtitle-tail-'))
        : [];
      // A directory is not a measurement. The claim only expires on a run that PASSED, i.e.
      // one where the deployed binary delivered a strictly later cue than the control.
      const passed = runs.filter((name) => {
        try {
          const file = path.join(dir, name, 'subtitle-tail.json');
          return JSON.parse(fs.readFileSync(file, 'utf8')).verdict === 'PASS';
        } catch { return false; }
      });
      return {
        holds: passed.length === 0,
        evidence: passed.length
          ? `measured in the app against both binaries: ${passed.join(', ')}`
          : runs.length
            ? `subtitle-tail runs exist but none PASSED: ${runs.join(', ')}`
            : 'no subtitle-tail-* run recorded — 0002 is deployed but still unexercised',
      };
    },
  },
  {
    id: 'storage-migration-reencodes-localstorage',
    claim: 'runStorageMigrations re-encodes every retained localStorage key on every boot, one '
      + 'extra JSON.stringify per run, because collectSnapshot stores the RAW string from '
      + 'getItem and writeLocal stringifies whatever it is handed (slice 48, measured live).',
    // FIXED and proven in a packaged build — slice 49. writeLocal now writes a string value
    // verbatim. The differential is proof/storage-migration-20260802slice49{control,fixed}:
    // the preserved pre-fix binary still FAILs (depth 1/2/3/4), the rebuilt one PASSes (1/1/1/1).
    recordedAs: 'expired',
    where: 'NEXT_SESSION.md SLICE 49 | progress.json phase9.slice49 | proof/storage-migration-20260802slice49fixed',
    check: () => {
      const runner = read('src/renderer/storage/migrationRunner.ts');
      if (!runner) return { holds: false, evidence: 'migrationRunner.ts is gone — the layer this claim is about no longer exists' };
      // The defect is the PAIR: a snapshot of raw strings, and a writer that stringifies again.
      const rawSnapshot = /localStorageSnapshot\[key\]\s*=\s*value/.test(runner)
        && /const value = readLocal\(key\)/.test(runner);
      const doubleWrite = /localStorage\.setItem\(key,\s*JSON\.stringify\(value\)\)/.test(runner);
      return {
        holds: rawSnapshot && doubleWrite,
        evidence: rawSnapshot && doubleWrite
          ? 'collectSnapshot still stores the raw getItem string AND writeLocal still JSON.stringify()s it '
            + '— every boot adds one encoding layer to all five LS_KEYS'
          : `fixed: rawSnapshot=${rawSnapshot} doubleWrite=${doubleWrite} — re-measure with storage-migration-gate.mjs`,
      };
    },
  },
  {
    id: 'media-study-database-dropped-by-the-migration',
    claim: 'IDB_KEYS.mediaStudy is enumerated by the migration adapter but absent from '
      + "HEAVY_INDEXED_DB_KEYS, so replaceAtomic writes `undefined` over it every boot "
      + '(slice 48; the packaged 2026-08-01 build drops it in a live run).',
    // FIXED and proven in a packaged build — slice 49. Both retention lists now cover every key
    // the runner enumerates; the packaged 2026-08-02 build drops nothing, while the preserved
    // 2026-08-01 binary still writes `undefined` over media-study-database in the same gate run.
    recordedAs: 'expired',
    where: 'NEXT_SESSION.md SLICE 49 | progress.json phase9.slice49 | proof/storage-migration-20260802slice49fixed',
    check: () => {
      const storage = read('src/renderer/storage/storage.ts');
      const boundary = read('src/shared/storageMigrationBoundary.ts');
      if (!storage || !boundary) return { holds: false, evidence: 'storage.ts or storageMigrationBoundary.ts is gone' };
      const enumerated = /mediaStudy:\s*'media-study-database'/.test(storage);
      const retained = /HEAVY_INDEXED_DB_KEYS[^;]*'media-study-database'/s.test(boundary);
      return {
        holds: enumerated && !retained,
        evidence: enumerated && !retained
          ? 'media-study-database is in IDB_KEYS and NOT in HEAVY_INDEXED_DB_KEYS — dropped on every boot'
          : `enumerated=${enumerated} retained=${retained} — the gap is closed`,
      };
    },
  },
  {
    id: 'media-study-localstorage-half-never-round-tripped',
    claim: "storage-migration-gate.mjs seeds only the five LS keys slice 48 knew about, so "
      + "jp-media-study-database-v1 — the sixth, and the localStorage half of the retention gap "
      + 'slice 49 fixed — has never been seeded and read back through a real migration. That half '
      + 'rests on the retention list and on its IndexedDB twin, not on a round-trip (slice 49).',
    recordedAs: 'holds',
    where: 'NEXT_SESSION.md SLICE 49 | proof/storage-migration-20260802slice49fixed (What this does NOT show)',
    check: () => {
      const gate = read('docs/migration/tools/storage-migration-gate.mjs');
      if (!gate) return { holds: false, evidence: 'storage-migration-gate.mjs is gone — the gap this claim is about cannot be closed by it' };
      // The claim is about what the gate SEEDS, which is RETAINED_LS — not about IDB_CANDIDATES,
      // which has covered media-study-database since slice 48.
      const retainedLs = /const RETAINED_LS = \[[^\]]*\]/s.exec(gate)?.[0] ?? '';
      const seeded = retainedLs.includes('jp-media-study-database-v1');
      return {
        holds: !seeded,
        evidence: seeded
          ? 'RETAINED_LS now seeds jp-media-study-database-v1 — re-run the gate against both binaries and retire this row'
          : `RETAINED_LS still seeds ${(retainedLs.match(/'/g)?.length ?? 0) / 2} keys and not `
            + 'jp-media-study-database-v1 — the LS half of the media-study fix is unexercised at runtime',
      };
    },
  },
  {
    id: 'agent-queue-cannot-be-run',
    claim: 'A persisted AgentTaskQueue item can be listed, paused, resumed and cancelled but '
      + 'never executed: nothing sets the panel\'s `task` from a queue item, and '
      + 'nextRunnableAgentQueueItem is referenced only by its own test (slice 48).',
    // EXPIRED 2026-08-02, slice 51 — the dead end is wired. `src/renderer/localAgentQueueRun.ts`
    // exports `selectAgentQueueRun`, the panel gained a per-row Run and a "Run next queued plan",
    // and all three verbs share the one `executeAgentTaskStep` call that carries the allow-list.
    // Slice 48's framing needed one correction: the stranding was not only cross-session —
    // `plan()` cleared and overwrote `task` while enqueuing, so a second plan stranded the first
    // permanently within a single session.
    recordedAs: 'expired',
    where: 'NEXT_SESSION.md SLICE 48 | progress.json phase7.slice48 | proof/phase7-live-20260802slice48',
    check: () => {
      const panel = read('src/renderer/components/blanc/BlancReadyToolPanels.tsx');
      if (!panel) return { holds: false, evidence: 'BlancReadyToolPanels.tsx is gone' };
      // A runner would have to read a queue item and hand it to setTask.
      const feeds = /setTask\((?:[^)]*\b(?:item|queue|nextRunnable)\b)/.test(panel)
        || /nextRunnableAgentQueueItem/.test(panel);
      return {
        holds: !feeds,
        evidence: feeds
          ? 'a queue item now reaches setTask — the dead end is wired up, re-run phase7-live-gate.mjs'
          : 'no setTask call takes a queue item; the persisted queue still cannot be run, '
            + 'previewed step-by-step, confirmed or audited',
      };
    },
  },
  {
    id: 'phase7-live-blocked-on-a-model-download',
    claim: 'Phase 7 live measurement is blocked on a multi-GB local model download (recorded by '
      + 'slice 47, and false: resolveModelPath searches ~/Downloads).',
    recordedAs: 'expired',
    where: 'progress.json phase7.remaining and phase9.untouched, corrected by slice 48',
    check: () => {
      const dir = path.join(REPO, 'docs/migration/proof');
      const runs = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((name) => name.startsWith('phase7-live-'))
        : [];
      const passed = runs.filter((name) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(dir, name, 'phase7-live.json'), 'utf8')).verdict === 'PASS';
        } catch { return false; }
      });
      return {
        holds: passed.length === 0,
        evidence: passed.length
          ? `preview/confirm/cancel/audit all driven live against an already-installed model: ${passed.join(', ')}`
          : 'no phase7-live-* run PASSED — the live half is unmeasured again',
      };
    },
  },
];

async function main() {
  const rows = [];
  for (const entry of CLAIMS) {
    const result = await entry.check();
    const state = result.holds ? 'holds' : 'expired';
    rows.push({
      id: entry.id,
      claim: entry.claim,
      where: entry.where,
      recordedAs: entry.recordedAs,
      state,
      evidence: result.evidence,
      diverged: state !== entry.recordedAs,
    });
  }

  const diverged = rows.filter((row) => row.diverged);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), rows, diverged: diverged.length }, null, 1));
  } else {
    for (const row of rows) {
      const mark = row.diverged ? 'DRIFT' : row.state === 'holds' ? 'OPEN ' : 'DONE ';
      console.log(`${mark} ${row.id.padEnd(38)} ${row.evidence}`);
    }
    console.log(
      diverged.length
        ? `\nDRIFT ${diverged.length} — the RECORD is stale, not the product. Fix: ${diverged.map((row) => row.where).join(' | ')}`
        : '\nOK — every carried reason still says what the record says it says.',
    );
  }
  process.exit(diverged.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
