# L1 — clunkiness on Dictionary, and the two numbers that were the harness

Authority: `src/LIQUID_UI_RUBRIC.md` **category 2**. Five numbers, and 10 requires all of them:
input cost against the Standard path, 0 dead ends, 0 modal traps, 0 scroll traps, and every input
acknowledged within **100 ms**.

Instruments: `probes/l1-clunkiness.js` + `-read.js` (cost, latency, scroll traps, open dialogs),
`probes/l1-deadend.js` + `-read.js` (dead ends, with an injected handler-less bait button).
Controls: `probes/l1-clunkiness-control.js` (instrument floor) and the bait itself.

## State driven, and it is not an empty harness

`data-theme=forest-night`, `lang=en`, viewport 1264×821, Dictionary 820×580 raised to the top of
the z-stack. **8 `.dict-entry` results for 食べる**, driven through the real search field and the
real Search button with bridge-synthesised mouse and char events — the same functional state
`L1_USE_OF_SPACE.md` and `L1_ACCESSIBILITY.md` measured. Anki, Scraper and Media were on the desk
at entry and were left there.

## The numbers

| Rubric number | Dictionary | Bar |
| --- | --- | --- |
| Dominant task cost | **2 clicks + 3 keystrokes** → 8 results | — |
| Standard-vs-Liquid cost delta | **NOT MEASURABLE** — no Liquid path exists yet (pre-L4) | equal |
| Input acknowledgement, worst | **49.2 ms** (first keystroke); clicks 0.5 / 7.2 ms | ≤100 ms |
| Inputs over the 100 ms bar | **0 of 5** | 0 |
| Search click → 8 rows painted | **161 ms** warm, **2,194 ms** on the cold first run | — |
| Dead ends | **0 confirmed of 19 driven** (17 unlabelled controls unmeasured) | 0 |
| Modal traps | **0** — no dialog opened during the flow | 0 |
| Scroll traps | **0** | 0 |

## Controls, and both of them failed first

**Instrument floor.** The first cut billed the app for `rAF_now − ev.timeStamp` and reported click
latencies of **130 ms and 183 ms**, over the bar. Five clicks on a genuinely inert `p.muted`,
repainting nothing, then read **154.1 / 355.9 / 187.3 / 76.9 / 22.8 ms** — three over the bar on a
no-op. `ev.timeStamp` is set where the event is *created*, and a bridge click is created in the
**main** process, so the number contains the main→renderer hop. Rebuilt on renderer-side receipt →
acknowledging paint: the same inert clicks now read **0.2 / 78.3 / 0.4 / 0.3 / 17.7 / 0.3 ms**,
**0 over bar**, while their discarded `stampMs` on the identical events read **47–260 ms**. Only
that rebuild licenses the 49.2 ms above.

**Dead-end discrimination.** A handler-less `<button>` was injected into the window and driven
exactly like the rest. It was reported `changed: false` — the probe catches a dead control. It is
removed by `-read.js` (`baitRemoved: true`, re-verified absent).

## Three false positives this probe produced, all killed

1. **42 dead ends out of 45.** The first sweep resolved all 46 element references up front, then
   clicked them in order. Target 2 was `中文`, which switches the dictionary language and **wipes
   the result list**, so the 43 result-row controls after it were clicking detached nodes. Fixed by
   re-resolving each target by label immediately before its click and reporting `gone` rather than
   "dead", and by moving mode/view switchers out of the sweep order.
2. **4 scroll traps.** All four were `span.sr-only` — screen-reader text clipped *on purpose*.
   Counting them penalises the surface for being accessible. Excluded by the clip-rect signature,
   not by class name.
3. **125.3 ms on the first keystroke.** An artifact of `/type` sending 食べる as three char events
   in ~0 ms, which React batches into one paint. Re-driven one character per bridge call — a human
   pace — the same three keystrokes read **49.2 / 39.1 / 34.5 ms**.

A fourth was caught before it was written down: the sweep's two dead-end candidates,
`Forget this explanation` and `Automatic`, both re-drove with an effect when targeted individually
(`changed: true` ×3). `Automatic` had simply been the already-selected tab when the sweep reached
it — an honest no-op. Neither is a defect.

## Score: category 2 is NOT a 10, and not for a defect

Nothing measured is over a bar. It is not a 10 because **two of the rubric's five numbers were not
obtained**:

- **17 of 36 driven controls are `(unlabelled)`** and the label-based resolver cannot tell them
  apart, so their dead-end status is unmeasured. A 0 covering 19 controls is not a 0 covering 36.
  Next: resolve by DOM path rather than by label.
- **The Standard-vs-Liquid cost comparison has no second term.** No Liquid presentation exists to
  compare against until L3/L4, so this number is structurally unavailable at L1 rather than
  failing. It is named here so the L4 re-score knows it is owed.

Also banked, deliberately not fixed here: the sweep skipped **18 controls that write real user
data** (`+ Add to Anki` ×8, `mark it Learning` ×8, `Save search`, `Star this word`). The very first
run, before the `mark it` rule existed, clicked eight `mark it Learning` buttons — study state was
moved on eight 食べる-family words. Restored to Japanese mode and re-searched; the rule now names
them. Driving those safely needs a scratch profile, which is its own slice.

## Traps for the next worker

- **The Dictionary sits UNDER Media in the z-stack.** Its Search button is at 894,220 by
  `getBoundingClientRect`, and a bridge click there hits `HEADER.medialib-browser__head`. Raise it
  first by clicking its exposed left strip (145,300), then re-read the button's box — it also
  **moves to 884,220** once `Save search` appears, so never reuse a cached coordinate.
- **`.dict-entry` reads 0 while the results are plainly on screen** if the result view is on the
  Interlinear tab. Check the `Automatic`/`Dictionary`/`Interlinear` tab state before concluding a
  search failed; `/logs?level=error` was **total 0** throughout.

## 2026-08-22 · backup · the second term arrives — Standard vs Liquid, on the same window

The entry above records the Standard-vs-Liquid cost delta as **NOT MEASURABLE**, "structurally
unavailable at L1 rather than failing… named here so the L4 re-score knows it is owed." L3.2
shipped the presentation toggle, so it is owed no longer. One window, one session, one search
(食べる), driven both ways through real bridge mouse and char events at a human pace
(`debug/l4c-clunk1.cjs`; `l1-clunkiness.js` + `-read.js` do the counting, so the cost comes from
capture-phase listeners rather than from the driver's intent).

| Rubric number | Standard | Liquid | delta | Bar |
| --- | --- | --- | --- | --- |
| Dominant task cost | **2 clicks + 3 keystrokes** | **2 clicks + 3 keystrokes** | **0** | equal |
| Results returned | 8 | 8 | 0 | — |
| Worst input ack (`recvMs`) | **42.2 ms** | **40.8 ms** | −1.4 | ≤100 ms |
| Inputs over the 100 ms bar | **0 of 5** | **0 of 5** | 0 | 0 |
| Search click → 8 rows painted | **177 ms** | **155 ms** | −22 | — |
| Scroll traps | **0** | **0** | 0 | 0 |
| Modal traps / open dialogs | **0** | **0** | 0 | 0 |

The field is emptied through the product first (click, Ctrl+A, Delete, read back `""`) so both
runs start cold; `entriesAtArm` is reported so a run that never actually re-searched is visible.
`stampMs` is recorded and **not scored** — on these same events it reads 49.7/75.6 ms in Standard
and 40.8/65.1 in Liquid, which is the main→renderer hop, not the app.

**The negative control fired, this session, in Liquid.** `l1-deadend.js` injected its
handler-less `Probe control` button into the window and drove it exactly like the other 34
targets: reported `changed: false`, then `baitRemoved: true` and re-verified absent. A 0 from a
probe that has not failed once is void; this one has.

**Dead ends in Liquid: 3 candidates of 35 driven, none a defect.** `Search` (clicked with the
query already showing — an honest no-op), `Automatic` (the already-selected lens, the same
no-op the 2026-08-16 entry documented), and `Play 食べる`, which also appears in `withEffect` —
a duplicate label resolving to a different instance, i.e. the resolver, not the app. 26 controls
skipped **by name and reported**: 5 window chrome, 2 mode switches driven in their own pass, 18
that write real user data, 1 honestly disabled `Save note`.

**Category 2 is still not a 10, and the reason has narrowed to exactly one.** The
Standard-vs-Liquid term is now measured and equal. What remains is the same instrument gap:
**16 of 35 targets are `(unlabelled)` and resolve to `gone`**, so their dead-end status is
unmeasured — a 0 covering 19 controls is not a 0 covering 35. Next: resolve targets by DOM path
instead of by label. That is a probe change, not a product change.

**Left as found:** the sweep's own pass ends on the Interlinear lens with `.dict-entry` at 0,
which reads exactly like a failed search — it is not. Restored to `Automatic`, 8 entries, bait
absent, presentation `liquid`. No skipped control was driven, so no user data moved.

## 2026-08-24 · primary · the 16 `gone` targets were writes, and the bait that failed to fail

The gap this entry closes was "16 of 35 targets are `(unlabelled)` and resolve to `gone`… a probe
change, not a product change." It was a probe change. It was also hiding two more.

**Fix 1 — identity.** Re-resolution matched `label(el) === name`, but `label()` returned `''` for an
icon-only button while the roster stored the display fallback `'(unlabelled)'`, so those 16 could
never match. Ported `l8-dead-controls.cjs`'s identity: `label|tag|type|firstClass` + the ordinal
among **all** painted controls (the old occurrence index counted kept targets while indexing the
live list, which holds the skipped ones too), with a class-only fallback. Result: `gone` **16 → 0**.

**Fix 2 — `label()` never read `title`, and the 16 were destructive.** They are 8 × `Copy to
clipboard history` and 8 × `Save to Flashcards`, both writing real user data, both invisible to the
DESTRUCTIVE rule because they had no name. The first run with fix 1 clicked all sixteen: **6 words
into `jp-saved-words-ja` and 8 rows into `jp-clipboard-history`** (the two 食べる entries share a
word, so the second star toggled the first back off). Undone and verified: saved back to the single
pre-existing `飲む`, clipboard **117 → 109**, 0 stars `on`.

**Fix 3 — `signature()` was blind to exactly the effect those buttons have.** It compared text,
control count, entry count, aria state and scroll. A star flipping `class` to `…on` and `title` to
`Saved to Flashcards` moves none of them, so **16 real writes read `changed: false`** — they were
reported as dead ends. Class, title and aria-label are now in the signature, plus open/expanded.

**Fix 4 — quiescence, because the bait reported `changed: true`.** By the time the injected
handler-less button was driven, `Explain again` and `Find example sentences` had async work in
flight and the window was moving on its own. Each target now waits for two consecutive identical
signatures before its `before` is taken; a target that never settles is `unstable`, not judged.

**Tried and BACKED OUT: the paired-undo pass.** `Save to Flashcards` is a toggle, so driving it and
clicking back looked safe. It reported **restored 2 of 8** and left four more words in the store. A
focused re-run at undo delays 80/260/600/1200 ms showed the undo click landing before the entry
re-renders (`title` still `Save to Flashcards`, `on` still false at undo time) — it races the render.
Backed out; a `savedStoreUntouched` tripwire now fails the run instead of the reader.

| Number | Before | After |
| --- | --- | --- |
| Coverage (verdicts / driven) | 19 / 35 | **20 / 20**, `gone` 0, `unstable` 0 |
| Targets named `(unlabelled)` | 16 | **0** |
| Roster / skipped by name with reason | 61 / 26 | **64 / 43** |
| Negative control (injected bait) | `changed:true` — VOID | **`changed:false`** |
| `savedStoreUntouched` | not measured | **true** |
| Resolved by live / key / class | — | 5 / 15 / 0 |

**The L8-banked one-way finding is CLOSED and it was not a defect.** All 7 `Play <word>` controls
that become `No recording for this word` come back `disabled: true` — `WordAudio.tsx:109` disables
`none` and `loading` deliberately, and the surface stopped offering them honestly.
`oneWayCandidates` is **0**.

**Category 2 is still not a 10, and the reason is now one measured product defect.** Dead ends
**4 of 20**, three of which are honest already-in-that-state no-ops: `Search` (query already shown),
`Automatic` (already-selected lens), `食べる` (a `.dict-saved-search` chip for the current query).
The fourth is real: **`Explain again` produces nothing at all.** Driven alone, quiesced, read at
+200/+800 ms: region stays 1,761 chars, buttons unchanged, no loading state, no error, no refusal.
`jp-study-local-agent-settings-v1` is `enabled:false` with `modelFileName:""`, so there is no model
to re-ask — and the control says so nowhere. `Explain this word` fills the panel in <200 ms from
the local cache, so the surrounding feature is alive; only the re-ask is silent. That is a
category-2 dead end and a category-8 missing state, and it is a product fix, not a probe fix.
