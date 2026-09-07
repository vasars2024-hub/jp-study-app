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
function guardingBody(text: string, index: number): string {
  for (let level = 0; level < 4; level++) {
    const body = enclosingBlock(text, index, level);
    if (body.includes('confirmDialog(') && body.length < 4000) return body;
  }
  return enclosingBlock(text, index, 0);
}

describe('destructive actions confirm before they destroy', () => {
  it.each(CASES)('$api asks first', ({ file, api }) => {
    const text = readFileSync(resolve(ROOT, file), 'utf8');
    const at = text.indexOf(`window.api.${api}(`);
    expect(at, `${api} call site not found in ${file}`).toBeGreaterThan(-1);
    const body = guardingBody(text, at);
    const guard = body.indexOf('confirmDialog(');
    expect(guard, `${api} runs with no confirmDialog in its own function`).toBeGreaterThan(-1);
    // Before the call, and the result is honoured: an unread promise is not a guard.
    expect(guard).toBeLessThan(body.indexOf(`window.api.${api}(`));
    expect(body).toMatch(/if\s*\(!ok\)\s*return;/);
    expect(body).toMatch(/danger:\s*true/);
  });

  it('reads a real body, not an empty string', () => {
    const text = readFileSync(resolve(ROOT, CASES[0].file), 'utf8');
    const body = guardingBody(text, text.indexOf('window.api.lensHistoryClear('));
    expect(body.length).toBeGreaterThan(120);
    expect(body).toContain('lensHistoryClear');
  });
});
