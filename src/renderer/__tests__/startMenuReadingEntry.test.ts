/**
 * One way into Reading from Start.
 *
 * Start listed Library, Novels and Reading Finder, and all three opened the one
 * Reading workspace (Novels on Plan, Reading on Discover) or a tab of it — three
 * doors into one room, one of them described as the OCR lens it is not. Library
 * is the entry kept, and it opens the workspace; `novels` and `reading` stay
 * real sections (deep links, lens hand-off, pop-outs, saved layouts) exactly as
 * `video` did when Watch absorbed it.
 *
 * Source scan, for the reason `startMenuWatchEntry.test.tsx` gives: DesktopShell
 * pulls the whole shell tree at module eval.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(__dirname, '../../..');
const read = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SHELL = code(read('src/renderer/components/DesktopShell.tsx'));

function block(name: string, end = '];'): string {
  const at = SHELL.indexOf(`const ${name}`);
  expect(at, `${name} is gone — was it renamed?`).toBeGreaterThan(-1);
  return SHELL.slice(at, SHELL.indexOf(end, at) + end.length);
}

describe('Start offers one Reading entry', () => {
  it('keeps novels and reading as sections but hides them from Start', () => {
    const apps = block('APPS');
    expect(apps).toContain("{ id: 'novels',");
    expect(apps).toContain("{ id: 'reading',");
    const hidden = block('START_HIDDEN_SECTIONS', ');');
    expect(hidden).toContain("'novels'");
    expect(hidden).toContain("'reading'");
    // Control: Watch's precedent is untouched.
    expect(hidden).toContain("'video'");
    const groups = block('START_GROUPS');
    expect(groups).not.toContain("'novels'");
    expect(groups).not.toContain("'reading'");
    expect(groups).toContain("'library'");
    expect(block('START_PRIMARY_SECTIONS')).toContain("'library'");
  });

  it('opens the Reading workspace from Library, as an entry that is not a route host', () => {
    const appSection = code(read('src/renderer/components/AppSection.tsx'));
    expect(appSection).toMatch(
      /case 'library':\s*view = <ReadingWorkspaceView initialSection="library" onOpenBook=\{onOpenBook\} routeHost=\{false\} \/>;/,
    );
    // The hosts deep links and the lens rely on still resolve.
    expect(appSection).toMatch(/case 'novels':\s*view = <ReadingWorkspaceView initialSection="plan"/);
    expect(appSection).toMatch(/case 'reading':\s*view = <ReadingWorkspaceView initialSection="discover"/);
  });

  it('no longer calls the Reading section the OCR lens', () => {
    const raw = read('src/renderer/components/DesktopShell.tsx');
    expect(raw).not.toMatch(/Reading is the OCR reading lens/);
  });
});
