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

/**
 * Blank every comment, keeping the file's length so every offset and line number
 * still lines up.
 *
 * Added 2026-09-07 after this scanner reported a phantom call site at
 * `immersionSiteActions.ts:4` — a doc comment that NAMES the call it repairs.
 * The register's class-5 row had been describing the scanner as masking comments
 * and strings; it never did, and the error runs in both directions. A comment
 * mentioning `confirmDialog(` would have made a genuinely unguarded call read as
 * guarded, which is a false clean bill rather than a false alarm.
 *
 * Comments only, deliberately. String bodies are left alone: masking them would
 * blank ordinary code for no measured benefit, and no false hit has ever come
 * from one. The register is corrected to say that rather than the reverse.
 */
function withoutComments(text) {
  const out = text.split('');
  let mode = 'code';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (mode === 'code') {
      if (ch === '/' && next === '/') { mode = 'line'; out[i] = ' '; }
      else if (ch === '/' && next === '*') { mode = 'block'; out[i] = ' '; }
      else if (ch === '"' || ch === "'" || ch === '`') mode = ch;
    } else if (mode === 'line') {
      if (ch === '\n') mode = 'code';
      else out[i] = ' ';
    } else if (mode === 'block') {
      if (ch === '*' && next === '/') { out[i] = ' '; out[i + 1] = ' '; i++; mode = 'code'; }
      else if (ch !== '\n') out[i] = ' ';
    } else if (ch === '\\') i++;
    else if (ch === mode) mode = 'code';
  }
  return out.join('');
}

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

/**
 * The THIRD guard shape, and the scanner was blind to it: a two-step arm. The first click only
 * sets a state flag and returns, the button re-labels itself to say what the next click will do,
 * and the second click destroys. No `confirmDialog` ever appears, so this file scored
 * `visualNovelRemoveCapture` — which has asked twice since it was written — as a bare call, and it
 * sat on the lead list across several turns until a worker read it and struck it by hand.
 *
 * Deliberately narrow, because a false NEGATIVE here hides a real defect. All three must hold:
 *   1. an early return of exactly the arm shape — `if (!flag) { setFlag(true); return; }` —
 *      positioned BEFORE the destructive call inside the same block;
 *   2. `flag` is real `useState` state, not any local boolean;
 *   3. `flag` drives a render branch (`flag ?`), so the label actually changes on the first
 *      click. Without that the click is swallowed with no visible reason, which is a broken
 *      button rather than a guard — and the scanner should keep reporting it.
 *
 * And it is asked at the INNERMOST block ONLY, unlike the `confirmDialog` walk. The negative
 * control caught the reason: with a three-level walk, `removeAudio` came back guarded even with
 * its own arm's render branch deleted, because `remove()` — a different handler, forty lines up
 * in the same component — has an arm of its own, and the component body is a shared enclosing
 * block. One armed button would have absolved every destructive call in its component. An arm
 * is a local early return by construction, so demanding it in the same function costs nothing.
 */
function armedThroughTwoStep(text, block, callAt) {
  const arm = /if\s*\(\s*!\s*([A-Za-z0-9_$]+)\s*\)\s*\{[^{}]*\bset[A-Za-z0-9_$]*\(\s*true\s*\)[^{}]*\breturn\b[^{}]*\}/g;
  let m;
  while ((m = arm.exec(block))) {
    if (m.index >= callAt) continue;
    const flag = m[1];
    const declared = new RegExp(`\\[\\s*${flag}\\s*,[^\\]]*\\]\\s*=\\s*useState`).test(text);
    const rendered = new RegExp(`[{\\s(]${flag}\\s*\\?`).test(text);
    if (declared && rendered) return flag;
  }
  return null;
}

/**
 * The FOURTH shape: the confirm lives in another module. `guardedThroughHelper` above only
 * follows indirection WITHIN a file, so once D142 and D143 moved their dialogs into shared
 * `confirm*` helpers — which is the right fix, since it is the only thing that stops a guard
 * drifting between two hosts — this scanner started reporting the app's newest guards as bare
 * calls. Four false leads, all of them created by correct repairs.
 *
 * The convention both fixes landed on is `if (!await confirmSomething(...)) return;`, so that is
 * what is matched, and the name alone is not trusted: the module it is imported from must
 * actually reach `confirmDialog`/`window.confirm`. A helper that merely sounds like a confirm
 * does not count.
 */
function guardedThroughConfirmModule(file, text, block, callAt) {
  const re = /if\s*\(\s*!\s*await\s+(confirm[A-Za-z0-9_$]*)\s*\(/g;
  let m;
  while ((m = re.exec(block))) {
    if (m.index >= callAt) continue;
    const name = m[1];
    const from = new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`).exec(text)?.[1];
    // Defined in this same file and reaching a real dialog: already a guard.
    if (!from) {
      if (GUARDS.some((g) => g.test(text))) return `${name}() (same file)`;
      continue;
    }
    const base = path.resolve(path.dirname(file), from);
    const target = ['.ts', '.tsx', '/index.ts', '/index.tsx', '']
      .map((ext) => `${base}${ext}`)
      .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!target) continue;
    if (GUARDS.some((g) => g.test(fs.readFileSync(target, 'utf8')))) {
      return `${name}() in ${path.relative(SRC, target).replace(/\\/g, '/')}`;
    }
  }
  return null;
}

const hits = [];
for (const file of files) {
  // Offsets are preserved by the masker, so every line number below is still the
  // real one in the real file.
  const text = withoutComments(fs.readFileSync(file, 'utf8'));
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
    if (guardedAt < 0 && blocks.length > 0) {
      // Innermost block only — see `armedThroughTwoStep`'s note on the control.
      const start = text.lastIndexOf(blocks[0], m.index);
      const flag = armedThroughTwoStep(text, blocks[0], m.index - start);
      if (flag) { guardedAt = 0; via = `two-step arm (${flag})`; }
    }
    for (let level = 0; guardedAt < 0 && level < blocks.length; level++) {
      const start = text.lastIndexOf(blocks[level], m.index);
      const delegated = guardedThroughConfirmModule(file, text, blocks[level], m.index - start);
      if (delegated) { guardedAt = level; via = delegated; }
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
