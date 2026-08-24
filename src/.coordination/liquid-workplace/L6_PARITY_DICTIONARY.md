# L6 — rubric category 6 on the Dictionary window: 10/10, and the raise that broke the round trip

Authority: `src/LIQUID_UI_RUBRIC.md` category 6. Instrument:
`probes/l6-parity-dictionary.js`, driven live through the debug bridge.

## 2026-08-17 — the category stops being capped

Every dictionary row in `parity-ledger.json` read `status: "pending"`, whose vocabulary entry
is literally *"no Liquid destination yet"*. L3.2 (`20462e3a`) shipped `Make Liquid` on this
exact window, so that reason was false and category 6 was no longer capped. **7 of 7 rows now
read `both`** — verified in standard and Liquid, each by side effect.

**Parity, both presentations, on real data (not an empty harness — the empty window scores
3/7 and that is what the cap is for).** Standard **7/7**, Liquid **7/7**, identical evidence
in every row but the one that must differ: `liquidAriaPressed` `false` → `true`.
Numbers: 3,767 chars / 341 nodes / **66 controls** in both. Features exercised *while liquid*,
not merely counted: 中文 switched JMdict → **CC-CEDICT** (3,834 → 1,533 chars, 341 → 115 nodes);
Interlinear moved the segmented control's `active` (1,533 → 1,474 chars, 115 → 101 nodes).

**Round trip.** Standard → Liquid → Standard, with the notes filter deliberately dirty
(`食`): geometry `102,60,804×568` identical, focus identical, `maximized` identical, all 66
controls, 341 nodes, 3,767 chars, `searchValue` and `notesFilterValue` identical, and after
the return the persisted `desktop-layout.json` holds **0** `presentation` keys — conventional
is the absence of the field, which is L3's stated decision holding on disk.

**Negative controls, 3 of 3 fired, each flipping exactly its own row and nothing else** (7 → 6
each time, restored to 7): notes filter detached → `notesFilter:absent`; both language buttons
made `active` → `sourceSwitch:ja.active=true zh.active=true`; `aria-pressed` stripped from the
Liquid toggle → `windowLifecycle:liquidAriaPressed=null`. A control that flipped two rows would
mean the rows are not independent observations, so that was asserted too.

## The defect this found, and the fix — commit `aaef2a84`

Category 6 scored **9/10** on the first pass and is 10/10 only after the fix, per the rubric's
"re-score after the fix, not before". The single failure: the round trip was not byte-for-byte.
Everything matched except `style.zIndex`, **15 → 19** across two toggles.

`toggleLiquid` (`DesktopShell.tsx:1835`) carried `z: ++zTop.current`. Two things made that
wrong rather than merely redundant: the `.fwin` root already carries `onPointerDown={onFocus}`,
so the interaction that reaches the button has raised the window before the click handler runs;
and `++` inside a `setWins` updater is a side effect in a reducer, which React invokes **twice**
in development — hence +2 per command, not +1. Fixed by making the command presentation-only:
`ws.map((w) => (w.id === id ? toggleWinPresentation(w) : w))`.

After the fix, live and after a renderer reload: A === B including `zIndex` **19 → 19 → 19**,
and persisted `globalZTop` **10802 → 10802** across both toggles. The counter no longer moves.

Bound by `liquidWindowSnapshotFidelity.test.ts` › *"the toggle changes presentation and nothing
else — not even z"*. **Test negative control:** restoring the `z: ++zTop.current` literal in the
shell makes exactly that case fail (1 failed / 11 passed); the file is 12/12 with the fix, and
the shell was restored byte-identically afterwards (string compare, not by eye).

## TRAP — the instrument reported two features MISSING that both exist

The first `check()` returned 5/7 in standard: `presentationMode` "selects=0" and
`savedSearches` "savedControls=0". Both are real and both work. The mode control is three
**buttons** (Automatic / Dictionary / Interlinear) with an `active` class, not a `<select>`;
the saved-search control reads **"Save search"**, which `/saved/` does not match. That is the
rubric's named false-pass shape pointed the other way — a selector that fails to match scores
as ABSENT, indistinguishable from a real regression, and it would have been written up as two
Liquid parity failures. **Enumerate the surface's actual controls before writing a predicate
about them**; the dump that settled it is one eval over `querySelectorAll('button,input,select')`.

## Still open on this surface

Category 6 is 10/10; the scorecard needs eight. `LIQUID_SCORECARD.md` stays empty deliberately —
one scored category out of eight is not a scorecard, and the L1 passes on categories 1, 2, 4, 5
and 8 were measured on the **pre-Liquid** window and are stale by the rubric's own rule. The
keyboard route on the search input is still recorded UNPROVEN in every row (a synthetic Enter
did not trigger a search); that belongs to category 1, not here, and was not touched.

## 2026-08-24 · primary — re-driven on the current tree, in the boot every other category shares

The 10/10 above was earned at `aaef2a84`; `e4de125b` and `6f86f2cc` have moved CSS since, and the
rubric forbids carrying a score across a change. Re-measured on a cold boot of this tree — main
pid **9932**, `npm start` → bridge **16.1 s**, `l7d-setup.cjs` asserting exactly **1** visible
`.fwin`: Dictionary, `presentation=liquid`, 食べる → **8 entries / 5,247 chars / 346 nodes /
75 controls**, `820x580`, `forest-night`.

| Term | Measured |
| --- | --- |
| Parity, Liquid | **7 / 7** reachable |
| Parity, Standard | **7 / 7** reachable, identical evidence in six rows |
| The row that must differ | `windowLifecycle` `liquidAriaPressed` **true → false** |
| Ledger rows `both` with non-empty `observed` | **7 / 7** (`parity-ledger.json`, `app: dictionary`) |
| Round trip | Liquid → Standard → Liquid, **A === C byte-for-byte** by string compare |

The round trip was run with the notes filter deliberately dirty (`食`, restored to `""` after), so
it carries real state rather than an empty one: `rect 60,24,827×584`, `maximized false`,
`focused true`, **`zIndex "118"` unchanged across both toggles** — the `aaef2a84` fix holding —
`searchValue 食べる`, `notesFilterValue 食`, `controls 67`, `resultChars 5180`, `resultNodes 346`.

**Three negative controls, 3 of 3 fired, each flipping exactly its own row and nothing else**
(`probes/l6f-controls.cjs` asserts that as a boolean, not by eye): notes filter detached →
6/7 `notesFilter (absent)`; both language buttons `active` → 6/7 `sourceSwitch (ja.active=true
zh.active=true)`; `aria-pressed` stripped → 6/7 `windowLifecycle (liquidAriaPressed=null)`. Each
restored to 7/7 before the next.

Direction of the round trip differs from `aaef2a84`'s: the window is found **liquid** on this
tree, so it is Liquid → Standard → Liquid and it is left as found. The on-disk half of that entry
(conventional persists as the *absence* of a `presentation` key) is therefore **not** re-asserted
here and is not folded into this score.

**Category 6 = 10/10 on this tree**, commit `PENDING-C6`.
