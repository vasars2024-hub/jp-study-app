import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Pre-sweep class 5 — three destructive actions that asked nothing.
 *
 * Found by `src/.coordination/presweep/destructive-guard-scan.cjs`, which locates every
 * renderer call to a destructive `window.api.*` and asks whether a confirmation is reached
 * first. At the time of writing: 42 call sites, 12 guarded. Most of the rest are legitimate
 * (an undo path, a single-row remove, a helper whose caller confirms). These three were not:
 *
 *   lensHistoryClear         "Clear all" wiped the whole capture store, PINNED entries too
 *   desktopResetAssignments  one click threw away every desktop→display assignment
 *   clearCredential          removed a stored secret the provider will not show again
 *
 * The assertion reads the enclosing FUNCTION BODY, not the file. All three files already
 * call `confirmDialog` somewhere else, or will once a concurrent track lands its own guard,
 * so a file-wide `toContain` would pass while the guard under test was deleted — and would
 * be "repaired" by adding an unrelated dialog.
 */
const ROOT = resolve(__dirname, '..', '..', '..');

const CASES = [
  { file: 'src/renderer/components/settings/pages/ReadingLensSection.tsx', api: 'lensHistoryClear' },
  { file: 'src/renderer/components/settings/pages/MonitorsPage.tsx', api: 'desktopResetAssignments' },
  { file: 'src/renderer/components/settings/pages/ApiKeysPage.tsx', api: 'clearCredential' },
  // Added by the manual half of the class. The scan reported this one as a bare
  // unguarded call and it was worse than the label suggested: `visual-novel:remove`
  // also filters `captures` by `visualNovelId`, so removing a novel deleted every
  // sentence mined from it. The sibling panel already guarded deleting ONE capture,
  // so the smaller destruction asked and the larger one did not.
  { file: 'src/renderer/components/immersion/VisualNovelPanel.tsx', api: 'visualNovelRemove' },
  // A MODE GAP rather than a second opinion. Study OS reaches `media:remove`
  // through `MediaLibraryShell.removeEntry`, which confirms; Blanc renders the
  // same `MediaGrid` (`BlancMediaPanels.tsx:175`) whose per-card × called this
  // helper directly. The handler `rmSync`s the item's userData `subtitles/`
  // directory, where Whisper output and harvested records both live.
  { file: 'src/renderer/components/media/MediaContent.tsx', api: 'removeMedia' },
  // D17, open since the resources walk. The tool and any note written on it went
  // on one click, and the `catch { /* ignore */ }` meant a FAILED removal looked
  // identical to a dead button.
  //
  // D143 then moved the confirm OUT of this file. `tools:remove` has two call
  // sites and D17 guarded only the one it was walking, so Blanc's app drawer
  // still removed a collected tool bare — a fix creating the very mode gap D137
  // had just named. Both hosts now delegate to one helper, which is why these
  // two cases name a different guard token: `confirmDialog(` is no longer in
  // either file, and requiring it would have forced the guard back into the
  // hosts where it can drift again.
  {
    file: 'src/renderer/components/resources/ResourcesContent.tsx',
    api: 'toolsRemove',
    guard: 'confirmRemoveCollectedTool(',
    dangerIn: 'src/renderer/collectedToolsActions.ts',
  },
  {
    file: 'src/renderer/components/blanc/BlancAppDrawerPanel.tsx',
    api: 'toolsRemove',
    guard: 'confirmRemoveCollectedTool(',
    dangerIn: 'src/renderer/collectedToolsActions.ts',
  },
] as const;

/** The Nth enclosing brace block around `index`, 0 = innermost. */
function enclosingBlock(text: string, index: number, level = 0): string {
  let from = index;
  let block = '';
  for (let step = 0; step <= level; step++) {
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
    if (open < 0) throw new Error('no enclosing block');
    let d = 0;
    let close = -1;
    for (let i = open; i < text.length; i++) {
      if (text[i] === '{') d++;
      else if (text[i] === '}') { d--; if (d === 0) { close = i; break; } }
    }
    if (close < 0) throw new Error('unbalanced');
    block = text.slice(open, close + 1);
    from = open;
  }
  return block;
}

/**
 * The smallest enclosing block that holds the guard. `clearCredential` sits inside a
 * `case 'vault': { … }` and the guard is one level out in `remove()`, so a strictly
 * innermost read would call a guarded action unguarded — four levels out there
 * (case → switch → try → the function). Capped at 4,000 characters so it can never widen
 * into the whole component and pass on some other dialog elsewhere in the file: the three
 * bodies under test measure well under that, the components they live in are far over it.
 */
function guardingBody(text: string, index: number, guard: string): string {
  let widest = '';
  for (let level = 0; level < 4; level++) {
    // A body with fewer than four nesting levels runs out of enclosing braces
    // before the loop ends. That used to throw `no enclosing block` out of the
    // whole test, which reports a MISSING GUARD as a harness crash — it cost a
    // real diagnosis when D143 moved a guard into a shared module. Stop
    // climbing and let the assertion below say what is actually wrong.
    let body: string;
    try {
      body = enclosingBlock(text, index, level);
    } catch {
      break;
    }
    widest = body;
    if (body.includes(guard) && body.length < 4000) return body;
  }
  return widest || enclosingBlock(text, index, 0);
}

describe('destructive actions confirm before they destroy', () => {
  it.each(CASES)('$api asks first in $file', (testCase) => {
    const { file, api } = testCase;
    const token: string = 'guard' in testCase ? testCase.guard : 'confirmDialog(';
    const text = readFileSync(resolve(ROOT, file), 'utf8');
    const at = text.indexOf(`window.api.${api}(`);
    expect(at, `${api} call site not found in ${file}`).toBeGreaterThan(-1);
    const body = guardingBody(text, at, token);
    const guard = body.indexOf(token);
    expect(guard, `${api} runs with no ${token} in its own function in ${file}`).toBeGreaterThan(-1);
    // Before the call, and the result is honoured: an unread promise is not a guard.
    expect(guard).toBeLessThan(body.indexOf(`window.api.${api}(`));
    // Either shape of "and it bailed out": the inline `ok` local, or a negated
    // call to a delegating helper. Both must actually `return`.
    expect(body, `${api} does not act on the answer in ${file}`)
      .toMatch(/if\s*\(!\s*ok\)\s*return;|if\s*\(!\s*await\s[^\n]*\)\s*return;/);
    // `danger: true` lives wherever the dialog is actually constructed — in the
    // host for an inline confirm, in the shared helper for a delegated one.
    const dangerFile = 'dangerIn' in testCase ? testCase.dangerIn : file;
    expect(readFileSync(resolve(ROOT, dangerFile), 'utf8'), `${api}'s dialog is not danger`)
      .toMatch(/danger:\s*true/);
  });

  it('reads a real body, not an empty string', () => {
    const text = readFileSync(resolve(ROOT, CASES[0].file), 'utf8');
    const body = guardingBody(text, text.indexOf('window.api.lensHistoryClear('), 'confirmDialog(');
    expect(body.length).toBeGreaterThan(120);
    expect(body).toContain('lensHistoryClear');
  });

  it('a missing guard fails as an assertion, not as a harness crash', () => {
    // The regression this file itself caused: `enclosingBlock` threw out of the
    // test when a body had fewer than four levels, so "the guard is gone" and
    // "the walker fell off the top of the file" were the same message.
    const unguarded = 'async function drop(id) {\n  await window.api.toolsRemove(id);\n}\n';
    const body = guardingBody(unguarded, unguarded.indexOf('window.api.toolsRemove('), 'confirmDialog(');
    expect(body).toContain('toolsRemove');
    expect(body.indexOf('confirmDialog(')).toBe(-1);
  });
});
