/**
 * Pre-sweep D82 — a segmented choice that looks selected must also SAY it is selected.
 *
 * `.sp-seg-btn` is the app's segmented-choice idiom: a row of buttons inside a
 * `.sp-seg` container where exactly one carries `active`. `active` is a CSS class and
 * nothing else, so a screen reader announces the chosen option and the one beside it
 * with byte-identical output — the user cannot tell which is in effect, and cannot
 * confirm that clicking one took.
 *
 * Measured live on 2026-09-06 (Media Center ▸ Video, pid 14128 window 2): the
 * `日本語 / 中文` transcription-language pair reported `aria-pressed: null`,
 * `aria-checked: null`, `role: null` inside a `role="group"`. 28 conditional call
 * sites existed and exactly one — `MangaViewModeSwitcher.tsx` — also wrote
 * `aria-pressed`, so the correct idiom was already in the repo and 27 sites lacked it.
 *
 * A *source* scan, for the same reason `sliderAccessibleName.test.ts` is one:
 * `vitest.config.ts` is `environment: 'node'` and these components reach singletons at
 * module eval, so rendering all ten of them is not on the table. The scan covers every
 * file instead of the handful a render harness could reach.
 *
 * Scope, deliberately narrow: only the CONDITIONAL form is required to carry the
 * attribute. A static `className="sp-seg-btn"` is a command sitting in a segmented
 * container — Theme Studio's Undo/Restore/Delete, Connection Profiles' Delete — and a
 * pressed state on a command would be a lie, so those are exempt by construction.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = ['src/renderer', 'src/media'];

type SegButton = {
  file: string;
  line: number;
  /** The condition the `active` class is derived from. */
  condition: string;
  /** Whether the same opening tag also carries `aria-pressed` / `aria-checked`. */
  announced: boolean;
};

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__devharness__') continue;
        walk(p);
      } else if (/\.(tsx|jsx)$/.test(entry.name)) out.push(p);
    }
  };
  for (const root of ROOTS) if (fs.existsSync(root)) walk(root);
  return out;
}

/**
 * Walk outward from the `className` match to the enclosing JSX opening tag, tracking
 * `{}` depth and quotes so an expression attribute containing `>` does not end it early.
 * Same hazard `sliderAccessibleName.test.ts` documents, approached from the middle
 * rather than the start because the anchor here is the className, not the tag name.
 */
function enclosingTag(src: string, at: number): string {
  let start = at;
  let depth = 0;
  for (let i = at; i >= 0; i--) {
    const c = src[i];
    if (c === '}') depth++;
    else if (c === '{') {
      if (depth === 0) continue;
      depth--;
    } else if (c === '<' && depth === 0) {
      start = i;
      break;
    }
  }
  let quote: string | null = null;
  depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== '\\') quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

/** Every conditional `.sp-seg-btn` in one file, with whether it announces its state. */
export function analyseSource(src: string, file = '<inline>'): SegButton[] {
  const found: SegButton[] = [];
  // The idiom, verbatim: className={`sp-seg-btn ${cond ? 'active' : ''}`}
  const pattern = /className=\{`sp-seg-btn \$\{([^{}]+?) \? 'active' : ''\}`\}/g;
  for (const match of src.matchAll(pattern)) {
    const tag = enclosingTag(src, match.index);
    found.push({
      file,
      line: src.slice(0, match.index).split(/\r?\n/).length,
      condition: match[1],
      announced: /\saria-(pressed|checked)=/.test(tag),
    });
  }
  return found;
}

function allSegButtons(): SegButton[] {
  return sourceFiles()
    .map((file) => file.replace(/\\/g, '/'))
    .flatMap((file) => analyseSource(fs.readFileSync(file, 'utf8'), file));
}

describe('segmented choices announce which option is selected', () => {
  it('gives every conditional .sp-seg-btn a pressed state', () => {
    const silent = allSegButtons()
      .filter((b) => !b.announced)
      .map((b) => `${b.file}:${b.line} (active when ${b.condition})`);
    expect(silent).toEqual([]);
  });

  it('covers the whole surface, so an empty pass cannot be vacuous', () => {
    const buttons = allSegButtons();
    // 28 measured on 2026-09-06 across 10 files. A floor, not an equality — new
    // segmented choices are expected, and they arrive already covered by the check above.
    expect(buttons.length).toBeGreaterThanOrEqual(28);
    expect(buttons.every((b) => b.announced)).toBe(true);
  });

  it('reaches the Video pane pair that produced the finding', () => {
    const media = analyseSource(
      fs.readFileSync('src/renderer/components/media/MediaContent.tsx', 'utf8'),
      'MediaContent.tsx',
    );
    expect(media.map((b) => b.condition)).toContain("state.subLang === 'ja'");
    expect(media.map((b) => b.condition)).toContain("state.subLang === 'zh'");
    expect(media.every((b) => b.announced)).toBe(true);
  });
});

describe('the analyser itself detects what it claims to', () => {
  // Mutation controls: without these the scan above could pass by finding nothing.
  it('reports a bare conditional segmented button as silent', () => {
    const [only] = analyseSource("<button className={`sp-seg-btn ${on ? 'active' : ''}`}>A</button>");
    expect(only).toMatchObject({ condition: 'on', announced: false });
  });

  it('accepts aria-pressed and aria-checked, in either attribute order', () => {
    expect(
      analyseSource("<button aria-pressed={on} className={`sp-seg-btn ${on ? 'active' : ''}`}>A</button>")[0]
        .announced,
    ).toBe(true);
    expect(
      analyseSource("<button className={`sp-seg-btn ${on ? 'active' : ''}`} aria-checked={on}>A</button>")[0]
        .announced,
    ).toBe(true);
  });

  it('does not accept the active class alone as a state announcement', () => {
    // `active` is what the defect was: visible, and inaudible.
    const [only] = analyseSource(
      "<button title=\"Japanese\" className={`sp-seg-btn ${on ? 'active' : ''}`}>日本語</button>",
    );
    expect(only.announced).toBe(false);
  });

  it('ignores a static segmented button, which is a command and has no pressed state', () => {
    expect(analyseSource('<button className="sp-seg-btn">Delete</button>')).toEqual([]);
  });

  it('does not let an expression attribute containing > end the tag early', () => {
    // `disabled={a > b}` sitting after the className is the case a scan-to-first-`>` gets
    // wrong: it would truncate before aria-pressed and report a fixed site as still broken.
    const [only] = analyseSource(
      "<button className={`sp-seg-btn ${on ? 'active' : ''}`} disabled={a > b} aria-pressed={on}>A</button>",
    );
    expect(only.announced).toBe(true);
  });
});
