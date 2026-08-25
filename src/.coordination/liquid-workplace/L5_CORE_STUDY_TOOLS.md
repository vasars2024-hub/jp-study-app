# L5 — core study tools

Log for `LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` §11 / L5. Order: Dictionary → Grammar →
Translate → Agent. Append per slice; numbers, not adjectives.

## 2026-08-25 · primary · L5's fourth stop, and the region adoption is complete

| Stop | Commit | Contextual region(s) | Deliberately NOT contextual |
| --- | --- | --- | --- |
| 1 Dictionary | (2026-08-18) | `.view-head` | results, entry prose, forms |
| 2 Grammar | `b211841f` | `.view-head` | the four mode panels |
| 3 Translate | `79ad40c2` | `.view-head` | `.tr-panes` `.tr-textarea` `.tr-output` `.tr-actions` |
| 4 Agent | `ddd97b65` | `nav.agent-rail`, `header.agent-conversation-head` | `.agent-messages` `.agent-composer` `.agent-inspector` `.agent-scope` |

**Agent is the only two-region stop, and the reason is structural, not stylistic.** The three
siblings are single-column views with one head each. The Agent is a two-pane shell, so it has the
navigation region §2.3 names first (`nav.agent-rail` — the same case `nav.medialib-rail` already
took) and the contextual tool for the selected conversation (identity, the mode select that shapes
the next request, the simple/full disclosure switch, delete).

**`aside.agent-inspector` stays plain, and that is a decision.** "Temporary inspector" IS a Liquid
role, but this one is a fixed second column carrying `AgentPipelineTerminal` and `ActivityTimeline`
— a log and a history table, which §2.3 keeps on stable opaque anchors. Named in the same assertion
as the messages, the composer and the scope footer so it reads as chosen rather than missed.

Geometry: `.agent-rail` is a flush full-height grid column, so it takes the same exception
`medialib-rail` takes (material yes, card radius/shadow/padding no), plus a container query
mirroring `agent.css`'s own — below 640px the shell stacks the rail above the conversation and the
separator has to move from the right edge to the bottom one.

Controls: swap both `ContextualSurface`s back for the plain `nav`/`header` → **3 red** including
the vacuity guard; restored **60 passed** (was 57).

**A guard hole this exposed, fixed rather than worked around.** `liquidWindowPresentation`'s
"paints nothing outside the opt-in class" splits the sheet on `}` — which hands back
`@container (max-width: 640px)` as if it were a selector, while the rule nested INSIDE the wrapper
never becomes a token at all. Filtering `@` out would have been a hole. Dropping the `@…{` opener
promotes each nested selector to a token of its own. Control: unscope the nested selector to a bare
`.agent-rail` → **1 red**.

## 2026-08-25 · primary · live acceptance of `a4c11872`, and a 1.9 s block it did not remove

Restarted (main does not hot-reload; pid 39160 predated the fix). `dict:compounds` for 猫 driven
through `/eval`, main-loop responsiveness sampled from the renderer by chained
`window.api.ankiLinkState()` round trips.

**WARM, second boot:** idle control **13,682 beats / 3 s, max 13 ms, p95 0**. Under load: wall
**209 ms**, **max main-loop gap 66 ms** over 1,863 samples, p95 1 ms, **12 compounds** (子猫 … 猫舌).
The windowing is live in the running app and warm behaviour is good.

**COLD, first query after boot — this is the finding.** Reproduced on two separate boots:
max main-loop gap **2,035 ms** (wall 3,711) and **1,912 ms** (wall 3,416), p95 8-10 ms both times.
One long block, not many.

**It is not the database open.** Third arm added specifically to falsify that: `dict:listPairs` →
`listDictionaryPairs(db = dictionaryDb())` forces the open of the 537 MB file and
`migrateDictionaryDb`, both synchronous on first use — **9 ms wall, 9 ms max gap, 6 pairs**. The
compound call that followed it on the same boot still blocked **1,912 ms**.

**Attribution settled, and it is the scan.** The rival explanation was contention with boot work —
the idle control right after boot itself shows max gaps of 318-501 ms. Falsified by measuring on a
fourth boot with main fully SETTLED first: idle **18,256 beats / 3 s, max gap 17 ms, p95 0**, and
the first compound query then still blocked **1,781 ms** (wall 2,731). Main was quiet; the scan was
not.

## 2026-08-25 · primary · the window is sized by its clock now, and one cold cost survives it

`HEADWORD_SCAN_CHUNK_ROWS = 5000` is a ROW budget and a row budget cannot bound time — what varies
between the out-of-process rig (47.9 ms worst window) and the running app (1,781-2,035 ms) is page
residency per row. `nextHeadwordScanChunk` (`shared/lexiconCompounds.ts`, pure and exported so the
sizing is testable without a database slow enough to exercise it) halves the window on an overrun
of `HEADWORD_SCAN_WINDOW_TARGET_MS = 24` and doubles it only when a window came in under half the
target, floored at 250 and capped at the measured 5,000. Asymmetric band on purpose: a controller
that grew whenever it was merely under target alternates between overshooting and correcting.

**Live A/B, same condition on both sides — settled main, no eviction, first query after boot:**

| | max main-loop gap | wall | compounds |
| --- | --- | --- | --- |
| before (`a4c11872`, fixed 5,000) | **1,781 ms** | 2,731 ms | 12, 子猫 … 猫舌 |
| after (adaptive) | **99 ms** | 294 ms | 12, 子猫 … 猫舌 |

Identity preserved: same count, same first and last. Tests 20 → 23 in
`shared/__tests__/lexiconCompounds.test.ts`.

**AND A COLD COST THIS DOES NOT REMOVE — say so rather than claiming the win.** Re-run after
`tools/evict-file-cache.ps1 -TargetGb 8` (standby 2,452 MB before and after; 48 files, 2 passes),
on its own boot: **max gap 2,144 ms, wall 3,745 ms**. So roughly 2 s of cold cost is NOT in the
windowed scan and the windowing cannot subdivide it. The prime suspect is the cold SQLite open of
the 537 MB file plus `migrateDictionaryDb`, which the earlier 9 ms `dict:listPairs` arm did NOT
clear — that arm ran on a non-evicted boot, so its pages were already resident.

**The exact next measurement, so nobody re-derives the setup:** evict, restart, then run
`debug/l5-dictopen-mainloop.ps1` — its ARM 2 (`dict:listPairs`) isolates the cold open, and ARM 3
then reports what the scan costs with the handle already open. If ARM 2 carries the ~2 s, the open
is the defect and belongs off the main loop, not in this scan.

**Trap paid, and it invalidated a first measurement.** `debug/gate9-mainloop.ps1`'s heartbeat paces
itself with `setTimeout(tick, 20)`. Run here it produced an idle control of **4 beats in 3 s** —
~1 Hz — because Chromium throttles timers in an occluded page even while Electron still reports
`focused: true`, and under that instrument the load arm read a meaningless **7,624 ms**. Chaining
the next round trip straight off the previous one's `.then` is not a timer and is not throttled:
the same 3 s then yields 13,682 samples. Adapted probes: `debug/l5-compound-mainloop.ps1`,
`debug/l5-dictopen-mainloop.ps1`.

**Second trap, in the same probe.** `dict:lookupTermOffline` is NOT a SQLite read — it resolves
through `lookupOfflineDeinflected`, the legacy Yomitan maps, and never calls `dictionaryDb()`. Its
31 ms said nothing about the open it was labelled as forcing. `dict:listPairs` is the cheap call
that actually forces it.
