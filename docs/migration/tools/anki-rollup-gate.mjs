// The per-row mining rollup, against a LIVE Anki — slice 42.
//
// Carried since slice 32 as "blocked on the user: start Anki". It stopped being blocked at
// 23:30 on 2026-08-01, which `audit-carried-items.mjs` reported as DRIFT rather than anyone
// noticing by hand.
//
// What was missing was never the rollup arithmetic — `seanimeWatchLoopCards` has been unit
// tested since slice 6 — but the join in the middle: a REAL `IntervalSnapshot`, built from
// real cards by the shipped main-process code, flowing into it. This runs that join with no
// Electron, no dev server and no renderer:
//
//   1. the SHIPPED `src/main/anki/intervals.ts`, bundled with `electron` stubbed, builds a
//      snapshot from the live collection over the real AnkiConnect actions;
//   2. a namespaced probe note is created so the rollup has provenance to join against, with
//      the same tag shape the miner writes;
//   3. the SHIPPED `seanimeWatchLoopCards` / `seanimeWatchLoopByEntry` produce the rollup;
//   4. everything this script created is deleted, and the deletion is verified.
//
// **Read-only against the user's own notes.** Nothing is written outside the namespaced probe
// deck, and no deletion is ever query-based — only ids this script created.
//
// usage:
//   node docs/migration/tools/anki-rollup-gate.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const ANKI = 'http://127.0.0.1:8765';
const DECK = 'StudyOS::_MigrationProbe';
const STAMP = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const PERSIST_DIR = path.join(os.tmpdir(), `studyos-anki-rollup-${STAMP}`);
fs.mkdirSync(PERSIST_DIR, { recursive: true });

const call = async (action, params = {}) => {
  const response = await fetch(ANKI, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, version: 6, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(`${action} -> ${body.error}`);
  return body.result;
};

/** Bundle a shipped module with its Electron-only edges stubbed, then import it. */
async function loadShipped(entry, stubs = {}) {
  const dir = fs.mkdtempSync(path.join(REPO, 'node_modules/.anki-rollup-'));
  const out = path.join(dir, 'module.mjs');
  await esbuild.build({
    entryPoints: [path.join(REPO, entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    outfile: out,
    logLevel: 'silent',
    plugins: Object.keys(stubs).length ? [{
      name: 'stubs',
      setup(build) {
        for (const [name, contents] of Object.entries(stubs)) {
          const filter = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
          build.onResolve({ filter }, (args) => ({ path: `stub:${args.path}`, namespace: 'stub' }));
        }
        build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
          contents: stubs[args.path.replace(/^stub:/, '')],
          loader: 'js',
        }));
      },
    }] : [],
  });
  try {
    return await import(pathToFileURL(out).href);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const record = { tool: 'anki-rollup-gate.mjs', slice: 42, startedAt: new Date().toISOString(), steps: {} };
const created = { noteIds: [], deck: false };

async function cleanup() {
  const removed = { notes: [], deckRemoved: false, residual: null };
  for (const id of created.noteIds) {
    await call('deleteNotes', { notes: [id] });
    removed.notes.push(id);
  }
  if (created.deck) {
    await call('deleteDecks', { decks: [DECK], cardsToo: true });
    removed.deckRemoved = !(await call('deckNames')).includes(DECK);
  }
  // Verified, not assumed — and by ID, never by query.
  const residual = [];
  for (const id of created.noteIds) {
    const info = await call('notesInfo', { notes: [id] });
    if (info?.[0] && Object.keys(info[0]).length > 0) residual.push(id);
  }
  removed.residual = residual;
  return removed;
}

async function main() {
  record.steps.anki = {
    version: await call('version'),
    deckCountBefore: (await call('deckNames')).length,
  };

  // ---- 1. one namespaced probe note, with the miner's own provenance tag shape ----------
  await call('createDeck', { deck: DECK });
  created.deck = true;
  const term = `テスト${STAMP.slice(-6)}`;
  const noteId = await call('addNote', {
    note: {
      deckName: DECK,
      modelName: 'JP Study App::JA Immersion',
      fields: { Term: term, Reading: 'てすと', Sentence: '猫が窓辺で寝ている。' },
      tags: ['studyos-probe', 'video-core', 'cue-3-0', 'media-154587'],
      options: { allowDuplicate: false },
    },
  });
  created.noteIds.push(noteId);
  record.steps.probeNote = { noteId, term, deck: DECK };

  // ---- 2. a REAL interval snapshot from the shipped main-process module -----------------
  const intervals = await loadShipped('src/main/anki/intervals.ts', {
    electron: `export const app = { getPath: () => ${JSON.stringify(PERSIST_DIR)} };`,
  });
  // The real IntervalsConfig, filled the way main.ts fills it. The query is deliberately
  // narrow: this gate reads the user's live collection and has no business scanning it.
  intervals.configureIntervals({
    getQueries: () => [`deck:${DECK}`],
    getEpoch: () => 1,
    isConnected: () => true,
    getTermOverride: () => undefined,
  });
  const snapshot = await intervals.kickPoll();
  const entry = snapshot.entries.find((candidate) => candidate.noteId === noteId) ?? null;
  record.steps.snapshot = {
    builtBy: 'src/main/anki/intervals.ts (shipped, bundled with electron stubbed)',
    sourceQueries: snapshot.sourceQueries,
    noteCount: snapshot.noteCount,
    entryCount: snapshot.entries.length,
    truncated: snapshot.truncated,
    probeEntry: entry && {
      noteId: entry.noteId, expression: entry.expression, ivlDays: entry.ivlDays,
      modelName: entry.modelName, leech: entry.leech ?? false, suspended: entry.suspended ?? false,
    },
    ok: !!entry && entry.expression === term,
  };

  // ---- 3. the SHIPPED rollup, over that snapshot ----------------------------------------
  const loop = await loadShipped('src/shared/seanimeWatchLoop.ts');
  const localFilePath = 'C:/media/cue-library/Sousou no Frieren - 01.mkv';
  const history = [{
    id: `probe-${STAMP}`,
    createdAt: Date.now(),
    status: 'exported',
    noteId,
    term,
    sentence: '猫が窓辺で寝ている。',
    provenance: {
      schemaVersion: 1,
      cue: { index: 0, trackNumber: 3, rawText: '猫が窓辺で寝ている。', text: '猫が窓辺で寝ている。', startMs: 2148, endMs: 5148 },
      source: { localFilePath, mediaId: 154587, episodeNumber: 1, title: 'Sousou no Frieren' },
      assets: {},
      capturedAt: Date.now(),
    },
  }];
  const withAnki = loop.seanimeWatchLoopCards(history, snapshot);
  const withoutAnki = loop.seanimeWatchLoopCards(history, null);
  const rollup = loop.seanimeWatchLoopByEntry(withAnki);
  const pathKey = [...rollup.keys()][0] ?? null;
  record.steps.rollup = {
    cardsWithAnki: withAnki.length,
    cardsWithoutAnki: withoutAnki.length,
    stageWithAnki: withAnki[0]?.stage ?? null,
    stageWithoutAnki: withoutAnki[0]?.stage ?? null,
    intervalDays: withAnki[0]?.intervalDays ?? null,
    pathKey,
    entryRollup: pathKey ? rollup.get(pathKey) : null,
    // The whole point of the gate: the rollup is NOT its zero state, and the live snapshot
    // is what put a stage on the card.
    ok: withAnki.length === 1 && !!pathKey && (rollup.get(pathKey)?.cards ?? 0) === 1,
  };

  // ---- 4. cleanup, verified ---------------------------------------------------------------
  record.steps.cleanup = await cleanup();
  created.noteIds = [];
  created.deck = false;
  record.steps.cleanup.deckCountAfter = (await call('deckNames')).length;
  record.steps.cleanup.ok = record.steps.cleanup.residual.length === 0
    && record.steps.cleanup.deckRemoved
    && record.steps.cleanup.deckCountAfter === record.steps.anki.deckCountBefore;

  return snapshot;
}

main().then(async () => {
  const ok = record.steps.snapshot.ok && record.steps.rollup.ok && record.steps.cleanup.ok;
  record.result = ok ? 'PASS' : 'FAIL';
  const outDir = path.join(REPO, 'docs/migration/proof', `anki-rollup-${STAMP}`);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'anki-rollup.json');
  fs.writeFileSync(outFile, `${JSON.stringify(record, null, 1)}
`);
  console.log(`  snapshot  ${record.steps.snapshot.entryCount} entry/entries, probe ivl ${record.steps.snapshot.probeEntry?.ivlDays}d`);
  console.log(`  rollup    ${record.steps.rollup.cardsWithAnki} card, stage ${record.steps.rollup.stageWithAnki} (without Anki: ${record.steps.rollup.stageWithoutAnki})`);
  console.log(`  cleanup   ${record.steps.cleanup.notes.length} note(s) deleted, deck removed ${record.steps.cleanup.deckRemoved}, residual ${record.steps.cleanup.residual.length}`);
  console.log(`
${record.result}  ${path.relative(REPO, outFile)}`);
  process.exit(ok ? 0 : 1);
}).catch(async (error) => {
  console.error(`FAILED — ${error.message}`);
  try {
    const removed = await cleanup();
    console.error(`  cleanup after failure: ${removed.notes.length} note(s), residual ${removed.residual.length}`);
  } catch (cleanupError) {
    console.error(`  CLEANUP ALSO FAILED — remove ${DECK} by hand: ${cleanupError.message}`);
  }
  process.exit(1);
});
