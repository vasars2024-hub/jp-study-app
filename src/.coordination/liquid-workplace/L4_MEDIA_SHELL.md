# L4 — Media shell repair and Video pilot

Authority: `src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` §6 and §11 L4. This file is the L4
log; append, never rewrite. L4's first bullet is *"Restore/confirm the coherent Media shell
first"*, and that is what this entry is about — not the pilot's rubric run, which needs the
§6.5 acceptance matrix.

## 2026-08-17 · primary · the Video destination was a dead end on every normal machine

| Slice | Commit | What landed |
| --- | --- | --- |
| L4.1 | `c79b80fc` | `videoStageFor()` — three availabilities, three stages, one mapping |

**The defect, measured before the fix.** `seanimeStatus().kind` = **`stopped`** → availability
**`available`** → sidebar launcher `data-sidecar="available"`, **enabled**. The Media Center's
own `Video / Immersion player` destination nevertheless rendered *"Video playback needs the
media server — The built-in player was removed. Enable the media server to watch and study
video."* It told the user to enable something the same window reported as present, and offered
no route to the player it named.

**Why it survived.** The sentence was correct when it was written: the Video tab was hidden
whenever the workspace existed (`legacyMediaTabsHidden`, `8acf1723`). **`f258ef77` deliberately
un-hid it** — "Seanime is an explicit, availability-aware handoff … it does not hide local Video
or Library navigation" — and the copy did not follow. The stale claim is still quoted in
`MediaWorkspaceSectionView.tsx:61` ("hides its own legacy Video and Library tabs on the same
answer"); it is a comment, so it is recorded here rather than chased.

**The fix.** `videoStageFor(availability)` in `renderer/mediaWorkspaceAvailability.ts`, beside
the rule it derives from: `available` → `workspace`, `pending` → `connecting`, `unavailable` →
`needs-server`, which keeps the `SEANIME_SIDECAR=0` rollback copy **verbatim**. The available
copy deliberately does not claim the server is *running* — `available` only means the sidecar is
not `disabled`, and the host renders stopped/starting/offline/failed itself.

**Live acceptance, same window.** Click → `.seanime-host` absent → present, *"Adopted library ·
sidecar ready"*, 3 view buttons. Close → absent again, Video tab still active, route still
offered. Reversible, nothing lost. Gates: **17/17**, three negative controls; one **passed green
first** — `t('…openInWorkspaceX')`, a key no catalogue has, satisfied a bare-substring assertion.
Tightened to the whole `t('…')` call. *A substring match is not a key check.*

## The "needs a real clip" blocker is CLOSED — do not re-park it

`parity-ledger.json` recorded MediaCenterView rows as unwritable because "rows need a real clip
loaded". Driven 2026-08-17 through the product's own controls: Library → `The Big O` → `Play`.

- `listMedia()` = **33** items, all `kind: video`; the Library card reads `1 titles · 2 files`.
- The handoff mounted **1** `<video>`: `blob:` src, **437 s** duration, **960×720**, resumed at
  **315 s**, `paused: false` → `readyState` 2.
- The real player chrome, not the fallback: `Previous line` / `Replay line` / `Next line`,
  two chapter seeks, intent tabs **Playback / Study / Practice / AI / More**, and a transcript
  rail of **285** cue elements carrying real Japanese (`私の名はロジャー・スミス`, `これは取引だ
  違うか？`) each with its own `Translate`. **3,772** DOM nodes in `.seanime-host`.

So §6's target composition largely EXISTS on real content. That is not a rubric pass — nothing
here scores it — but the pilot no longer has an empty-harness excuse, and rubric category 6 has
a destination to measure against.

**User data touched, stated rather than hidden:** playback advanced 315 → 328 s before it was
paused, then seeked back to **315** and left paused. Local `listMedia` positions were untouched
(ep 01 `153.699867`, ep 02 `5.987509`); the resumed position came from the adopted library.

## 2026-08-17 · primary · Open played a real clip into a pane the user could not see

| Slice | Commit | What landed |
| --- | --- | --- |
| L4.2 | `27d584a8` | a playback request carries the view to the pane that will play it |

**The defect, measured before the fix.** A readiness row's `Open` dispatches
`MEDIA_WORKSPACE_OPEN_EVENT` and nothing else, but the player lives in the **library** pane,
which is `hidden` whenever another segment shows — deliberately, since unmounting it drops the
sidecar websocket and the no-client watchdog then exits the process. So opening the one Ready
file from the Readiness segment started a real directstream nobody could see: **The Big O ep 1,
437.103 s, 960×720, `paused:false`, `muted:false`, `volume:1`, currentTime 315 → 359.96 s
unattended**, inside a pane computing `display:none` with the video box at **0×0**, the
Readiness tab still `aria-pressed=true`. Audible, invisible, no transport. Reproduced twice.

**The fix.** `setView('library')` in `bringForward`, guarded on a request that actually carries
a file — the repair already in this file for the Review handoff (`onReviewFocus`: *"without this
it would set a view the user cannot see, which reads as a button that does nothing"*), pointed
the other way. `pickLocalVideo` gets the same line; its button is in every segment's header.

**Live acceptance, after a restart.** Same route, Readiness → `Ready 1` → `Open`: box **0×0 →
1264×821**, tab **Readiness=true → Library=true**, 550 controls, active cue 6:35 matching
t=395.878. Reversible and lossless: back to Readiness hides the pane with its **559** controls
still mounted, return to Library restores **395.878722 exactly**, still paused.
Controls: removing `setView` → the 2 "switches to Library" cases fail; making it unconditional →
the "no file must not move the segment" case fails. **13/13** with both in place; the same 13
pass at `27d584a8` in a detached worktree, so the HEAD+edit blob is self-consistent.

**TRAP — an HMR'd module does not replace a live mount-effect closure.** `bringForward` is
created inside a `[]`-dep effect. Six `[vite] hot updated: /src/media/MediaWorkspaceHost.tsx`
lines landed and the listener kept its mount-time closure, so the first "after" measurement was
of the OLD code and read as a fix that did not work. **Reload the window before scoring anything
registered in a mount effect** — the main-process restart rule, one layer up.

**Parity ledger.** `parity-ledger.json` goes 7 rows → **11**: four `mediaWorkspace` rows, each
with a literal `observed`. All four are `pending` — the status means *no Liquid destination yet*,
which is still true of this surface. The `notWritten` block now lists what of §6.4 is
deliberately undriven rather than letting four rows read as the inventory.

## Open, in order

1. §6.5 acceptance views 1–10 and the first `LIQUID_SCORECARD.md` entry. None exists yet.
2. `parity-ledger.json` rows for the player, now writable — §6.4's inventory is the row list.
3. `MediaWorkspaceCompatibilityView` (`AppSection.tsx:15`) is exported and **imported by
   nothing**, so `MediaWorkspaceSectionView` is unreachable product code. Not deleted here:
   deletion is a separate decision with its own tests, and CLAUDE.md forbids removing a feature
   as a side effect. Recorded so the next worker does not measure a surface no route reaches.
