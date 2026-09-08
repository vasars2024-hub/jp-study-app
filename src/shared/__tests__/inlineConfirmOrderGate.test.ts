/**
 * An inline confirm that lands under the cursor — the class, given a gate.
 *
 * The shape: a two-step destructive confirm that swaps itself in *in place*.
 *
 *     {pending ? (
 *       <><button className="…danger" onClick={wipe}>Confirm</button>
 *         <button onClick={cancel}>Cancel</button></>
 *     ) : (
 *       <button onClick={() => setPending(true)}>Clear history</button>
 *     )}
 *
 * Both branches are the first child of the same row, so when the danger button
 * renders first it inherits the trigger's own rectangle. Measured live on the
 * Agent rail on 2026-09-08: "Clear history" is 119x34 at x=125 y=572, and
 * 122 ms after one click `document.elementFromPoint` at that button's own
 * centre already returned "Confirm clear" — against a Windows double-click
 * interval of 500 ms. So double-clicking a button labelled "Clear history"
 * deleted every conversation, with no undo. That is D402, a P0, and this exists
 * so it cannot come back the moment the sweep ends.
 *
 * The rule is displacement, not raw order, and that distinction is the whole
 * value of the gate. A first version asked only "is the danger button before the
 * cancel button" and named three sites that are in fact safe; every one was safe
 * for the same reason, so the hand-ruling became the rule: **anything that
 * RENDERS before the danger button pushes it out of the trigger's rectangle** —
 * a confirm question, a message paragraph. The Agent rail had nothing in front
 * of it. Those three now classify SAFE-FIRST on their own merits rather than
 * through an allowlist, which is what keeps this honest as they change.
 *
 * Not covered, so a green run is not over-read: a pair that renders somewhere
 * the trigger never was is judged only by this structural rule and not by
 * geometry, and a trigger far wider than the confirm can still overlap it. The
 * live `elementFromPoint` check remains the arbiter for a specific site.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.join(__dirname, '..', '..');

const DANGER_CLASS = /\b(?:is-)?(?:danger|destructive)\b|-danger\b|-destructive\b|Danger\b/;
const DANGER_KEY = /\b(?:confirmDelete|deleteConfirm|clearConfirm|confirmClear|confirmRemove|removeConfirm|confirmReset|resetConfirm|confirmDiscard|discardConfirm|confirmWipe)\b/;
const CANCEL_KEY = /\b(?:common\.cancel|cancel|keepIt|goBack|dismiss)\b/i;

type Verdict = 'DANGER-FIRST' | 'SAFE-FIRST' | 'NO-TRIGGER';
interface Pair { verdict: Verdict; line: number; key: string }

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) tsxFiles(full, out);
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** Top-level `<button …>…</button>` elements of a JSX chunk, in source order. */
function buttonsIn(chunk: string): Array<{ start: number; text: string }> {
  const found: Array<{ start: number; text: string }> = [];
  const open = /<button\b/g;
  let match = open.exec(chunk);
  while (match) {
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
 * True when some JSX child renders before `index`.
 *
 * A tag-closing `>` followed by `{` or by printable text is the signal. The
 * `previous !== '='` guard is load-bearing: an arrow prop on a WRAPPER element
 * (`onClick={() => setPending(null)}`) puts a `>` followed by ` setPending` in
 * front of the first button, and without the guard every wrapper carrying one
 * would read as having rendered content and every real hazard inside one would
 * be excused.
 */
function rendersContentBefore(chunk: string, index: number): boolean {
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

function balanced(text: string, from: number): number {
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

export function classifyInlineConfirms(source: string): Pair[] {
  const results: Pair[] = [];
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
        let verdict: Verdict = 'NO-TRIGGER';
        if (altMatch) {
          const closeAlternate = balanced(source, closeConsequent + 1 + altMatch[0].length - 1);
          const alternate = closeAlternate > 0
            ? source.slice(closeConsequent + 1, closeAlternate)
            : '';
          if (buttonsIn(alternate).length === 1) {
            const dangerLeads = danger[0].start < cancel[0].start
              && !rendersContentBefore(consequent, danger[0].start);
            verdict = dangerLeads ? 'DANGER-FIRST' : 'SAFE-FIRST';
          }
        }
        const label = /\bt\(\s*'([^']+)'/.exec(danger[0].text);
        results.push({
          verdict,
          line: source.slice(0, match.index).split('\n').length,
          key: label ? label[1] : '(no t() key)',
        });
      }
    }
    ternary.lastIndex = match.index + 2;
    match = ternary.exec(source);
  }
  return results;
}

const CONFIRM = "<button className=\"btn danger\" onClick={wipe}>{t('x.confirmDelete')}</button>";
const CANCEL = "<button className=\"btn\" onClick={close}>{t('common.cancel')}</button>";
const TRIGGER = "<button onClick={() => setPending(true)}>{t('x.clear')}</button>";

describe('an inline confirm never lands in the trigger it replaced', () => {
  it('names the hazard: the danger button is the first thing in the swapped-in branch', () => {
    const source = `{pending ? (\n<>${CONFIRM}\n${CANCEL}</>\n) : (\n${TRIGGER}\n)}`;
    expect(classifyInlineConfirms(source).map((p) => p.verdict)).toEqual(['DANGER-FIRST']);
  });

  it('clears a pair whose confirm question renders ahead of the danger button', () => {
    const source = `{armed ? (\n<><span>{t('x.reallyDelete')}</span>${CONFIRM}\n${CANCEL}</>\n) : (\n${TRIGGER}\n)}`;
    expect(classifyInlineConfirms(source).map((p) => p.verdict)).toEqual(['SAFE-FIRST']);
  });

  it('clears a pair that simply puts Cancel first', () => {
    const source = `{pending ? (\n<>${CANCEL}\n${CONFIRM}</>\n) : (\n${TRIGGER}\n)}`;
    expect(classifyInlineConfirms(source).map((p) => p.verdict)).toEqual(['SAFE-FIRST']);
  });

  it('is not fooled by an arrow prop on the wrapper into calling a hazard safe', () => {
    // `=>` puts a bare `>` in front of the first button. Reading that as
    // rendered content would excuse every confirm wrapped in a clickable
    // element — which is where a dialog's backdrop dismiss handler lives.
    const source = `{pending ? (\n<div onClick={() => close()}>${CONFIRM}\n${CANCEL}</div>\n) : (\n${TRIGGER}\n)}`;
    expect(classifyInlineConfirms(source).map((p) => p.verdict)).toEqual(['DANGER-FIRST']);
  });

  it('does not judge a confirm pair that replaced no single trigger', () => {
    const source = `{pending ? (\n<>${CONFIRM}\n${CANCEL}</>\n) : (\n<><button>a</button><button>b</button></>\n)}`;
    expect(classifyInlineConfirms(source).map((p) => p.verdict)).toEqual(['NO-TRIGGER']);
  });

  it('finds no destructive button sitting where its trigger was, anywhere in src', () => {
    const files = tsxFiles(SRC);
    const offenders: string[] = [];
    let pairs = 0;

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      if (!source.includes('<button')) continue;
      for (const pair of classifyInlineConfirms(source)) {
        pairs += 1;
        if (pair.verdict === 'DANGER-FIRST') {
          offenders.push(`${path.relative(SRC, file).replace(/\\/g, '/')}:${pair.line}  ${pair.key}`);
        }
      }
    }

    // A floor, so a matcher that quietly stopped finding anything cannot make
    // "no offenders" true of an empty scan. Eight pairs exist today.
    expect(files.length).toBeGreaterThan(400);
    expect(pairs).toBeGreaterThanOrEqual(5);
    expect(offenders).toEqual([]);
  });
});
