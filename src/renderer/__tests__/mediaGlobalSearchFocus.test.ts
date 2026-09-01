import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(resolve(__dirname, '../views/MediaCenterView.tsx'), 'utf8');
const CSS = readFileSync(resolve(__dirname, '../views/mediaCenter.css'), 'utf8');

// The field moved out of the top bar's JSX into a memoized `GlobalSearchField` (326d1cc7), so the
// two halves this file guards now live apart: the input owns focus behaviour, `commitSearch` owns
// where a query goes. Both are matched separately, and each match is asserted non-empty first —
// a selector that quietly stops matching would otherwise assert `''` and pass forever.
const FIELD = SOURCE.match(/const GlobalSearchField = memo\(([\s\S]*?)\n\}\);\n/)?.[1] ?? '';
const COMMIT = SOURCE.match(/const commitSearch = useStableCallback\(([\s\S]*?)\n {2}\}\);\n/)?.[1] ?? '';

describe('Media Center global search focus', () => {
  it('navigates on a query edit, never on focus alone', () => {
    expect(COMMIT).not.toBe('');
    expect(FIELD).not.toBe('');
    expect(FIELD).not.toContain('onFocus=');
    expect(COMMIT).toMatch(/media\.setQuery\(next\);[\s\S]*tab !== 'library'[\s\S]*setTab\('library'\)/);
    expect(COMMIT).toContain("if (tab === 'music') music.setQuery(next)");
    expect(COMMIT).toContain("else if (tab === 'discover') discovery.setQuery(next)");
  });

  it('keeps typing off the shell reconcile path, and lets Discover opt out', () => {
    // The field holds its own in-flight text and commits on a timer; committing every keystroke
    // to `useMedia` re-rendered the whole Media Center (worst input 85.1 ms against a 100 ms bar).
    expect(FIELD).toContain('useState(value)');
    expect(FIELD).toContain('setTimeout');
    // Discover submits on Enter through a useCallback over its own `query`, so a deferred commit
    // would hand `submitQuery` the text as it stood one character ago.
    expect(SOURCE).toContain("deferMs={tab === 'music' || tab === 'discover' ? 0 : GLOBAL_SEARCH_COMMIT_MS}");
    expect(FIELD).toMatch(/if \(deferMs <= 0\) \{\s*commit\(next\);/);
    // Enter flushes before submitting.
    expect(FIELD).toMatch(/event\.key !== 'Enter'[\s\S]*cancel\(\);\s*commit\(text\);\s*onEnter\(\)/);
  });

  it('keeps shared Media actions at the 32px Liquid hit floor', () => {
    const rule = CSS.match(/\.mc-button \{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/min-height:\s*32px/);
  });
});
