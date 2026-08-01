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
    recordedAs: 'holds',
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
    recordedAs: 'holds',
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
    claim: 'The per-row mining rollup has never been seen in the real UI against the user’s own mining history.',
    recordedAs: 'holds',
    where: 'NEXT_SESSION.md slice 42; progress.json ankiRollupGate20260801',
    check: () => {
      const proof = fs.existsSync(path.join(REPO, 'docs/migration/proof/anki-rollup-20260801203428/anki-rollup.json'));
      return {
        holds: true,
        evidence: proof
          ? 'headless gate PASSES against live Anki; the in-app run still needs the dev server and real history'
          : 'the headless gate record is missing — re-run anki-rollup-gate.mjs',
      };
    },
  },
  {
    id: 'mediacontent-uncommitted',
    claim: 'MediaContent.tsx carries another track’s uncommitted insertions, so its 16 dead MediaState members must not be deleted by a session passing through (slice 33).',
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
    recordedAs: 'holds',
    where: 'shared/directstreamOpenRecovery.ts and shared/videoCoreResumeWrite.ts header comments',
    check: () => {
      const config = read('vitest.config.ts') ?? '';
      const covered = /include:[\s\S]*?src\/media/.test(config);
      return { holds: !covered, evidence: covered ? 'vitest.config.ts now includes src/media — move the rules back' : 'no src/media glob in vitest.config.ts' };
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
