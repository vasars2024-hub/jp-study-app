#!/usr/bin/env node
/**
 * Pre-sweep class 5 — destructive actions with no guard.
 *
 * The pin's own accounting: classes 4 and 5 are 10 of 89 findings but carry 4 of the 9 P1s,
 * because a control that deletes the user's data without asking is not a cosmetic defect and
 * userData has no restore point. The other classes ask whether a control is reachable, named,
 * keyboard-operable and translated. This one asks whether it is SAFE.
 *
 * What it does: every renderer call to a destructive main-process API — the `window.api.*`
 * names that delete, remove, clear, reset, prune or wipe — is located, its enclosing function
 * blocks are extracted by brace matching, and each is asked whether a confirmation is reached
 * before the call. Three levels out, because the guard is often in the caller rather than the
 * handler that finally invokes the API.
 *
 * A guard is `confirmDialog(...)` (the app's own promise dialog), a `window.confirm`, or a
 * `dialog.showMessageBox`. `alertDialog` is NOT a guard — it tells you afterwards.
 *
 * Reading the output: `UNGUARDED` is a LEAD, not a verdict. Three legitimate shapes produce it
 * and each is listed by name in `ACCEPTED` below rather than being silently dropped, because a
 * false "this deletes without asking" is worse than not filing it:
 *   - the call is the *effect* of a confirmation that happened at another layer (a store
 *     subscriber, an undo-window commit, a main-process handler that confirms for itself);
 *   - the removal is trivially reversible in place (removing a source you can re-add);
 *   - the API is destructive only in name (`assetsRemove` on a draft the user is building).
 *
 * Usage:
 *   node src/.coordination/presweep/destructive-guard-scan.cjs            # ranked summary
 *   node src/.coordination/presweep/destructive-guard-scan.cjs --all      # every call site
 *   node src/.coordination/presweep/destructive-guard-scan.cjs --api ytRemovePlaylist
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.resolve(__dirname, '..', '..');

/**
 * The destructive half of the preload surface, derived rather than hand-listed: every
 * `window.api.*` name the renderer calls whose verb destroys something. Kept explicit so a
 * new one has to be classified deliberately.
 */
const DESTRUCTIVE = new Set([
  'ankiDeleteNotes', 'ankiDraftSessionDelete', 'assetsRemove', 'clearCredential',
  'clearMediaLibrary', 'clearMediaWatchFolder', 'clearWallpaper', 'clearWatchFolder',
  'desktopResetAssignments', 'dictExplanationClear', 'dictRemoveSource', 'dictRemoveYomitan',
  'dictResetPairPriority', 'filesCleanupRun', 'immersionRemoveSite', 'jitenRemovePlan',
  'lensHistoryClear', 'lensHistoryRemove', 'profileDelete', 'pruneMedia', 'removeItem',
  'removeMedia', 'resetChineseDictCache', 'toolsRemove', 'toolsRemoveFolder',
  'visualNovelRemove', 'visualNovelRemoveCapture', 'visualNovelRemoveCaptureAudio',
  'ytDeleteFolder', 'ytRemoveFromPlanToWatch', 'ytRemovePlaylist',
]);

const GUARDS = [/\bconfirmDialog\s*\(/, /\bwindow\.confirm\s*\(/, /\bshowMessageBox\s*\(/];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(ent.name) && !/\.d\.ts$/.test(ent.name)) {
      out.push(full);
    }
  }
  return out;
}

/** The innermost N enclosing brace blocks around `index`, outermost last. */
function enclosingBlocks(text, index, levels = 3) {
  const blocks = [];
  let from = index;
  for (let level = 0; level < levels; level++) {
    let depth = 0;
    let open = -1;
    for (let i = from - 1; i >= 0; i--) {
      const ch = text[i];
      if (ch === '}') depth++;
      else if (ch === '{') {
        if (depth === 0) { open = i; break; }
        depth--;
      }
    }
    if (open < 0) break;
    // Forward to the matching close, so a guard AFTER the call still counts as same-block.
    let close = text.length;
    let d = 0;
    for (let i = open; i < text.length; i++) {
      if (text[i] === '{') d++;
      else if (text[i] === '}') { d--; if (d === 0) { close = i; break; } }
    }
    blocks.push(text.slice(open, close + 1));
    from = open;
  }
  return blocks;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

const args = process.argv.slice(2);
const showAll = args.includes('--all');
const onlyApi = args.includes('--api') ? args[args.indexOf('--api') + 1] : null;

const files = [
  ...walk(path.join(SRC, 'renderer')),
  ...walk(path.join(SRC, 'media')),
].filter((f) => !/__tests__|__devharness__/.test(f));

/**
 * One level of indirection, and it is not optional: `MediaLibraryActions.tsx` wraps
 * `window.api.clearMediaLibrary()` in a two-line module helper whose caller confirms with
 * `danger: true`. Brace-walking out of the helper lands at module scope, so without this the
 * scanner reports the app's best-guarded delete as unguarded. If the call's enclosing block
 * is a named function, ask whether every call site of that name in the same file is guarded.
 */
function guardedThroughHelper(text, blockStart) {
  const header = text.slice(Math.max(0, blockStart - 220), blockStart);
  const name = /(?:function|const|let)\s+([A-Za-z0-9_$]+)\s*(?:=|\()[^=]*$/.exec(header)?.[1];
  if (!name) return null;
  const callers = [];
  const re = new RegExp(`(?<![.\\w])${name}\\s*\\(`, 'g');
  let m;
  while ((m = re.exec(text))) {
    if (m.index >= blockStart - 220 && m.index <= blockStart) continue; // its own declaration
    callers.push(m.index);
  }
  if (callers.length === 0) return null;
  const allGuarded = callers.every((i) =>
    enclosingBlocks(text, i).some((b) => GUARDS.some((g) => g.test(b))));
  return { name, callers: callers.length, allGuarded };
}

const hits = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const re = /window\.api\.([A-Za-z0-9_]+)\s*\(/g;
  let m;
  while ((m = re.exec(text))) {
    const api = m[1];
    if (!DESTRUCTIVE.has(api)) continue;
    if (onlyApi && api !== onlyApi) continue;
    const blocks = enclosingBlocks(text, m.index);
    let guardedAt = blocks.findIndex((b) => GUARDS.some((g) => g.test(b)));
    let via = null;
    if (guardedAt < 0 && blocks.length > 0) {
      const helper = guardedThroughHelper(text, text.lastIndexOf(blocks[0], m.index));
      if (helper?.allGuarded) { guardedAt = 0; via = `${helper.name}() x${helper.callers}`; }
    }
    hits.push({
      file: path.relative(SRC, file).replace(/\\/g, '/'),
      line: lineOf(text, m.index),
      api,
      guarded: guardedAt >= 0,
      level: guardedAt,
      via,
    });
  }
}

const unguarded = hits.filter((h) => !h.guarded);
const guarded = hits.filter((h) => h.guarded);

console.log(`destructive call sites: ${hits.length}  guarded: ${guarded.length}  UNGUARDED: ${unguarded.length}`);
console.log(`(${new Set(hits.map((h) => h.api)).size} distinct APIs across ${new Set(hits.map((h) => h.file)).size} files)\n`);

const byApi = new Map();
for (const h of unguarded) {
  if (!byApi.has(h.api)) byApi.set(h.api, []);
  byApi.get(h.api).push(h);
}
console.log('UNGUARDED — a lead, not a verdict. Confirm each before filing:');
for (const [api, list] of [...byApi].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${api}`);
  for (const h of list) console.log(`      ${h.file}:${h.line}`);
}

if (showAll) {
  console.log('\nGUARDED:');
  for (const h of guarded) console.log(`  ${h.api.padEnd(30)} ${h.file}:${h.line}  (guard ${h.level} block(s) out${h.via ? `, via ${h.via}` : ''})`);
}
