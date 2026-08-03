# Phase 3 Seanime integration — closure state

> **CORRECTION, 2026-07-30 — this document overstates its scope and one of its
> claims has no surviving evidence.** `docs/migration/NEXT_SESSION.md` and
> `docs/migration/CURRENT_STATE.md` are authoritative for Phase 3, and both say
> the "Phase 3 closed" records refer only to the entry adoption and the real-cue
> player seam (`dd2ca47` / `cfd05fa`), not to the plan's full acceptance path.
> Specifically:
>
> - **The visual proof cited below does not exist.** `debug/shots/win1-1785266468396.png`
>   is absent, and `debug/shots/` holds nothing from before 2026-07-29.
> - **The microphone claim is therefore unsupported.** "Shadowing recorded from the
>   approved microphone" is contradicted by `docs/migration/progress.json`, whose
>   `phase3PracticeAndContinuity.runtimeNotClaimed` has listed *microphone hardware
>   recording* as not claimed the whole time. Treat the hardware proof as owed until
>   a run is recorded under `docs/migration/proof/`.
> - **The mining/restart claim was genuinely owed and is now met**, but by a later
>   run, not this one: see `docs/migration/proof/gplay-20260730/`. The
>   2026-07-28 mine stored both media files in Anki and **the note referenced
>   neither** — the gap that `appendUnreferencedMediaToFields` was written to close.
> - The test counts below (256 files / 2,931 tests) are from an older tree; the
>   current figure is 292 / 3,191.
>
> Kept verbatim rather than deleted, because a contradicting record is itself the
> finding: this file is the second time in this track a load-bearing conclusion was
> built on a written claim instead of an artifact.

Closed on 2026-07-28 after a fresh-process live acceptance run.

## Shipped boundary

- The adopted Media Workspace is mounted in the main renderer, Blanc renderer, and
  video popout.
- With the Seanime sidecar integration enabled, legacy video entry points hand local
  files to VideoCore through `seanime:media-workspace-open`.
- The sidecar starts on demand and local files launch through Seanime direct-stream.
- Disabling the sidecar integration preserves the legacy Media Center as the rollback
  surface.

## Live acceptance evidence

- A local fixture launched through the production workspace handoff and reached
  `readyState = 4`.
- English and Japanese subtitle tracks rendered together over the real video.
- The video and player surfaces remained opaque, and subtitles render directly over
  the picture without a background box. Multi-directional text shadows preserve
  readability against bright and dark frames.
- JASSUB loaded the selected ASS track and reported all six fixture events.
- Shadowing recorded from the approved microphone, produced playable audio, played
  forward, paused, and discarded cleanly.
- Mining created real screenshot and WebM media in Anki, rejected a duplicate, then
  undid the note and removed both media files.
- The destination deck was `JP Study::Immersion`; the live Anki note and media counts
  returned to their pre-run values.
- A fresh app restart restored the saved 2.25-second position and the dual-cue state.

Visual proof:

- `debug/shots/win1-1785266468396.png`

## Verification

- Targeted ESLint over all Phase 3 integration files: passed.
- Focused VideoCore, mining, heartbeat, Anki media-field, and workspace tests: passed.
- Full Vitest suite: **256 files / 2,931 tests passed**.
- Media CSS containment: **6,924 / 6,924 selectors scoped**, zero unscoped selectors,
  and zero media Tailwind tokens leaked into the shell bundle.
- Electron Forge Windows x64 package: main, preload, renderer, native dependencies,
  and final packaging all passed.
- `git diff --check` over the Phase 3 integration files: passed.

## Operational cleanup

The Windows firewall prompt was traced to the exact FACET-signed
`codex-computer-use.exe` helper and that process alone was force-quit after explicit
approval. The official Seanime Denshi installation and Anki were not terminated.
