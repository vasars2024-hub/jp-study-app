import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(resolve(__dirname, '../views/MediaCenterView.tsx'), 'utf8');
// Comments stripped FIRST: the block's own prose explains the `display: none` this
// guard forbids, and a naive scan reads that sentence as the declaration.
const CSS = readFileSync(resolve(__dirname, '../views/mediaCenter.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * The 58px rail is the ONLY place these names live at that width — the buttons carry
 * no `aria-label`, so a `display: none` on the wrapper drops the accessible name to
 * `title`, which holds the DESCRIPTION, and for the two links with no title at all it
 * drops the name to nothing. Measured live 2026-09-01 at an 800px `.mc-root`: 8 of 11
 * controls announced something other than their own name, 2 announced nothing.
 * `\r?\n` because this file is CRLF in a fresh worktree and LF in the shared tree.
 */
const compactBlock = () => {
  const start = CSS.indexOf('@container mc (max-width: 820px)');
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = CSS.indexOf('{', start); i < CSS.length; i += 1) {
    if (CSS[i] === '{') depth += 1;
    else if (CSS[i] === '}') { depth -= 1; if (depth === 0) return CSS.slice(start, i + 1); }
  }
  throw new Error('unterminated @container mc block');
};

describe('Media Center collapsed rail keeps its names', () => {
  const NAME_WRAPPERS = [
    '.mc-nav button > span',
    '.mc-settings-link > span',
    '.mc-seanime-link > span',
    '.mc-nav-group__heading > span',
  ];

  it('clips the control name wrappers instead of removing them', () => {
    const block = compactBlock();
    const rules = block.split('}').map((r) => r.trim());
    for (const wrapper of NAME_WRAPPERS) {
      const owning = rules.filter((r) => r.includes(`${wrapper} {`) || r.includes(`${wrapper},`));
      expect(owning.length, `${wrapper} has no rule in the compact block`).toBeGreaterThan(0);
      for (const rule of owning) {
        expect(rule, `${wrapper} is removed from the a11y tree at 58px`).not.toMatch(/display:\s*none/);
      }
      expect(owning.some((r) => /clip-path:\s*inset\(50%\)/.test(r)), `${wrapper} is not clipped`).toBe(true);
    }
  });

  it('still hides the decoration that names no control', () => {
    const block = compactBlock();
    const hidden = block.match(/[^{}]*\{[^{}]*display:\s*none[^{}]*\}/g) ?? [];
    const joined = hidden.join('\n');
    expect(joined).toContain('.mc-nav-label');
    expect(joined).toContain('.mc-nav button em');
  });
});

describe('Media Center video progressive disclosure', () => {
  it('does not repeat the empty stage file action in the topbar', () => {
    const topbar = SOURCE.match(/<div className="mc-video-actions">([\s\S]*?)<\/div>/)?.[1] ?? '';
    expect(topbar).toMatch(/\{state\.src && \([\s\S]*mediaCenter\.action\.openVideo/);
    expect(topbar.match(/mediaCenter\.action\.openVideo/g)).toHaveLength(1);

    const empty = SOURCE.match(/!state\.src && \(([\s\S]*?)\n\s*\)\}/)?.[1] ?? '';
    expect(empty).toContain("t('mediaCenter.video.selectFile')");
    expect(empty).toContain("t('mediaCenter.video.browseFolder')");
  });

  /**
   * L10 bullet 4. The workspace launcher was rendered THREE times at once: the rail entry
   * (`.mc-seanime-link`), this topbar button and the stage CTA — and the topbar copy shared
   * the rail's name `mediaWorkspace.launcher` while sharing the stage CTA's handler, so the
   * live sweep read one label in two control systems. The topbar copy is the one that goes:
   * it was enabled exactly when `stage === 'workspace'`, which is the same condition that
   * renders the stage CTA, so it was never the only route to the workspace.
   */
  it('does not repeat the workspace launcher in the topbar', () => {
    const topbar = SOURCE.match(/<div className="mc-video-actions">([\s\S]*?)\n\s{6}<\/div>/)?.[1] ?? '';
    expect(topbar.length).toBeGreaterThan(0);
    expect(topbar).not.toMatch(/\{t\('mediaWorkspace\.launcher'\)\}/);

    // The stage keeps the action. The rail's separate "Media workspace" link is gone with the
    // workspace's own library (2026-09-23): the Media Center is the library.
    expect(SOURCE).not.toContain('mc-seanime-link');
    expect(SOURCE).toContain("t('mediaCenter.video.openInWorkspace')");
    // Comments stripped, for the same reason the CSS guard above strips them: the note left
    // where the button stood quotes the handler verbatim, and counting raw text read two.
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code.match(/onOpenSeanime\(current \? \{ localFilePath: current\.path \} : undefined\)/g))
      .toHaveLength(1);
  });
});
