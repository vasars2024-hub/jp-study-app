/**
 * DEFECT S1 regression guard — no subtitle text path may resolve to a font without
 * Japanese coverage.
 *
 * SCOPE, corrected 2026-09-03. This file guards the **DOM** subtitle text and only that.
 * Its original header claimed "no libass/jassub renderer is bundled", and that was WRONG:
 * `src/media/jassub/` holds a JASSUB 2.5.6 runtime, its worker and its WASM, and the
 * player burns ASS onto a canvas with it. The canvas half is a separate mechanism with a
 * separate guard — `src/main/__tests__/subtitleFallbackFont.test.ts`. Retracted here
 * rather than quietly deleted, because the claim is what stopped the canvas half being
 * looked at for a turn.
 *
 * What actually went wrong on the DOM side, because the plan's recorded lead was a dead
 * end and the next reader should not chase it again: there is no `SUBTITLE_FONT_STACKS`
 * symbol anywhere in the tree, and nothing reads an ASS track's own `fontname`.
 * Cues are DOM text (`SubtitleCueLine` -> `.study-cue-text`), and
 * `mediaWorkspace.css` declared no `font-family` at all, so they inherited whatever the
 * active theme set. Two themes set a stack with no Japanese face in it —
 * `theme/aero-shell.css:116` and `theme/aero-apps.css:100` both resolve to
 * Tahoma / Segoe UI / sans-serif — plus four `Tahoma, "MS Sans Serif"` rules in the same
 * files. Missing glyphs then fall to Chromium's last-resort fallback, which covers some
 * ranges and not others; that is how one line renders while its siblings are boxes.
 *
 * So the guard is on the STACK, not on a screenshot: every subtitle surface must name
 * `--subtitle-font-stack`, and that stack must name a face with kana + kanji coverage.
 *
 * Two traps this file is deliberately written around, both of which have produced false
 * results in this repo before:
 *   - Comments are stripped before anything is matched. The declaration block above the
 *     token names Tahoma and MS Sans Serif on purpose, and a raw-text scan would read
 *     those as the defect it is describing.
 *   - Line endings are normalised. Fresh worktrees here are CRLF and the shared tree is
 *     LF, so a `$`-anchored match passes only in the tree it was written in.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS_PATH = path.join(__dirname, '..', 'mediaWorkspace.css');

/** Strip comments first, then normalise line endings. Order matters: a comment can span lines. */
function readStyleSheet(): string {
  return readFileSync(CSS_PATH, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\r\n?/g, '\n');
}

/**
 * Faces with full kana + jouyou kanji coverage. Generic families are deliberately absent:
 * `sans-serif` resolving to something Japanese is a platform accident, and relying on it
 * is exactly the bug.
 */
const CJK_CAPABLE = [
  'Yu Gothic UI',
  'Yu Gothic',
  'Meiryo',
  'Noto Sans JP',
  'Noto Serif JP',
  'Hiragino Kaku Gothic ProN',
  'Hiragino Mincho ProN',
  'MS Gothic',
  'MS Mincho',
  'Source Han Sans',
];

/** The predicate under test, applied to a raw font-family value. */
function namesCjkFace(stack: string): boolean {
  const normalised = stack.replace(/['"]/g, '').toLowerCase();
  return CJK_CAPABLE.some((face) => normalised.includes(face.toLowerCase()));
}

function subtitleFontStack(css: string): string {
  const match = css.match(/--subtitle-font-stack:\s*([^;]+);/);
  expect(match, '--subtitle-font-stack is not declared in mediaWorkspace.css').toBeTruthy();
  return (match as RegExpMatchArray)[1].replace(/\s+/g, ' ').trim();
}

/** Every surface that paints subtitle-derived Japanese text. */
const SUBTITLE_SURFACES = [
  '.study-cue-text',
  '.study-cue-secondary',
  '.study-cue-translation',
  '.study-transcript-text',
  '.study-dictation input',
];

describe('subtitle font stack (DEFECT S1)', () => {
  it('declares a stack that names at least one CJK-capable face', () => {
    const stack = subtitleFontStack(readStyleSheet());
    expect(namesCjkFace(stack)).toBe(true);
  });

  it('puts the Japanese faces ahead of the Latin ones', () => {
    // A mixed cue must take its kana from a Japanese font, not from whatever Latin face
    // happens to ship a partial kana range.
    const stack = subtitleFontStack(readStyleSheet());
    const faces = stack.split(',').map((f) => f.replace(/['"]/g, '').trim());
    const firstCjk = faces.findIndex((f) => namesCjkFace(f));
    const firstLatinOnly = faces.findIndex(
      (f) => f.length > 0 && !namesCjkFace(f) && !/^(system-ui|sans-serif|serif|ui-sans-serif)$/i.test(f),
    );
    expect(firstCjk).toBeGreaterThanOrEqual(0);
    if (firstLatinOnly >= 0) expect(firstCjk).toBeLessThan(firstLatinOnly);
  });

  it.each(SUBTITLE_SURFACES)('routes %s through the shared stack', (selector) => {
    const css = readStyleSheet();
    const block = css.match(
      new RegExp(`#media-workspace ${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*\\{([^}]*)\\}`),
    );
    expect(block, `no rule found for ${selector}`).toBeTruthy();
    expect((block as RegExpMatchArray)[1]).toContain('font-family: var(--subtitle-font-stack)');
  });

  /**
   * MUTATION CONTROL. The three assertions above only mean something if the predicate can
   * fail, so feed it the exact stacks the Aero themes carry today and require a FAIL.
   * If someone widens CJK_CAPABLE with a generic family, this test goes red first.
   */
  it('fails a stack whose faces have no Japanese coverage', () => {
    expect(namesCjkFace("'Tahoma', 'Segoe UI', sans-serif")).toBe(false);
    expect(namesCjkFace('Tahoma, "MS Sans Serif", sans-serif')).toBe(false);
    expect(namesCjkFace("'Lucida Console', Consolas, monospace")).toBe(false);
    // and the positive half of the control, so a predicate that always returns false
    // cannot pass this test either
    expect(namesCjkFace("'Yu Gothic UI', sans-serif")).toBe(true);
  });
});

/** Source with comments removed, so the prose explaining a symbol cannot satisfy a match. */
function readSource(...parts: string[]): string {
  return readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\r\n?/g, '\n');
}

/**
 * The canvas half must be REACHED, not merely written.
 *
 * `route-with-no-consumer` is a recorded failure of this repo: a path repaired, tested,
 * probe-verified — and never called by the product. The font resolver is exactly that
 * shape, so every link of the chain is pinned here: handler -> preload -> overlay.
 */
describe('libass gets a CJK face (DEFECT S1, canvas half)', () => {
  it('registers the resolver on a channel', () => {
    expect(readSource('main', 'media.ts')).toContain("'media:subtitleFallbackFont'");
    expect(readSource('main', 'media.ts')).toContain('resolveSubtitleFallbackFont(');
  });

  it('exposes it on the preload bridge', () => {
    const preload = readSource('preload.ts');
    expect(preload).toContain('subtitleFallbackFont:');
    expect(preload).toContain("ipcRenderer.invoke('media:subtitleFallbackFont', lang)");
  });

  it('hands the face to the libass renderer from the overlay', () => {
    const overlay = readSource('media', 'VideoCoreStudyOverlay.tsx');
    expect(overlay).toContain('window.api.subtitleFallbackFont(getStudyLang())');
    expect(overlay).toContain('renderer.renderer.addFonts([objectUrl])');
    // Applied once per renderer instance, or a `timeupdate` tick re-fetches 9 MB at 4 Hz.
    expect(overlay).toContain('libassFontRendererRef.current === renderer');
  });

  it('makes that face the DEFAULT, which is the half addFonts does not do', () => {
    /*
      Measured live 2026-09-03 on the nyaa ASS sidecar for JoJo 39-END, cue 18
      (145890–149270 ms): with `addFonts` alone libass painted
      `□□□ □□□□□□□□□□□□□□□` where `何者だ なぜブチャラティを知っている` belongs.
      Adding the bytes only makes a face findable BY NAME. That file's styles name
      `ＤＦＰ平成ゴシック体W7` and `思源黑体 CN Heavy`, which are not on the machine,
      and for a family it cannot find libass substitutes its default — Roboto. So this
      assertion, not the one above, is the one that decides whether glyphs appear.
    */
    const overlay = readSource('media', 'VideoCoreStudyOverlay.tsx');
    expect(overlay).toContain('renderer.renderer.setDefaultFont?.(font.family)');
    // Order matters: the bytes have to be in the provider before the name points at them.
    expect(overlay.indexOf('addFonts([objectUrl])'))
      .toBeLessThan(overlay.indexOf('setDefaultFont?.(font.family)'));
  });

  it('the vendored JASSUB worker still exposes setDefaultFont', () => {
    // A ratchet on the MECHANISM the fix above depends on. `this.renderer` is a comlink
    // proxy, so `renderer.renderer.anything` is truthy whether or not the worker
    // implements it — a guard on the call site cannot catch this method going away, and
    // the failure mode is silent tofu rather than an error.
    const worker = readFileSync(
      path.join(__dirname, '..', 'jassub', 'assets', 'jassub-worker.js'),
      'utf8',
    );
    expect(worker).toContain('setDefaultFont(fontName)');
    expect(worker).toContain('this._wasm.setDefaultFont(');
  });

  it('still constructs libass with Roboto alone, which is why the above is needed', () => {
    // A ratchet on the CAUSE. If vendor ever ships a CJK face in `availableFonts` this
    // goes red and the overlay's font path can be reconsidered instead of left as cargo.
    const vendor = readFileSync(
      path.join(
        __dirname, '..', '..', '..', 'vendor', 'seanime-web', 'app', '(main)',
        '_features', 'video-core', 'video-core-subtitles.ts',
      ),
      'utf8',
    ).replace(/\r\n?/g, '\n');
    expect(vendor).toContain('const DEFAULT_FONT_NAME = "roboto medium"');
    expect(vendor).toContain('[DEFAULT_FONT_NAME]: defaultFontUrl,');
  });
});
