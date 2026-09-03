import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(resolve(__dirname, '../views/MediaCenterView.tsx'), 'utf8');
const FIELD_SOURCE = readFileSync(resolve(__dirname, '../views/GlobalSearchField.tsx'), 'utf8');
const CSS = readFileSync(resolve(__dirname, '../views/mediaCenter.css'), 'utf8');

// The field moved out of the top bar's JSX into a memoized `GlobalSearchField` (326d1cc7), so the
// two halves this file guards now live apart: the input owns focus behaviour, `commitSearch` owns
// where a query goes. Both are matched separately, and each match is asserted non-empty first —
// a selector that quietly stops matching would otherwise assert `''` and pass forever.
//
// The field then moved again, into `views/GlobalSearchField.tsx`, so that its 70 ms race could be
// MOUNTED rather than spelled — see `mediaGlobalSearchRace.test.tsx`, which is now the guard that
// actually holds the behaviour. What stays here is the half that lives at the CALL SITE and no
// mounted test of the component can see: which store the top bar hands it, and on which tabs.
// And once more, 2026-09-02: the deferred commit moved OUT of the component into
// `useDeferredText`, because a second field in the Media Center — the YouTube import URL in
// `MediaYoutubeBar` — had the identical whole-view-reconcile defect (first key 171.7 ms on
// the loaded Video window) and no reason to grow a second copy of the cure. The component
// keeps the markup and the Enter path; the hook keeps the timer, the sync effect and the
// context identity. So the assertions below are split the same way: whatever asserts on the
// deferral reads `HOOK`, whatever asserts on the field's own JSX reads `FIELD`. Nothing was
// weakened in the move — `mediaGlobalSearchRace.test.tsx` mounts the component and is the
// guard that actually holds the behaviour, and its six cases were green before and after.
const FIELD = FIELD_SOURCE.match(/export const GlobalSearchField = memo\(([\s\S]*?)\n\}\);\n/)?.[1] ?? '';
const HOOK = FIELD_SOURCE.match(/export function useDeferredText\(\{([\s\S]*?)\n\}\n/)?.[1] ?? '';
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
    expect(HOOK).not.toBe('');
    expect(HOOK).toContain('useState(value)');
    expect(HOOK).toContain('setTimeout');
    // Discover submits on Enter through a useCallback over its own `query`, so a deferred commit
    // would hand `submitQuery` the text as it stood one character ago.
    expect(SOURCE).toContain("deferMs={tab === 'music' || tab === 'discover' ? 0 : GLOBAL_SEARCH_COMMIT_MS}");
    expect(HOOK).toMatch(/if \(deferMs <= 0\) \{\s*commit\(next\);/);
    // Enter flushes before submitting: the field calls `flush`, and `flush` is the cancel plus
    // the commit of the text as it stands now.
    expect(FIELD).toMatch(/event\.key !== 'Enter'[\s\S]*flush\(\);\s*onEnter\(\)/);
    expect(HOOK).toMatch(/const flush = useStableCallback\(\(\) => \{\s*cancel\(\);\s*commit\(text\);/);
  });

  /*
   * A deferred commit must not outlive the tab that scheduled it.
   *
   * `value` is read PER TAB at the call site — `music.query`, `discovery.query`, `media.query`
   * are three independent stores. The sync effect used to depend on `[value, cancel]` alone, and
   * that is exactly blind to the case that matters: switch between two tabs whose queries are
   * both empty and React compares `''` with `''`, finds no change by `Object.is`, and never runs
   * the effect. The pending 70 ms timer survived and committed into whichever tab was now
   * current — type in Library, switch to Discover inside 70 ms, and `discovery.setQuery` fires
   * with library text, which on Discover is a network search nobody asked for.
   *
   * Raised as an unpromoted hypothesis by the 2026-09-01 boss audit and left unreproduced there
   * because it is a 70 ms race; it is settled from the dependency array instead, which is where
   * it is decidable. These cases pin the two halves that make it decidable: a context identity
   * that changes when the OWNER changes, and an effect that treats that change as external.
   */
  it('treats a context switch as an external change, not just a value change', () => {
    expect(HOOK).not.toBe('');
    // The switch must be observable independently of `value`, or the equal-value case is blind.
    expect(HOOK).toMatch(/const switched = context\.current !== contextKey;/);
    expect(HOOK).toMatch(/if \(!switched && value === seen\.current\) return;/);
    // …and the effect must actually re-run on it.
    expect(HOOK).toMatch(/\}, \[value, contextKey, cancel\]\);/);
    // Cancelling is the whole point: the pending commit belongs to the previous owner.
    const effect = HOOK.match(/const switched[\s\S]*?\}, \[value, contextKey, cancel\]\);/)?.[0] ?? '';
    expect(effect).toContain('cancel();');
    expect(effect).toContain('setText(value);');
  });

  it('keys the context on the STORE that owns the query, not on the tab', () => {
    // Home and Library both read `media.query`, so keying on `tab` would cancel an in-flight
    // commit on a switch that changes no owner at all. Keying on the store is what makes the
    // cancel fire exactly when the query it would land in is a different one.
    expect(SOURCE).toContain(
      "contextKey={tab === 'music' ? 'music' : tab === 'discover' ? 'discover' : 'media'}",
    );
    // The value expression and the context expression must partition the tabs the same way,
    // or the field can be handed one store's text while believing it belongs to another.
    expect(SOURCE).toContain(
      "value={tab === 'music' ? music.query : tab === 'discover' ? discovery.query : media.query}",
    );
  });

  /*
   * Boss audit 2026-09-02, Finding 4: this case is SELF-REFERENTIAL and is kept only as a
   * spelling check on the source it reads. It string-replaces the anchors out of the text it
   * just read and asserts they are gone, which is true by construction; it would go green on
   * any equivalent refactor and could not see the race arriving by another route.
   *
   * The real control now lives in `mediaGlobalSearchRace.test.tsx`, where the same four
   * replacements are applied to `GlobalSearchField.tsx` ITSELF and the mounted component is
   * re-driven: 2 of its 6 cases go red — "drops the pending commit when the owning store
   * changes under it" and "a switch BACK does not resurrect the dropped commit", both
   * `expected "vi.fn()" to not be called at all, but actually been called 1 times`, which is
   * the library query landing in Discover. That is the defect, observed.
   */
  it('the pre-fix effect fails the same source assertions (spelling only — see the mounted control)', () => {
    const preFix = HOOK
      .replace(/\s*const switched = context\.current !== contextKey;/, '')
      .replace(/\s*context\.current = contextKey;/, '')
      .replace('if (!switched && value === seen.current) return;', 'if (value === seen.current) return;')
      .replace('}, [value, contextKey, cancel]);', '}, [value, cancel]);');
    expect(preFix).not.toBe(HOOK);
    expect(preFix).not.toMatch(/const switched = context\.current !== contextKey;/);
    expect(preFix).not.toMatch(/\}, \[value, contextKey, cancel\]\);/);
    // And the guard the fix relies on is genuinely absent from it.
    expect(preFix).toMatch(/if \(value === seen\.current\) return;/);
  });

  it('keeps shared Media actions at the 32px Liquid hit floor', () => {
    const rule = CSS.match(/\.mc-button \{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/min-height:\s*32px/);
  });
});
