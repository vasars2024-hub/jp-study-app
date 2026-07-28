# Next session handoff

Written 2026-07-28 at the end of **Phase 2 (first adoption)**.

## Where you are

Repo `C:/Users/Arseniy/Projects/jp-study-app` · branch `grammarx/phase-1-5` · based on
`a22e7ba1f72aa7942890ad7eb3ac253b37be0735`.

**Phases 0, 1 and the first slice of Phase 2 are done. Gate G-1: PASS. §8 scanner gate: PASS.
One surface is adopted, end to end, verified against a real scan.**

`CURRENT_STATE.md`'s Phase-2 section is the full record — every number, every command, every
failed experiment. This file is only the handoff.

## Verify before doing anything

```bash
git rev-parse --abbrev-ref HEAD   # expect grammarx/phase-1-5
go version                        # expect go1.26.5 — if it does not resolve, that is a STALE
                                  # SHELL, not a missing toolchain (C:\Program Files\Go\bin\go.exe)
```

`ENVIRONMENT_BASELINE.md` in the Phase-0 backup still says `go — NOT INSTALLED`. That line is
knowingly stale and is left unedited because the backup is covered by `SHA256SUMS.txt`.
**Source-of-truth order is repo/system state > recorded prose. Never modify the backup.**

## Phase 2 is UNCOMMITTED — decide the commit boundary first

The working tree is self-consistent (`LICENSE` is GPL-3.0, `package.json` is
`"license": "GPL-3.0-or-later"`, adopted source is in `vendor/seanime-web/`). It was not
committed because `src/preload.ts` (624 pre-existing added lines), `src/renderer/window.d.ts`
(427), `src/renderer/App.tsx` (37+/42−) and `package.json` (an unrelated `jsdom` dev-dep) all
carry parallel work that staging would sweep in.

**ADR-001 is non-negotiable: `LICENSE` and `package.json` must land in the same commit as
`vendor/seanime-web/`.**

## Next three safe actions

1. **Commit Phase 2** with a deliberate boundary (above). This is the highest-value next step
   — 225 installed packages and 179 adopted files are currently only in the working tree.
2. **Prove the cue patch at runtime.** `patches/seanime/0001-video-core-cuechange.patch` is
   written, applies cleanly and typechecks, but has **never run**. It needs the player mounted
   against a mediastream session. Check the three assumptions in
   `patches/seanime/README.md` — especially that `MKVParser_SubtitleEvent.startTime/duration`
   really are milliseconds.
3. **Adopt the second surface** (`entry`/episodes) using the pattern in
   `vendor/seanime-web/ADOPTION.md`. That is also what restores the real
   `media-preview-modal`, so re-measure the closure first — restoring it took the Phase-2
   surface from 179 files/47 packages to 368/60.

## What is where

| Path | What |
|---|---|
| `vendor/seanime-web/` | 179 adopted files, verbatim from `9bdd052` except 4 substitutions |
| `vendor/seanime-web/ADOPTION.md` | **read this before touching the adopted tree** — substitutions, boot ordering, re-sync procedure |
| `src/media/` | the Study OS side: workspace host, bootstrap, Tailwind entry, typed boundary |
| `src/media/seanime-boundary.d.ts` | hand-maintained `@/*` declarations; `tsconfig.json` has no `paths` on purpose |
| `patches/seanime/` | upstream-submittable patches, applied to nothing |
| `tailwind.config.ts`, `postcss.config.cjs` | scoped to `#media-workspace`; Preflight OFF |

## How to run the adopted surface

It is inert unless the sidecar flag is armed. In the app: `SEANIME_SIDECAR=1 npm start`, then
the "Media workspace" button at bottom-right.

To exercise it **without** Electron (safe while the user's app is running — a second instance
would share `%APPDATA%/jp-study-app`):

```bash
node scratchpad/start-sidecar.mjs          # holds a sidecar open, prints {baseUrl, token}
node scratchpad/media-harness-server.mjs   # vite on :5180, must chdir to repo root
# then open http://127.0.0.1:5180/media-harness.html
```

## Failed / negative experiments — keep these, they cost real time

- **Seeding *prior* seasons makes Seanime's matching worse, not better.** 44/62 correct with
  all seasons seeded vs 51/62 with only the current season — and 11 silent mis-matches vs 0.
- **The `unknownGroups` seeding loop cannot bootstrap a collection.** It scored *below* the
  cold start (12/62 vs 15/62). Unmatched titles have no `mediaId` to seed with.
- **`GET /api/v1/library/collection` is not the tracker collection.** It lists only media with
  local files, so it reads 0 before a scan — the wrong endpoint for verifying a seed.
- **A `mediaId` is not a correct match.** `metadata.type === "special"` is Seanime's fallback
  bucket for "franchise matched, episode number didn't fit" — scoring it as a genuine special
  inflated the first result from 44/62 to a wrong 55/62.
- **Adopted source under `src/` breaks `architectureBaseline.test.ts`** — 179 orphan modules.
  It belongs in `vendor/`, which the architecture audit does not walk.
- **`getOnInit: true` on the auth-token atom** reads localStorage at module-eval, so a token
  written from an effect is too late → silent 401 → `location.replace("/public/auth")` → blank
  screen, no console error. Hence `seanimeBootstrap.ts`.
- **A dev harness must `chdir` to the repo root**, or Tailwind resolves its default config and
  every `theme('colors.brand.*')` call fails. The production build was never affected.
- **Don't write patches through a shell heredoc with `\u0000` in them.** A literal NUL byte
  landed in the file and turned a 94-line patch into a 2,526-line binary-diff rewrite.

## Do not

- `git clean -fd` / `git reset --hard` / `git checkout -- .` — the tree is intentionally dirty
  (~545 entries at Phase-1 end, more now). All 16 files of `src/main/scraper/` are untracked.
- `git gc --prune` or any history rewrite — 20 dangling commits hold parked work, and
  `C:/Users/Arseniy/Projects/jp-study-app-noctis-beta` shares this object store.
- Stage the parallel session's work. See the commit-boundary table.
- Touch `src/main/anki/`, `src/.coordination/study-mode/`, `tools/`, or
  `src/renderer/data/grammar/` (parallel sessions).
- Hand-edit anything under `vendor/`. Substitutions are whole-file replacements, always.
- Restructure `DesktopShell.tsx`, the desktop grid, the dragging layer, or the taskbar.
- Ship Seanime's name, logo or screenshots in UI. GPL attribution in source and docs is a
  separate, required thing and is already in place.

## Known-failing baselines — not your bug

| Command | Expected | Verified at end of Phase 2 |
|---|---|---|
| `npx tsc --noEmit` | exit 2, **290 diagnostics, 108 files** | 290 / 108, 0 from `vendor/` |
| `npm run lint` | exit 1, 164 problems (2 errors) | 164 (2 errors, 162 warnings) |
| `npm test` | **exit 0, 251 files, 2,888 tests** | 251 / 2,888 passed |

A test failure **is** your bug. Type and lint diagnostics must be diffed against the baseline.

## Unresolved

- **R1 CLOSED** — `video-core` can drive the Study Overlay; the cue patch exists but is
  unproven at runtime.
- **R5 CLOSED** — grammar corpus de-branded (`n{1..4}-supplement.ts`, `N*_SUPPLEMENT`,
  provenance `supplement-${level}`; `tools/_mazii_*` deleted). `LICENSING_PLAN.md` and
  `CURRENT_STATE.md` are corrected. **Do not re-open.**
- **R13 CLOSED** — the scanner comparison has been run; Seanime wins 82.3 % vs 50.0 %.
- **Live AnkiConnect has still never been exercised.** Unchanged since Phase 0 and still the
  Phase-3 acceptance gap.
- **Virtualization is present but unproven at scale** — `MediaCardLazyGrid` engages above 48
  items; the test library has 15 titles.
- **Two Study OS parser bugs are spun off, not fixed** — underscore normalisation and
  release-source prefix stripping in `parseMediaFileName`. Fixing both takes the incumbent
  from 29/62 to 62/62 files matched (though still only 31/62 *correct*, for want of a season
  model).
