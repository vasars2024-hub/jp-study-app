/**
 * D333, measured live 2026-09-08 (pid 4652, window 2). Game Arena ▸ Kana Sprint
 * ▸ Round options: the six buttons moved `class="btn small primary"` between
 * them on a real click, and every one of them reported
 * `aria-pressed=null aria-current=null aria-selected=null aria-checked=null`
 * both before and after — the selection existed in colour and nowhere else.
 *
 * It was not one surface. The same idiom ran to **55 `className={seg(active)}`
 * call sites over 14 files plus 13 inline copies of the ternary**. D6 had swept
 * this class already and missed all of them, because D6 searched for the
 * `active` class and these mark state with `primary`.
 *
 * So the guard is a source ratchet, not a render test: the failure mode is
 * someone writing a 69th copy, and no per-surface test would see that.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { segButton } from '../../renderer/components/ui/segButton';

const ROOT = join(__dirname, '..', '..', 'renderer');

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** The JSX element a match sits inside: back to `<button`, forward to its `>`. */
function enclosingTag(source: string, at: number): string | null {
  const open = source.lastIndexOf('<button', at);
  if (open < 0) return null;
  const close = source.indexOf('>', at);
  if (close < 0) return null;
  return source.slice(open, close + 1);
}

/**
 * The same idea, but brace-aware.
 *
 * `enclosingTag` stops at the first `>` after the match, which is the arrow of
 * the next `onClick={() =>`. That is fine when the attribute under test is
 * written before the handler and wrong the moment someone writes it after — the
 * scan would then report a button that is perfectly correct. Depth-tracking
 * takes the tag's real closing `>`, so attribute ORDER stops mattering.
 */
function wholeButtonTag(source: string, at: number): string | null {
  const open = source.lastIndexOf('<button', at);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return source.slice(open, i + 1);
  }
  return null;
}

/** Comments cannot satisfy a ratchet — strip them before scanning. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const ARIA_STATE = ['aria-pressed', 'aria-selected', 'aria-current', 'aria-checked'];

describe('a segmented control says which option is chosen', () => {
  it('gives segButton a state that matches the class it hands out', () => {
    expect(segButton(true)).toEqual({ className: 'btn small primary', 'aria-pressed': true });
    expect(segButton(false)).toEqual({ className: 'btn small', 'aria-pressed': false });
  });

  // Mutation control: rewrite any one `{...seg(` back to `className={seg(` and
  // this case goes red naming that file and line.
  it('never takes only the class name back from the shared helper', () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(ROOT)) {
      const source = readFileSync(file, 'utf8');
      let i = source.indexOf('className={seg(');
      while (i >= 0) {
        offenders.push(`${file.slice(file.indexOf('renderer'))}:${source.slice(0, i).split('\n').length}`);
        i = source.indexOf('className={seg(', i + 1);
      }
    }
    expect(offenders, `seg() used for its class alone at:\n${offenders.join('\n')}`).toEqual([]);
  });

  // Mutation control: delete any one `aria-pressed={...}` line added for D333
  // and this case goes red naming that button.
  it('gives every hand-rolled primary-as-state button an aria-pressed', () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const file of tsxFiles(ROOT)) {
      const source = readFileSync(file, 'utf8');
      for (const needle of ["'primary' : ''", "'' : 'primary'"]) {
        let i = source.indexOf(needle);
        while (i >= 0) {
          const tag = enclosingTag(source, i);
          // Only a <button> is in scope; the helper itself is not JSX at all.
          if (tag && tag.includes(needle)) {
            checked++;
            if (!tag.includes('aria-pressed')) {
              offenders.push(`${file.slice(file.indexOf('renderer'))}:${source.slice(0, i).split('\n').length}`);
            }
          }
          i = source.indexOf(needle, i + 1);
        }
      }
    }
    // Non-vacuity: the idiom is still in the tree, so the walk must reach it.
    expect(checked, 'the scan found no primary-as-state buttons at all').toBeGreaterThanOrEqual(9);
    expect(offenders, `state in a class alone at:\n${offenders.join('\n')}`).toEqual([]);
  });

  /**
   * D415, measured live 2026-09-08 on Discover: the three `.disc-seg-btn` groups
   * reported `Anime` -> aria-pressed="true", the `Discover` tab ->
   * aria-selected="true", and `This season` -> all four state attributes null
   * while wearing the `active` class. Four of the six groups in the tree had
   * been missed, two of them two lines below a sibling that carries the comment
   * explaining exactly why the attribute is needed.
   *
   * A THIRD marker class, so this is its own case rather than a widened needle:
   * D6 swept `active`, D333 swept `primary`, and this idiom is `disc-seg-btn`
   * plus `active` — a shared component class that D6's sweep did not reach.
   */
  it('gives every .disc-seg-btn an aria state, not just a colour', () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const file of tsxFiles(ROOT)) {
      const source = stripComments(readFileSync(file, 'utf8'));
      let i = source.indexOf('disc-seg-btn');
      while (i >= 0) {
        const tag = wholeButtonTag(source, i);
        if (tag && tag.includes('disc-seg-btn')) {
          checked++;
          if (!ARIA_STATE.some((a) => tag.includes(a))) {
            offenders.push(`${file.slice(file.indexOf('renderer'))}:${source.slice(0, i).split('\n').length}`);
          }
        }
        i = source.indexOf('disc-seg-btn', i + 1);
      }
    }
    // Non-vacuity: six groups exist today across three files.
    expect(checked, 'the scan found no .disc-seg-btn buttons at all').toBeGreaterThanOrEqual(6);
    expect(offenders, `segment state in a class alone at:\n${offenders.join('\n')}`).toEqual([]);
  });
});
