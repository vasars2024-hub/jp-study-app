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
});
