import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..', '..', '..');
const MAIN = readFileSync(resolve(ROOT, 'src', 'main.ts'), 'utf8');
const APP = readFileSync(resolve(ROOT, 'src', 'renderer', 'App.tsx'), 'utf8');
const SHELL = readFileSync(
  resolve(ROOT, 'src', 'renderer', 'components', 'DesktopShell.tsx'),
  'utf8',
);

/**
 * Pre-sweep D89 — pop-out has TWO allow-lists and they must agree.
 *
 * `main.ts`'s `POPOUT_SECTIONS` decides whether a real OS window opens at
 * `?popout=<section>`. `App.tsx`'s `POPOUT_LABEL_KEYS` is what `popoutSection()` validates
 * that query against with `in`. A section in the first and not the second is the worst
 * possible split: main opens the window, `DesktopShell`'s `onPopOut` closes the original,
 * and the renderer — seeing an unrecognised popout id — falls through and renders the whole
 * desktop again.
 *
 * Measured live 2026-09-06 on `youtube` (pid 14128): the desk went 1 window -> 0, a third OS
 * window appeared at `?popout=youtube`, and it reported `hasTaskbar: true`, `hasDesk: true`,
 * `fwins: 12` — the user's entire desktop, twice, with the YouTube window gone.
 *
 * It had happened once before: `App.tsx:113` records `notebook` being deleted from
 * `POPOUT_LABEL_KEYS` without its successor, which took pop-out away from `files` while main
 * still listed it. That is two occurrences of one drift, so it gets a gate rather than a
 * third comment.
 *
 * `note` and `visualizer` are in NEITHER list, which is correct and is asserted too: they
 * render no ⧉ at all (`canPopOut = !isNote && !isVisualizer`), so there is nothing to serve.
 */
function setMembers(source: string, declaration: RegExp): string[] {
  const body = declaration.exec(source)?.[1];
  if (body === undefined) throw new Error(`declaration not found: ${declaration}`);
  return [...body.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
}

/** `const POPOUT_SECTIONS = new Set([ ... ]);` in main.ts */
const mainSections = (): string[] =>
  setMembers(MAIN, /const POPOUT_SECTIONS = new Set\(\[([\s\S]*?)\]\);/);

/**
 * The keys of the renderer's allow-list in App.tsx — comments hold quoted words, so keys
 * only. The object is matched by SHAPE, not by name: a concurrent track is mid-rename from
 * `POPOUT_LABELS` (raw English) to `POPOUT_LABEL_KEYS` (catalog keys), and a gate that names
 * one of them would go red on whichever side of that rename it did not expect. The contract
 * is the membership, which survives the rename.
 */
function rendererSections(): string[] {
  const body = /const POPOUT_LABELS?(?:_KEYS)?: Partial<Record<DesktopWinSection, string>> = \{([\s\S]*?)\n\};/
    .exec(APP)?.[1];
  if (body === undefined) throw new Error("App.tsx's pop-out allow-list object not found");
  return body
    .split('\n')
    .map((line) => /^\s{2}([a-z]+):\s/.exec(line)?.[1])
    .filter((k): k is string => Boolean(k));
}

describe('the two pop-out allow-lists agree', () => {
  it('serves every section main will open a window for', () => {
    const renderer = new Set(rendererSections());
    const unserved = mainSections().filter((s) => !renderer.has(s));
    expect(unserved).toEqual([]);
  });

  it('opens a window for every section the renderer claims to serve', () => {
    // The other direction is milder — a label key with no main entry just never fires — but
    // it is still a lie in the type, and catching it here is free.
    const main = new Set(mainSections());
    const unopenable = rendererSections().filter((s) => !main.has(s));
    expect(unopenable).toEqual([]);
  });

  it('reads both lists non-vacuously', () => {
    // Without this, a regex that stopped matching would make both checks pass on two empty
    // sets. 23 sections measured 2026-09-06.
    expect(mainSections().length).toBeGreaterThanOrEqual(23);
    expect(rendererSections().length).toBeGreaterThanOrEqual(23);
    expect(mainSections()).toContain('youtube');
    expect(rendererSections()).toContain('youtube');
  });

  it('leaves out exactly the sections that render no pop-out control', () => {
    // `note` and `visualizer` are absent from both on purpose. If `canPopOut` ever stops
    // excluding one of them, it gains a ⧉ that leads nowhere — so the exclusion is pinned
    // here next to the lists it justifies.
    expect(SHELL).toContain('const canPopOut = !isNote && !isVisualizer;');
    for (const excluded of ['note', 'visualizer']) {
      expect(mainSections()).not.toContain(excluded);
      expect(rendererSections()).not.toContain(excluded);
    }
  });
});

describe('the analyser detects the split it is checking for', () => {
  it('reports a main-only section as unserved', () => {
    const main = ['agent', 'youtube'];
    const renderer = new Set(['agent']);
    expect(main.filter((s) => !renderer.has(s))).toEqual(['youtube']);
  });

  it('would have failed before the fix', () => {
    // The pre-fix renderer list, verbatim minus `youtube` — the state measured live.
    const renderer = new Set(rendererSections().filter((s) => s !== 'youtube'));
    expect(mainSections().filter((s) => !renderer.has(s))).toEqual(['youtube']);
  });
});
