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

## Open, in order

1. §6.5 acceptance views 1–10 and the first `LIQUID_SCORECARD.md` entry. None exists yet.
2. `parity-ledger.json` rows for the player, now writable — §6.4's inventory is the row list.
3. `MediaWorkspaceCompatibilityView` (`AppSection.tsx:15`) is exported and **imported by
   nothing**, so `MediaWorkspaceSectionView` is unreachable product code. Not deleted here:
   deletion is a separate decision with its own tests, and CLAUDE.md forbids removing a feature
   as a side effect. Recorded so the next worker does not measure a surface no route reaches.
