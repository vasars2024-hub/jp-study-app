# V6 — the Grammar Explorer's virtualisation, settled with a mechanism

**Run:** 2026-08-04 by the orchestrator, fresh scratch profile. Closes the last open row in the
audit's VERIFY-FOR-ME register.

## The claim under test

P2 measured **19,443 DOM nodes** with one Grammar window open and attributed it to *"the Explorer
rendering all 2,410 rows at once because `VirtualList`'s windowing is defeated."* That was recorded
as **the agent's attribution, not verified**, precisely because an effect had been measured and a
cause inferred.

## Verdict: the effect is real. The attribution was wrong, and the correction changes the fix.

### Measured live

| | |
|---|---|
| List label | `2,410 points` |
| **Rendered rows in the DOM** | **2,410 — every one** |
| `.gram-x-list` `clientHeight` | **139,780 px** |
| `.gram-x-list` `scrollHeight` | **139,780 px** |
| Window nodes | 19,350 |

`clientHeight === scrollHeight` is the tell: **nothing bounds the container.** It is exactly as
tall as its own content, so it never scrolls and there is no viewport to window against.

### The arithmetic closes exactly

`VirtualList` (`components/VirtualList.tsx`) is textbook and **not defective**:

```
startIdx     = max(0, floor(scrollTop / itemHeight) - overscan)
visibleCount = ceil(viewportH / itemHeight) + overscan * 2
endIdx       = min(total, startIdx + visibleCount)
visible      = items.slice(startIdx, endIdx)
```

With `ROW_HEIGHT = 58` (`GrammarExplorer.tsx:61`) and `overscan = 6`:

```
139,780 / 2,410 = 58        ← the measured height is exactly rows × ROW_HEIGHT
visibleCount = ceil(139780 / 58) + 12 = 2,410 + 12 = 2,422
endIdx       = min(2410, 0 + 2422) = 2,410
visible      = items.slice(0, 2410)      ← the entire list
```

**Every line of the virtualiser executes as designed and returns the whole list**, because it was
handed a viewport the size of the content.

### The actual defect is one CSS rule

```css
.gram-x-list {          /* styles.css:7200 */
  width: 320px;
  flex: 0 0 auto;
  min-height: 0;
}
```

**No `height`, no `max-height`, no `overflow`.** `flex: 0 0 auto` means the element sizes to its
content instead of filling a bounded parent, so it expands to 139,780 px. A bounded height plus
`overflow-y: auto` would restore `viewportH` to something real and the existing windowing would
immediately do its job — roughly **`ceil(viewportH/58) + 12` rows instead of 2,410.**

## Why the distinction is the whole point of this row

The two readings send an engineer to different files:

| Reading | Where it sends you | Cost |
|---|---|---|
| *"`VirtualList`'s windowing is defeated"* | `components/VirtualList.tsx` — a shared primitive used elsewhere | rewrite a working component, risk every other consumer |
| *"the container is unbounded"* (measured) | `styles.css:7200` | one rule |

**An effect measured is not a cause established.** This session produced four near-misses of the
same shape — a still-loading list read as empty, a popped-out window read as unopenable, a sibling
container read as an empty gallery, and now a correct virtualiser read as broken. In each case the
observation was accurate and the mechanism was not.

> The general form, worth keeping: **when a component appears not to do its job, check what it was
> handed before checking what it does.** Here the input was a 139,780-pixel viewport, and no amount
> of reading `VirtualList` would have revealed that.

## Consequences for the registers

- **V6 closes.** VERIFY-FOR-ME has no open rows.
- **A new FIX row**, correctly targeted: `.gram-x-list` is unbounded, materialising 2,410 rows and
  ~19.3k DOM nodes in one window. Performance-relevant and cheap.
- **`VirtualList` is exonerated** and should not be touched.
