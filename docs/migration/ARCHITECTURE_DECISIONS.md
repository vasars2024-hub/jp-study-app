# Architecture decisions

Append-only. Never edit a recorded decision — supersede it with a new one.

---

## ADR-001 — License the combined work GPL-3.0

**Date** 2026-07-27 · **Status** accepted · **Decider** Arseniy

**Context.** Seanime is GPL-3.0 at the pinned commit. Study OS declares MIT and is `private: true`.
Adopting `seanime-web` source into `src/` creates a combined derivative.

**Decision.** License the whole work GPL-3.0. **Flip `LICENSE` and `package.json` at the moment
the first Seanime-derived file lands in `src/`** — start of Phase 2 — not before. Phases 0–1 are
sidecar-only and require no flip; deferring keeps the option open through gate G-1 and keeps
provenance exact.

**Alternatives rejected.** *Stay MIT, sidecar-only forever* — forfeits UI adoption, which is the
user's stated priority. *Stay private and mix freely* — legal only while never distributing;
one shared build breaks it.

**Evidence.** GitHub API `license.spdx_id = GPL-3.0` @ `9bdd052…`; `package.json` line 20.
Dependency audit: 17 runtime deps — Apache-2.0 ×6, MIT ×7, BSD-2-Clause ×1, ISC ×1,
**`ffmpeg-static` GPL-3.0-or-later**. All GPL-3.0 compatible.

**Consequences.** GPL covers the entire app, not just media — one-way door.
`ffmpeg-static` means the app *already* bundles GPL-3.0 code under an MIT declaration; this ADR
resolves a pre-existing conflict rather than creating one. Bundled third-party study content
must be cleared before the repo goes public (see `LICENSING_PLAN.md`). Not legal advice.

**Rollback.** Before the Phase-2 flip: none needed. After: requires removing every
Seanime-derived file.

**Affected features.** All.

---

## ADR-002 — Adopt `video-core`; defer mpv-prism and Denshi's native player

**Date** 2026-07-27 · **Status** accepted

**Context.** Seanime ships three player stacks: `video-core` (HTML5/hls.js), `mpv-core`
(mpv-prism/libmpv), `native-player` (Denshi).

**Decision.** Adopt `video-core`. Keep stock `electron@^42.3.0`. Defer mpv-prism indefinitely;
if libmpv-class playback is ever needed, reach for external-player profiles (§9) first.

**Evidence.** `mpv-prism.lock.json` pins prebuilt tarballs served from `seanime.app` — **not in
the GPL source tree**, license unstated. `seanime-denshi/package.json` sets
`electronDownload.mirror: "https://seanime.app/assets/electron/"`, `customDir: "v42.4.0"`.
`DEVELOPMENT_AND_BUILD.md`: *"Seanime Denshi: Built with a custom Electron/Chromium to support
more codecs."* `video-core/` contains 40 modules including SSA/ASS subtitles, a PGS renderer,
screenshot capture, preview scrubbing, playlists, PiP and media-session — a superset of the
current `<video>` chrome minus the study controls.

**Consequences.** Study OS keeps its own Electron and dependency tree. Codec coverage comes
from the server's `mediastream`/`directstream` transcoding. **Open risk:** whether `video-core`
exposes a cue-level timeline usable by the Study Overlay — the Phase-1 probe.

**Rollback.** Keep the existing `<video>` player until gate G-PLAY passes.

**Affected features.** MASTER_PLAN §16, §9; `MediaContent.tsx`.

---

## ADR-003 — Media workspace ships English-only through Phases 2–3

**Date** 2026-07-27 · **Status** **closed 2026-07-29 at the Phase 4 exit gate** ·
temporary regression, time-boxed — *ended*

**Closure.** `ADOPTED_MEDIA_I18N_ALLOWLIST` is empty and
`src/shared/__tests__/mediaWorkspaceI18n.test.ts` keeps it that way, rejecting raw English JSX
and untranslated `aria-label`/`placeholder`/`title` across all five host-owned adopted surfaces.
Verified live in the running app, on a real provider stream, by switching languages through
Settings › Language: EN/JA/ZH/RU all repaint the workspace, player and mining chrome with no
missing strings. Evidence: `docs/migration/proof/i18n-20260729/adr-003-language-proof.json`.

**Context.** `CLAUDE.md` makes EN/JA/ZH/RU a hard test gate (`src/shared/__tests__/i18n.test.ts`).
Seanime README lists *"Built-in localization (translations)"* under **Not planned**, so every
adopted surface arrives English-only.

**Decision.** Scope the i18n gate with an explicit **allowlist of adopted-surface files** — do
not weaken the assertion. The allowlist shrinking to empty is a **hard exit gate on Phase 4**.

**Consequences.** A named, time-boxed regression under §12 of the migration brief. It must
appear in `CURRENT_STATE.md` and `RISK_REGISTER.md` and **must never be described as complete**
while open. Sweeping four languages across surfaces that may not survive gate G-1 would be
wasted work; that is the reason for the ordering.

**Rollback.** Remove the allowlist; the original gate returns unchanged.

---

## ADR-004 — Root-configuration supersession

**Date** 2026-07-27 · **Status** accepted

**Context.** `CLAUDE.md` restricts changes to `src/` and protects `forge.config.*`,
`vite.*.config.*`, `tsconfig.json`. The sidecar cannot be packaged under that rule.

**Decision.** Permit exactly: `forge.config.ts` (sidecar `extraResource`), one Vite alias for
adopted UI, `tools/seanime-*.cjs` build scripts, and a vendored pinned Seanime checkout.
`tsconfig.json` only if adopted source requires `paths`.

**Explicitly still protected:** the desktop shortcut grid, the window dragging layer, and the
taskbar shell. The Media workspace is a section *inside* `DesktopShell.tsx`, never a
restructuring of it.

**Consequences.** Root config becomes migration-owned. Mitigated by routing all of it through a
single `tools/seanime-*.cjs` entry point. Go 1.23+ with a CGO-capable toolchain becomes a build
prerequisite.

**Rollback.** Revert `forge.config.ts` and delete the alias; the app builds as before.

---

## ADR-005 — Evidence beats prose; the maturity registry is authoritative

**Date** 2026-07-27 · **Status** accepted

**Context.** `src/PHASE_2_CONNECTION_PROFILES_STATE.md` reports "completed" while
`featureStatus.ts` marks `page.profiles` and `set.profiles` **untested**. Both are current.

**Decision.** Where a state report and `featureStatus.ts` disagree, **the registry wins**. State
reports describe a build run; the registry describes verified behaviour. No adopted Seanime
screen may promote a `shell` or `untested` entry without a recorded live run.

**Consequences.** `featureStatus.ts`'s honesty contract survives the migration intact and
extends to Seanime-backed pages. `result.streams` stays `shell` until a real stream plays.

**Affected features.** All 60 registered scraper ids.
