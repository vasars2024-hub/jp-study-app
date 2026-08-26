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

## 2026-08-25 · primary · bullet 1 gets callers, and the contract reaches all four apps

`f18d1ddb` landed `shared/liquidSelection.ts` plus two producers and the turn ended
there. **Nothing called either** — the declared-but-unwired shape this repo already
paid for with an i18n module no surface imported. Two commits close it.

**`d49d53cf` — Grammar and Translate get controls.** Grammar's sits in `GrammarDetail`,
which Blanc composes directly, so Blanc gets it in the same edit. Translate's is in
both the classic action row and the Aero toolbar and tracks the real highlighted range,
falling back to the whole input, with the label naming which of the two it will send.

**`3050f020` — the Agent's message, the fourth app.** BRANCH, not pin:
`attachAgentContextFromSurface` targets the active conversation, which is where the
message already is, so pinning changes nothing visible. `branchAgentConversationFromMessage`
forces a new one by passing a `conversationId` that does not exist yet — `null` will not
do it, `null ?? active` is the active one.

**LIVE, and this is the Gate's retention half rather than a smoke test.** One
conversation held three of the four tools' selections at once:

| id | app | sensitivity | retained |
| --- | --- | --- | --- |
| `dictionary-entry:grammar/pattern/n5-ato-de` | grammar | ordinary | true |
| `dictionary-entry:食べる` | dictionary | ordinary | true |
| `selected-text:164854a235c908fe` | translate | personal | **false** |

The false is the control: the span is the user's words, kept in session memory and
never written to disk, while the reference data beside it persists. Revision 61 → 64
over three handoffs. **The same span clicked twice left the count at 5 with one
`selected-text` id — retention, not accumulation.** The Agent branch then took it 3 → 4
conversations, new one 0 messages / 1 context item, source shelf untouched.

**Two defects the tests caught, neither visible to a presence check.**
1. `${''}: ${''}`.trim()` is `":"` — a label the contract accepts, reaching the shelf as
   a row that names nothing. Label is now joined from the parts that exist.
2. Translate's conversation TITLE carried `span.slice(0, 60)`. A title is persisted even
   when its context item is refused retention (this file's own media-cue rule), so 60
   chars of a `personal` span were the one part reaching disk. Now 40, matching the
   media-cue and VN producers rather than inventing a third bound.

**A11y measured then FIXED, not reported.** The branch control on `.agent-chip` alone was
172×19 and 19 is under the 24 px WCAG 2.2 minimum. Now 172×24, contrast 5.99:1. Grammar's
control: 209×31, contrast 7.9:1.

**Trap, and it read as a dead feature first.** React does NOT forward the native `select`
event — `onSelect` is synthesised by its SelectEventPlugin from focus plus
keyup/mouseup/selectionchange and bails unless the element is the document's active one.
A dispatched bare `select` changes nothing. Focus first, then keyup.

**Still open for L5's Gate: the feature-parity ledger rows.** `parity-ledger.json` has 21
rows over dictionary (7), mediaWorkspace (6), mediaCenter (8) — **grammar, translate and
agent have none**. Per §5.3 that is the Gate's other half. RULE 1 applies: build ONE
app-parameterised parity driver out of `probes/l6-parity-dictionary.js` (683 lines,
dictionary-hardcoded), do not write three more.

## 2026-08-25 · primary · L5's Gate closes -- three ledgers, one harness, and a dead virtualisation

**`f29b5537` -- the category-6 parity harness, RULE 1 applied.** `l6-parity-dictionary.js`
was 683 lines of two hardcoded instruments. `probes/l6-parity.js` is one engine
(`findWin/snapshot/check/step/toggleLiquid/mutate/restore`) plus a SPEC per app, so the
three apps L5 was missing cost ~40 lines of data each. **Calibration is what licenses the
new numbers:** the dictionary spec is a port of `__L6.check()`, and both instruments
returned dictionary **7/7 with per-row identical evidence strings** on the same window.

| app | standard | liquid | round trip | negative controls |
| --- | --- | --- | --- | --- |
| grammar | 8/8 | 8/8 | rect + all 4 fields identical, diff `{}` | 3, each flipped exactly one row |
| translate | 7/7 | 7/7 | chars 3688=3688, controls 29=29 | 3 (one couples 2 rows, correctly) |
| agent | 8/8 | 8/8 | nodes 351=351, controls 52=52, 8/8 fields | 3, each flipped exactly one row |

Real end-to-end, not smoke: 猫が好きです -> **"I like cats."** through local Qwen3-1.7B,
with the surface honest throughout the ~50 s cold load ("Loading model: Qwen3-1.7B.gguf — 45%").
`parity-ledger.json` 21 -> **44 rows**; every `observed` is a literal measured evidence string.

**Gate's retention half, RE-DERIVED live this turn** rather than inherited: one conversation
("What does this word mean?") holds **7 context items across 4 surfaces at once** -- 〜あとで +
Grammar, 猫が好きです + Translate, 食べる + Dictionary, Control Center -- each with its own
`Remove … from context` control. **L5's Gate is CLOSED.**

**`4e2c46e1` -- the finding the drive produced.** Grammar rendered **2,410 rows / 19,352 DOM
nodes** in an 820x580 window. `VirtualList` was there all along; a windowed list can only
window what it can MEASURE, and `.gram-view` was a plain block, so `.gram-x` grew to
139,966 px and the list's viewport measured the whole corpus. Now **18 rows / 216 nodes**,
`.gram-view` 513 px. Control run both ways live: inline `height:auto;display:block`
reproduced 2,410/19,352/139,966, removing it returned 18/216/513. Scroll to 60,000 px kept
18 rows and swapped the window (〜あとで,〜か -> ひじょうに,ひとつ).

**Four instrument false results killed, worth more than the scores.**
1. `/^Translate$/` matches the TAB, not the action -- a click that translates nothing.
2. The output pane's EMPTY state is the sentence "Translation appears here.", so "has text"
   scores a 10 with nothing translated.
3. `2,410 points` parsed with `/\d+/` is **2**; a working search scored FALSE.
4. The `search` row then required `renderedRows === count` -- true ONLY because the list was
   not windowing. **The instrument had encoded the performance bug as its pass condition.**

**Traps banked.** (a) `debug/evfile.cjs` sends no `window` field, so a harness installs into
whichever window the bridge defaults to -- with a pop-out open that is not `main`, and the
global reads `undefined` one call after it demonstrably installed. Use `debug/lq-evfile.cjs`.
(b) The previous turn's "focus, then keyup" is necessary but NOT sufficient: with
`document.hasFocus() === false` React's SelectEventPlugin constructs nothing and a live
feature reads as DEAD. **POST `/focus` first.** (c) The Agent pop-out mounts outside `.fwin`
-- no chrome, no `Make Liquid`, no `data-presentation` -- so that host has no Liquid
destination, the same fact already recorded for the seanime workspace.

## 2026-08-25 · primary · the pop-out footnote was a defect, and L5's inherited 3 are SETTLED

**The doubt, closed by reading rather than re-running.** Five burn-down lines carried "if L5's
3 bullets are not closed then closed is 15" without anyone counting. They are CLOSED: the entry
above (`f29b5537`) records dictionary 7/7, grammar 8/8, translate 7/7, agent 8/8 with round-trip
parity and three negative controls each, plus the retention half re-derived live (7 context items
across 4 surfaces in one conversation). **closed = 18, left = 28 of 46.** Do not reopen this.

**What was NOT closed is trap (c) above, and it is bigger than a footnote.** Every interior rule
in `theme/liquid-window.css` was scoped to `.fwin.fwin-liquid`. So all four L5 apps — each of
which adopted `ContextualSurface` — had that region language **permanently inert once popped
out**. Not "the pop-out lacks chrome": an enable flow whose destination did not exist.

**`6c16653f` — two hosts, one interior.** `.popout-root` now carries `data-presentation` and a
`.popout-btn-liquid` toggle; the interior rules name both hosts through `:is()`, whose
specificity is the max of its branches, so each still scores (0,2,0). The FRAME rules
deliberately do not: a pop-out's frame is the OS window, opaque with the compositor behind it,
so a `backdrop-filter` there is the inert glass the sheet already forbids on `.fwin-bar`.
Presentation persists per SECTION (a pop-out has no durable window identity) and returning
DELETES the key — measured live, `Object.keys(localStorage)` filtered on `lq.` went `[]` → blob
→ `[]`, and window bounds were 518,196 900x640 before and after.

**Category 6, Agent in its POP-OUT host — a RUN of `probes/l6-parity.js`, not a new probe.**
Trap 8 was revised in place (~14 lines): a pop-out is `host: 'popout'`, the seanime workspace is
still `chromeless`, and collapsing the two is what turned a defect into a footnote for days.

| presentation | score | chars | nodes | controls | rect | fields |
| --- | --- | --- | --- | --- | --- | --- |
| liquid | **8/8** na=0 | 3107 | 328 | 49 | 900x640 | 8/8 identical |
| standard | **8/8** na=0 | 3107 | 328 | 49 | 900x640 | 8/8 identical |

`windowLifecycle` now SCORES here (`chromeButtons=4 liquidAriaPressed=true→false`) where it was
`na: chromeless host`. The in-flight composer text (`textarea7 = "parity probe text"`) survived
the presentation change, which is the reversibility gate's actual content. Controls: `mutate`
`conversationRail` → 7/8, exactly `conversations=4 selected=0`; `contextShelf` → 6/8, exactly
`removeControls=0`; `restore('agent')` → 8/8.

**Category 4, same surface, a RUN of `debug/lq-cat4-sizes.cjs`.** Clean at both host sizes and
in BOTH presentations: 380x580 → clipped 0, overlaps 0, hScrollers 0, dead 7.1%; 1264x821 →
clipped 0, overlaps 0, dead 9.0% (bar 15%). Liquid costs ~1 point of `chromePct` (the
contextual padding) and nothing else. `RESTORED contentSize IDENTICAL: true`.

**Two traps banked.** (a) `__LQP.restore()` with NO app argument throws `unknown app
"undefined"` — a worker reading that as a failed restore leaves the surface mutated; pass the
app. (b) `lq-cat4-sizes.cjs` sent no `window` field, so `/eval`, `/focus` and `/bounds` each
resolved the FOCUSED window independently — a surface in its own window was scored only while
nothing stole foreground. `win:<target>` now pins all three; mandatory off the main window.
