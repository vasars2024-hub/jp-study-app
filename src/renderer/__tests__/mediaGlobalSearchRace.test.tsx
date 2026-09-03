// @vitest-environment jsdom
/**
 * The 70 ms deferred commit must not outlive the tab that scheduled it — MOUNTED.
 *
 * Boss audit 2026-09-02, Finding 4: this race was guarded only by regexes over
 * `MediaCenterView.tsx`'s source text, and that guard's own "MUTATION CONTROL"
 * string-replaced the anchors out of the source it had just read, so it was true
 * by construction. It would go green on any equivalent refactor and could not see
 * the race arriving by another route.
 *
 * These cases render the real component, type into the real input, switch
 * `contextKey` the way the top bar does, and advance real timers. They assert on
 * `onCommit` calls — the thing that becomes `discovery.setQuery` at the call site —
 * not on how the component is spelled.
 *
 * The equal-value case is the whole point: Library and Discover are both empty,
 * React compares `''` with `''` by `Object.is` and sees no change, so a sync effect
 * keyed on `value` alone never runs and the pending timer survives the switch.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GlobalSearchField, GLOBAL_SEARCH_COMMIT_MS } from '../views/GlobalSearchField';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

/** Renders the field the way the Media Center top bar does. */
function render(props: { value: string; contextKey: string; onCommit: (next: string) => void }) {
  act(() => {
    root.render(
      <GlobalSearchField
        value={props.value}
        contextKey={props.contextKey}
        placeholder="Search"
        deferMs={GLOBAL_SEARCH_COMMIT_MS}
        onCommit={props.onCommit}
      />,
    );
  });
}

function input(): HTMLInputElement {
  const el = host.querySelector('input');
  if (!el) throw new Error('the field did not render an input');
  return el as HTMLInputElement;
}

/** A real keystroke: React listens through its own delegated `change` handler. */
function type(text: string) {
  const el = input();
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('the deferred commit belongs to the tab that scheduled it', () => {
  it('POSITIVE CONTROL: with no switch, the commit does land after 70 ms', () => {
    const onCommit = vi.fn();
    render({ value: '', contextKey: 'media', onCommit });
    type('naruto');
    expect(onCommit).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(GLOBAL_SEARCH_COMMIT_MS);
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('naruto');
  });

  it('drops the pending commit when the owning store changes under it', () => {
    // Both queries are EMPTY, which is the case a `[value]`-only dep is blind to.
    const onCommit = vi.fn();
    render({ value: '', contextKey: 'media', onCommit });
    type('naruto');
    // Inside the 70 ms window, the user switches Library -> Discover. The call site
    // hands the field the new store's query, which is also ''.
    act(() => {
      vi.advanceTimersByTime(30);
    });
    render({ value: '', contextKey: 'discover', onCommit });
    act(() => {
      vi.advanceTimersByTime(GLOBAL_SEARCH_COMMIT_MS * 4);
    });
    expect(onCommit).not.toHaveBeenCalled();
    // …and the field shows the new owner's query, not the abandoned text.
    expect(input().value).toBe('');
  });

  it('still resyncs on a plain value change with no switch', () => {
    const onCommit = vi.fn();
    render({ value: '', contextKey: 'media', onCommit });
    type('naru');
    render({ value: 'cleared-from-outside', contextKey: 'media', onCommit });
    act(() => {
      vi.advanceTimersByTime(GLOBAL_SEARCH_COMMIT_MS * 4);
    });
    expect(onCommit).not.toHaveBeenCalled();
    expect(input().value).toBe('cleared-from-outside');
  });

  it('a switch BACK does not resurrect the dropped commit', () => {
    const onCommit = vi.fn();
    render({ value: '', contextKey: 'media', onCommit });
    type('naruto');
    render({ value: '', contextKey: 'discover', onCommit });
    render({ value: '', contextKey: 'media', onCommit });
    act(() => {
      vi.advanceTimersByTime(GLOBAL_SEARCH_COMMIT_MS * 4);
    });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('unmounting mid-flight commits nothing', () => {
    const onCommit = vi.fn();
    render({ value: '', contextKey: 'media', onCommit });
    type('naruto');
    act(() => root.unmount());
    act(() => {
      vi.advanceTimersByTime(GLOBAL_SEARCH_COMMIT_MS * 4);
    });
    expect(onCommit).not.toHaveBeenCalled();
    // Re-created so `afterEach`'s unmount is not a double unmount.
    root = createRoot(host);
  });

  it('deferMs = 0 commits synchronously, which is what Discover and Music opt into', () => {
    const onCommit = vi.fn();
    act(() => {
      root.render(
        <GlobalSearchField
          value=""
          contextKey="discover"
          placeholder="Search"
          deferMs={0}
          onCommit={onCommit}
        />,
      );
    });
    type('one piece');
    expect(onCommit).toHaveBeenCalledWith('one piece');
  });
});
