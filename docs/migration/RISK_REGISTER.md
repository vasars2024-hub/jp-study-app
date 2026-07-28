# Risk register

P = probability, I = impact. Owner is who decides, not who implements.

| # | Risk | P | I | Early warning | Mitigation | Fallback | Owner |
|---|---|---|---|---|---|---|---|
| R1 | `video-core` cannot expose a cue-level timeline the Study Overlay can drive | M | **High** | Phase-1 probe step 5 | Add a narrow event contract in `video-core-events.ts` style; capture screenshots/audio in Electron main via `ffmpeg-static` for frame accuracy | Keep the existing `<video>` player; adopt Seanime for library/sources only; re-open in Phase 5 | Arseniy |
| R2 | Sidecar lifecycle on Windows — orphan processes, port leaks, AV false positives | M | High | Phase-1 kill test | Ephemeral loopback port, auth token, PID file, kill on quit **and** on crash | Manual "start media server" toggle in settings | — |
| R3 | **Go toolchain absent** — `go` not installed; CGO needs a C compiler on Windows | **Confirmed** | High | — | Install Go 1.23+ and MinGW-w64/TDM-GCC before Phase 1 | Use a prebuilt upstream `seanime.exe` release binary for the Phase-1 proof only | Arseniy |
| R4 | i18n regression on adopted surfaces becomes permanent | H | Medium | Allowlist stops shrinking | ADR-003: named, time-boxed, hard exit gate on Phase 4 | Ship Media workspace English-only, flagged in `CURRENT_STATE.md` | Arseniy |
| R5 | Bundled Mazii/HSK/unknown study data blocks open-sourcing | **H** | High | — | `LICENSING_PLAN.md` checklist before Phase-2 flip | Keep repo private; GPL obligations attach only on distribution | Arseniy |
| R6 | Upstream churn — active one-person project | H | Medium | Generated-type diffs | Pin hard at `9bdd052…`; bump deliberately; treat regenerated types as the changelog | Freeze at a known-good commit | — |
| R7 | Untracked work lost — all 16 scraper backend files, 12 study-mode records, 234 tests | L | **Critical** | — | Phase-0 snapshot complete; `git clean -fd` banned | `untracked-source.tar.gz` (442 files) | — |
| R8 | Dangling commits pruned — 20 exist, incl. parked flashcard-search and the TS 4.5→5.2 unpin | L | Medium | — | `git gc --prune` banned without a decision; second worktree shares the object store | `dangling-objects.pack` (784 objects) | — |
| R9 | Identity drift between Seanime AniList ids and Study OS media ids | M | High | Duplicate titles in Study Mode | External-id columns only, one direction, resolved once and stored — never re-derived from titles | Drop the columns; study data is untouched | — |
| R10 | Study Mode regressions from library re-plumbing | M | **High** | 2,888-test suite | Freeze study services; bridge only; ADR-SM-001..014 binding | Revert the bridge, not the study code | — |
| R11 | `mpv-prism` license unknown | M | Medium | — | Do not ship it (ADR-002) | `video-core` only | — |
| R12 | Scope collapse — P0-6 or gate G-VIS skipped, requirements silently dropped | H | High | Phase 2 starting before both close | Both are hard gates | Narrow to Media + Player; defer Scraper and Reading | Arseniy |
| R13 | **Anime library is effectively empty** — 1 TV show vs 1,585 music files | **Confirmed** | Medium | — | Acquire a representative anime set before Phase 1's scanner comparison | Compare Habari against filenames only, and label the evidence partial | Arseniy |
| R14 | Visual evidence unreliable — synthetic clicks don't activate some rail items; screenshots lag one call | **Confirmed** | Medium | — | Pop workspaces into their own OS window and target by title | Manual capture by the user | — |
| R15 | 290 pre-existing tsc diagnostics mistaken for migration regressions | M | Low | New session reports "type errors" | `baseline-tsc-by-file.txt` is the diff baseline | — | — |

## Open temporary regressions

| Regression | ADR | Opened | Exit gate | Status |
|---|---|---|---|---|
| Media workspace English-only | ADR-003 | 2026-07-27 | Phase-4 exit: i18n allowlist empty | **open — never describe as complete** |
