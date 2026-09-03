# §10.1 live baseline — Video (Media Center)

Milestone **L0-baseline-1**. Captured 2026-08-16 on `feat/nyaa-subtitles` at `c2ff442b`,
against the cold-started process from `PERF_BASELINE_RESTART.md`. Raw records:
`baselines/L0-baseline-1/video-{default,min,max}.json`. Instrument:
`tools/liquid-surface-baseline.ps1` — driven through the debug bridge, never read from source.

Video is the first surface because CLAUDE.md names `src/media/` as the architectural reference
for Liquid composition. **Nothing here scores it.** L0 records what is true before any Liquid
code exists; the rubric run is L4's job.

## Geometry, at the three sizes §10.1 asks for

| Size | Box | Focusable | Focus-order inversions | Named routes | <24 px | <44 px | Past frame | **Unreachable** | Scrollers | DOM nodes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Default (as opened) | 1080×700 | 32 | 17 | 8 | 1 | 17 | 89 | **0** | 1 | 1,148 |
| Smallest supported | 260×170 | 26 | 13 | 6 | 1 | 23 | 153 | **27** | 1 | 1,067 |
| Maximized | 1264×765 | 32 | 17 | 8 | 1 | 17 | 87 | **0** | 1 | 1,148 |

Default size is not arbitrary: `DesktopShell.tsx:1484` gives the three Media Center sections
1080×700, clamped to the desk. Smallest is `MIN_W`×`MIN_H` = 260×170 (`:266`), reached by
driving the product's own `resizeStart`, not by writing a style.

Environment at capture: viewport 1264×821, dpr 1, `data-theme=forest-night`, **no
`data-materials` attribute**, `prefers-reduced-motion` false, `forced-colors` false.

## Finding 1 — at its own smallest supported size, the primary navigation is unreachable

At 260×170, **27 elements sit outside the window frame with no scrollable ancestor**. They
include the Media Center rail itself: `Media Center` (`mc-nav`), **All local media (Ctrl+2)**,
**Immersion player (Ctrl+3)** — the currently active destination — and **Listening room
(Ctrl+4)**. `mc-root` also clips **124 px horizontally**.

At 1080×700 and maximized the same count is **0**. This is not "the window is small", it is
that shrinking to the size the shell itself permits removes navigation with no route back to
it except resizing.

**Why `unreachable` and not `pastWindowFrame`:** the first version of this metric counted every
box extending past the window and reported **89 overflowing elements on a healthy surface** —
all of them ordinary content inside a legitimate scroller. Split by whether a scrollable
ancestor exists, the healthy sizes read 0 and the real defect stands out. A raw overflow count
here is noise, and would have been recorded as a finding.

## Finding 2 — the reference surface is in a degraded state, verbatim

Two state blocks are rendered at default size, both `mc-video-empty`:

> **Video playback needs the media server** — The built-in player was removed. Enable the media
> server to watch and study video.

> **Choose what to watch** — Open a local video, browse a folder, or choose a title from your
> library. · `Select a video` · `Browse folder`

This is an **honest** degraded state — it names the cause and offers actions — and it is what
the Liquid architectural reference renders with no media server enabled. Recorded because L4
must not be scored against this and called complete: the transport, timeline and word-panel
surfaces the concept image shows **are not on screen in this state**, so any measurement of
them needs a real clip loaded first.

**The keyword state-detector returned all-false on this exact screen** in its first run. A
phrase list only recognises phrases someone thought of, and "needs the media server" was not
one. The record now carries the **verbatim text** of every state block next to the booleans, so
a reader sees the state even when the regex misses it. Treat `states.*` as a hint; `stateBlocks`
is the evidence.

## Routes and controls

8 named routes at default size, 6 of them the rail's keyboard-addressable destinations —
`Your media at a glance (Ctrl+1)`, `All local media (Ctrl+2)`, `Immersion player (Ctrl+3)`
(active), `Listening room (Ctrl+4)`, `Mine and review (Ctrl+5)`, `MAL + AniList (Ctrl+6)` —
plus the `Browse` and `Library status` labels. Focusables by role: **28 button, 2 input,
2 select**. Two of these routes drop out entirely at minimum size (8 → 6).

**Hit targets:** one control under 24 px in any axis at every size — the library search input at
**248×19**. Under 44 px: **17 of 32** at default, **23 of 26** at minimum.

**Focus order: 17 inversions of 32, measured as DOM order vs top-then-left reading order banded
to 8 px. Recorded as a number, NOT as a defect.** The method flags every DOM/visual mismatch
including conventional ones — the four title-bar controls lead the DOM at top-right, and
absolutely-positioned overlays never match reading order. Classifying which of the 17 are real
belongs to rubric category 1, with the per-control `focusOrder.domOrder` array in the JSON as
its input. Quoting 17 as an accessibility failure now would be exactly the kind of unclassified
number the rubric forbids.

## Harness note — a restore that was not a restore

The first version of this script restored geometry by writing `w.style.width` directly. It
reported "byte-identical to entry: True" and was wrong: the inline style is not the committed
state. `desktop-layout.json` held the **260×170** the `min` capture had committed, and the next
run measured a window React already believed was at minimum — capturing three identical
"sizes" while claiming three. Restore now drives `resizeStart`/`onPatch` like a user, and
verifies through a maximize/restore round trip, which forces React to rewrite width and height
from state so the box that is read back *is* the state.

That verification immediately earned its keep: the restore landed **1080×687, not 1080×700**,
and the script **warned instead of claiming success**. The desk clamps height to
`deskH - taskbarH - win.y - 2` = 687, so a window opened at y=84 cannot be resized back to the
700 it was *created* with. The Video window did not exist at boot — it was opened for this
capture — so it is closed at the end of the turn and the layout returns to its boot state
(`scraper`, `anki`).

## Still open for §10.1

- The other 20 root components (see `CENSUS.md`) — the instrument is generic; each needs a run.
- Loading / offline states: not rendered during this capture, so not recorded. A state that is
  not on screen is absent from the record rather than assumed present.
- Alternate routes into this surface (`player`, `music` open the same `MediaCenterView` with a
  different `initialTab`) — captured as one component here, per the census's ledger-row rule.
- ~~Playing-clip measurements, including player frame stability, which needs a real clip.~~
  **Player frame stability CLOSED 2026-09-03** — `PERF_BASELINE_PLAYER.md`. A real clip was
  loaded (JoJo 39-END RAW over the sidecar directstream) and measured in `#media-workspace`,
  which is where playback actually happens; `.mc-video-page`, the surface this file records, is
  the launcher. The rest of the playing-clip measurements stay open.
