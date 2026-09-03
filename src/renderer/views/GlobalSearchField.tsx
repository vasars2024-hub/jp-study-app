/**
 * The Media Center top bar's global search field, extracted from `MediaCenterView.tsx`.
 *
 * It lives in its own module for one reason, and it is a testing reason stated plainly:
 * the 70 ms deferred-commit race below is a BEHAVIOUR, and the only guard it had was a
 * set of regexes over `MediaCenterView.tsx`'s source text (boss audit 2026-09-02,
 * Finding 4 — a spelling check, whose own "MUTATION CONTROL" string-replaced the
 * anchors out of the source it had just read and was therefore true by construction).
 * `MediaCenterView.tsx` cannot be imported into a test: it reaches `keyboardShortcuts.ts`,
 * which throws at module scope outside the app. Nothing else moved with it.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import Icon from '../components/Icons';

/**
 * A handler whose identity never changes but which always runs the latest render's closure.
 *
 * `query` lives in `useMedia`, so every keystroke in the top bar re-renders this whole view.
 * The library grid's cards are memoized (`LibraryEntryCard`), but that memo is only as stable
 * as the callbacks reaching it: `onPlay` -> `activate` -> the card's `onActivate`. An inline
 * arrow at the call site made a new identity per keystroke and invalidated the memo — and the
 * shell's `menuItems` useMemo with it. `useCallback` cannot fix this one, because the closure
 * genuinely reads values that change; the ref does.
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}

/**
 * How long the top bar's search field holds a keystroke before committing it upward.
 *
 * Paired with, not a replacement for, `useDebouncedValue(query, 80)` at `MediaContent.tsx:575`:
 * that one protects the FILTER, this one protects the JSX. 70 ms is under the 80 ms the filter
 * already waits, so committing on this schedule costs the results nothing — the filter's own
 * timer is what the user waits for either way.
 */
export const GLOBAL_SEARCH_COMMIT_MS = 70;

/**
 * The top bar's search field, memoized, holding its own in-flight text.
 *
 * `query` lives in `useMedia`, so committing every keystroke to it re-rendered the whole Media
 * Center synchronously. Measured on the Video window with the library populated: ~20-26 ms per
 * keystroke, and `/type`'s four characters are dispatched in a tight loop with no pacing, so the
 * renderer painted NO frame for the length of a burst — cat2 read a worst keystroke of 85-102 ms
 * against a 100 ms bar, and 130-146 ms on a loaded desk. The card memo (`LibraryEntryCard`) had
 * already taken out the grid's share; what was left is the shell itself.
 *
 * Local text keeps typing at the cost of this one node. The shell reconciles once per burst
 * rather than once per character, and `state.debouncedQuery` still owns what the grid filters on.
 *
 * `deferMs = 0` opts a caller out, and Discover uses it deliberately: `submitQuery` is a
 * `useCallback` over the hook's own `query` (`DiscoverContent.tsx:324`), so an Enter arriving
 * before a deferred commit had landed would submit the previous character. Music is left
 * immediate too — its cost was never measured, and a number is the only thing that earns a change.
 *
 * An external change to `value` — a clear, a tab switch — wins over in-flight text and cancels a
 * pending commit, so the field stays drivable from outside.
 *
 * `contextKey` is what makes the tab-switch half of that sentence true, and it is not decorative.
 * `value` is read per tab (`music.query` / `discovery.query` / `media.query`, three independent
 * stores at the call site), so switching between two tabs whose queries are BOTH empty hands this
 * component the same `''` twice — React compares the dep with `Object.is`, sees no change, and
 * skips the sync effect entirely. The pending 70 ms commit then survived the switch and landed on
 * the NEW tab: type in Library, switch to Discover inside 70 ms, and `discovery.setQuery` fired
 * with text meant for the library, which on Discover is a network search nobody asked for.
 * Keying on the context makes the switch itself observable, so the effect runs even when the two
 * values are indistinguishable. A `key={tab}` remount would also drop the timer, but it is wrong
 * here: `commitSearch` calls `setTab('library')` on the first query typed from another tab, so a
 * remount would tear the focused input out from under someone mid-word.
 */
export const GlobalSearchField = memo(function GlobalSearchField({
  value,
  contextKey,
  placeholder,
  deferMs,
  onCommit,
  onEnter,
}: {
  value: string;
  contextKey: string;
  placeholder: string;
  deferMs: number;
  onCommit: (next: string) => void;
  onEnter?: () => void;
}) {
  const [text, setText] = useState(value);
  const seen = useRef(value);
  const context = useRef(contextKey);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => {
    // A context switch counts as an external change even when the two values are equal —
    // that equal case is precisely the one the `value` dep cannot see.
    const switched = context.current !== contextKey;
    context.current = contextKey;
    if (!switched && value === seen.current) return;
    seen.current = value;
    cancel();
    setText(value);
  }, [value, contextKey, cancel]);

  useEffect(() => cancel, [cancel]);

  const commit = useStableCallback((next: string) => {
    seen.current = next;
    onCommit(next);
  });

  return (
    <label className="mc-global-search">
      <Icon name="search" size={13} />
      <input
        type="search"
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          cancel();
          if (deferMs <= 0) {
            commit(next);
            return;
          }
          timer.current = setTimeout(() => {
            timer.current = null;
            commit(next);
          }, deferMs);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || !onEnter) return;
          // Flush before submitting: a deferred commit still in flight would otherwise hand
          // `submitQuery` the text as it stood one character ago.
          cancel();
          commit(text);
          onEnter();
        }}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </label>
  );
});
