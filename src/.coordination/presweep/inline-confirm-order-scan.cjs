#!/usr/bin/env node
/**
 * Pre-sweep class 5, second mechanical shape — an inline confirm that puts the
 * destructive button where the trigger was.
 *
 * The existing `destructive-guard-scan.cjs` asks whether a destructive call is
 * guarded at all. It says nothing about WHERE the guard renders, and that turned
 * out to be the more dangerous half. The common shape in this app is a two-step
 * confirm that swaps itself in in place:
 *
 *     {pendingClear ? (
 *       <><button className="...danger" onClick={wipe}>Confirm</button>
 *         <button onClick={cancel}>Cancel</button></>
 *     ) : (
 *       <button onClick={() => setConfirming(...)}>Clear history</button>
 *     )}
 *
 * When the danger button renders FIRST it inherits the trigger's own rectangle,
 * because both are the first child of the same flex row. Measured live on the
 * Agent rail on 2026-09-08: "Clear history" is 119x34 at x=125 y=572, and 122 ms
 * after one click `document.elementFromPoint` at that button's own centre already
 * returns "Confirm clear". Windows' double-click interval is 500 ms. So an
 * ordinary double-click on a button labelled "Clear history" deleted every
 * conversation, with no undo. That is D402.
 *
 * The fix is ordering: Cancel first, so the accidental second click is harmless.
 * This scan finds every other place with the same shape.
 *
 * What it reports:
 *   DANGER-FIRST  the consequent's first button is the destructive one, and the
 *                 alternate is a single trigger button -> the hazard shape.
 *   SAFE-FIRST    same shape, but a non-destructive button renders first.
 *   NO-TRIGGER    a confirm pair with no single-button alternate. Not this
 *                 hazard (nothing was under the cursor), listed so the count of
 *                 what was examined is honest.
 *
 * The displacement rule, which is what makes DANGER-FIRST mean something. A
 * first pass asked only "is the danger button before the cancel button", and
 * that reported three sites that are in fact safe. Each was safe for the same
 * reason, so the hand-ruling became the rule: **anything that RENDERS before the
 * danger button pushes it out of the trigger's rectangle.** A confirm question
 * (`AutoAudioPreferences`, `TranscriptionCardOptions`) or a message paragraph
 * (`FilesDeletionControls`, inside its `role="alertdialog"`) is enough. The
 * Agent rail had nothing: the danger button was the first thing in the fragment.
 * So a pair is DANGER-FIRST only when the destructive button comes before the
 * cancel AND nothing is rendered ahead of it.
 *
 * Still a LEAD, not a verdict: the pair may render somewhere the trigger never
 * was, and the trigger may be far wider or narrower than the confirm so the
 * rects do not actually overlap. Confirm with `elementFromPoint` at the
 * trigger's own centre before filing.
 *
 * Usage:
 *   node src/.coordination/presweep/inline-confirm-order-scan.cjs
 *   node src/.coordination/presweep/inline-confirm-order-scan.cjs --all
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.resolve(__dirname, '..', '..');

/**
 * A button counts as destructive when its class marks it as such, or its label
 * key reads as a confirmation of a destructive act. Class alone is not enough —
 * several surfaces style the confirm with a plain class and carry the meaning in
 * the key — and the key alone is not enough either, because `deleteConfirm` also
 * names the *trigger* on surfaces that confirm in a dialog.
 */
const DANGER_CLASS = /\b(?:is-)?(?:danger|destructive)\b|-danger\b|-destructive\b|Danger\b/;
const DANGER_KEY = /\b(?:confirmDelete|deleteConfirm|clearConfirm|confirmClear|confirmRemove|removeConfirm|confirmReset|resetConfirm|confirmDiscard|discardConfirm|confirmWipe)\b/;
const CANCEL_KEY = /\b(?:common\.cancel|cancel|keepIt|goBack|dismiss)\b/i;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** Splits a JSX chunk into its top-level `<button ...>...</button>` elements. */
function buttonsIn(chunk) {
  const found = [];
  const open = /<button\b/g;
  let match = open.exec(chunk);
  while (match) {
    // Find the matching close by counting nested <button> opens.
    let depth = 1;
    let i = match.index + match[0].length;
    while (i < chunk.length && depth > 0) {
      if (chunk.startsWith('<button', i)) { depth += 1; i += 7; continue; }
      if (chunk.startsWith('</button>', i)) { depth -= 1; i += 9; continue; }
      if (chunk.startsWith('/>', i) && depth === 1) { depth = 0; i += 2; continue; }
      i += 1;
    }
    found.push({ start: match.index, text: chunk.slice(match.index, i) });
    open.lastIndex = i;
    match = open.exec(chunk);
  }
  return found;
}

/**
 * True when some JSX child renders before `index` — a text literal or an
 * expression child, which is what displaces the button after it.
 *
 * A tag-closing `>` followed by `{` or by printable text is the signal. The
 * `previous !== '='` guard is load-bearing: `onClick={() => setPending(null)}`
 * on a WRAPPER element puts a `>` followed by ` setPending` in front of the
 * first button, and without the guard every wrapper with an arrow prop reads as
 * having content.
 */
function rendersContentBefore(chunk, index) {
  const head = chunk.slice(0, index);
  for (let i = 0; i < head.length; i += 1) {
    if (head[i] !== '>' || head[i - 1] === '=') continue;
    let j = i + 1;
    while (j < head.length && /\s/.test(head[j])) j += 1;
    if (j >= head.length) return false;
    if (head[j] !== '<') return true;
  }
  return false;
}

/**
 * Walks forward from `? (` matching parens, so a ternary containing its own
 * nested ternaries and calls is still cut at the right place.
 */
function balanced(text, from) {
  let depth = 0;
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function classify(source) {
  const results = [];
  const ternary = /\?\s*\(/g;
  let match = ternary.exec(source);
  while (match) {
    const closeConsequent = balanced(source, match.index + match[0].length - 1);
    if (closeConsequent > 0) {
      const consequent = source.slice(match.index, closeConsequent);
      const after = source.slice(closeConsequent + 1, closeConsequent + 400);
      const altMatch = /^\s*:\s*\(/.exec(after);
      const buttons = buttonsIn(consequent);
      const danger = buttons.filter((b) => DANGER_CLASS.test(b.text) || DANGER_KEY.test(b.text));
      const cancel = buttons.filter((b) => CANCEL_KEY.test(b.text) && !DANGER_CLASS.test(b.text));

      if (danger.length > 0 && cancel.length > 0) {
        let verdict = 'NO-TRIGGER';
        if (altMatch) {
          const closeAlternate = balanced(source, closeConsequent + 1 + altMatch[0].length - 1);
          const alternate = closeAlternate > 0
            ? source.slice(closeConsequent + 1, closeAlternate)
            : '';
          const altButtons = buttonsIn(alternate);
          if (altButtons.length === 1) {
            const dangerLeads = danger[0].start < cancel[0].start
              && !rendersContentBefore(consequent, danger[0].start);
            verdict = dangerLeads ? 'DANGER-FIRST' : 'SAFE-FIRST';
          }
        }
        const line = source.slice(0, match.index).split('\n').length;
        const label = /\bt\(\s*'([^']+)'/.exec(danger[0].text);
        results.push({ verdict, line, key: label ? label[1] : '(no t() key)' });
      }
    }
    ternary.lastIndex = match.index + 2;
    match = ternary.exec(source);
  }
  return results;
}

const showAll = process.argv.includes('--all');
const files = walk(SRC, []);
const tally = { 'DANGER-FIRST': 0, 'SAFE-FIRST': 0, 'NO-TRIGGER': 0 };
const rows = [];

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  if (!/<button\b/.test(source)) continue;
  for (const result of classify(source)) {
    tally[result.verdict] += 1;
    if (result.verdict === 'DANGER-FIRST' || showAll) {
      rows.push(`  ${result.verdict.padEnd(13)} ${path.relative(SRC, file).replace(/\\/g, '/')}:${result.line}  ${result.key}`);
    }
  }
}

console.log(rows.join('\n') || '  (no inline confirm puts the destructive button first)');
console.log(`\n${files.length} .tsx scanned. Inline confirm pairs: `
  + `${tally['DANGER-FIRST']} DANGER-FIRST, ${tally['SAFE-FIRST']} SAFE-FIRST, `
  + `${tally['NO-TRIGGER']} with no single-button trigger.`);
console.log('DANGER-FIRST is a LEAD. Confirm with elementFromPoint at the trigger\'s own centre before filing.');
