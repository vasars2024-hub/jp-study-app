import { readdirSync, readFileSync } from 'node:fs';
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
  { file: 'src/renderer/components/resources/ResourcesContent.tsx', api: 'toolsRemove' },
  // D142 — the SAME store and the SAME action as the line above, on Blanc's own
  // host. `BlancAppDrawerPanel` reuses `shared/collectedTools.ts` rather than
  // adding a third store, so D17's fix in Resources left Blanc's ✕ destructive
  // and silent. Both hosts are pinned so neither can regress alone.
  { file: 'src/renderer/components/blanc/BlancAppDrawerPanel.tsx', api: 'toolsRemove' },
  { file: 'src/renderer/components/blanc/BlancAppDrawerPanel.tsx', api: 'toolsRemoveFolder' },
  // D143. "Remove missing entries" is a bulk delete wearing a tidy-up label:
  // "missing" is `!existsSync(path)`, so one unplugged drive makes every title on
  // it missing at once, and a media id is a random UUID — so re-importing after
  // the drive comes back cannot restore the entry's watch position, note or study
  // profile.
  { file: 'src/renderer/components/media/MediaContent.tsx', api: 'pruneMedia' },
  // D145. Removing a tracked immersion site takes its visit count, its streak,
  // its reading time and its progress with it (`shared/immersion.ts:18`), and the
  // ✕ sits beside the button that OPENS the site. BOTH hosts called it bare, so
  // the guard went into one shared helper rather than into whichever host was
  // found first — see SOLE_CALLERS below, which is what keeps it that way.
  { file: 'src/renderer/components/immersion/immersionSiteActions.ts', api: 'immersionRemoveSite' },
] as const;

/**
 * A guard on a shared helper is only a guard while the helper is the ONLY route to
 * the API. D137 and D142 were both hosts reaching past a guarded path; this pins
 * the repair so a third host cannot reintroduce the same defect by calling
 * `window.api` directly. Renderer sources only — preload and `window.d.ts` declare
 * the channel and are not callers.
 */
const SOLE_CALLERS = [
  { api: 'immersionRemoveSite', through: 'src/renderer/components/immersion/immersionSiteActions.ts' },
] as const;

/**
 * Blank every comment, keeping the file's length so every offset still lines up.
 *
 * Without this the scan reads its own subject matter: `immersionSiteActions.ts`
 * documents the defect it repairs and writes `window.api.immersionRemoveSite(id)`
 * in the header comment, which is the FIRST match in the file, sits at module
 * level, and has no enclosing block at all — the test threw rather than failing,
 * which is a worse outcome than either. A comment that merely NAMES a destructive
 * call must never be scored as one, in either direction.
 */
function withoutComments(text: string): string {
  const out = text.split('');
  let mode: 'code' | 'line' | 'block' | '"' | "'" | '`' = 'code';
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
    } else {
      // Inside a string. `\` escapes the next character, including a quote.
      if (ch === '\\') i++;
      else if (ch === mode) mode = 'code';
    }
  }
  return out.join('');
}

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
  // The file is in the title because `toolsRemove` now has two hosts, and a bare
  // `$api` title would leave a failure naming neither of them.
  it.each(CASES.map((c) => ({ ...c, where: c.file.split('/').pop() })))(
    '$api asks first in $where',
    ({ file, api }) => {
    const text = withoutComments(readFileSync(resolve(ROOT, file), 'utf8'));
    const at = text.indexOf(`window.api.${api}(`);
    expect(at, `${api} call site not found in ${file}`).toBeGreaterThan(-1);
    const body = guardingBody(text, at);
    const guard = body.indexOf('confirmDialog(');
    expect(guard, `${api} runs with no confirmDialog in its own function`).toBeGreaterThan(-1);
    // Before the call, and the result is honoured: an unread promise is not a guard.
    expect(guard).toBeLessThan(body.indexOf(`window.api.${api}(`));
    // `return;` or `return false;` — a guard that reports its own refusal to the
    // caller (so the surface can stay open on Cancel) is still a guard.
    expect(body).toMatch(/if\s*\(!ok\)\s*return(\s+[^;]+)?;/);
      expect(body).toMatch(/danger:\s*true/);
    },
  );

  it.each(SOLE_CALLERS)('$api is reached only through its guarded helper', ({ api, through }) => {
    const renderer = resolve(ROOT, 'src', 'renderer');
    const callers: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(full);
        } else if (/\.tsx?$/.test(entry.name) && entry.name !== 'window.d.ts') {
          if (withoutComments(readFileSync(full, 'utf8')).includes(`window.api.${api}(`)) {
            callers.push(full.replace(/\\/g, '/').slice(ROOT.replace(/\\/g, '/').length + 1));
          }
        }
      }
    };
    walk(renderer);
    expect(callers, `${api} must be called only from ${through}`).toEqual([through]);
  });

  it('reads a real body, not an empty string', () => {
    const text = withoutComments(readFileSync(resolve(ROOT, CASES[0].file), 'utf8'));
    const body = guardingBody(text, text.indexOf('window.api.lensHistoryClear('));
    expect(body.length).toBeGreaterThan(120);
    expect(body).toContain('lensHistoryClear');
  });

  // The masker is load-bearing enough to be tested rather than assumed: it decides
  // which occurrence every case above reads.
  it('blanks comments, keeps offsets, and leaves strings alone', () => {
    const src = [
      "const a = 'window.api.pruneMedia(';",
      '// window.api.pruneMedia(x)',
      '/* window.api.pruneMedia(y) */',
      'window.api.pruneMedia();',
    ].join('\n');
    const masked = withoutComments(src);
    expect(masked).toHaveLength(src.length);
    // Two survive: the string literal (deliberately — a literal is code) and the
    // real call. The two comments are gone.
    expect(masked.split('window.api.pruneMedia(')).toHaveLength(3);
    expect(masked.indexOf('window.api.pruneMedia();')).toBe(src.indexOf('window.api.pruneMedia();'));
    expect(withoutComments("const s = '// not a comment'; x();")).toContain('// not a comment');
  });
});
