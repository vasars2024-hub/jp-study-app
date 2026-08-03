# Test status

| Area | Command or journey | Result | Date |
|---|---|---|---|
| SM-032 opportunity-text contract | `studyPipelineStageDetail.test.ts` | 6 tests: generators name titleKey/explanationKey/labelKey beside the English text, and every named key resolves in the English catalog | 2026-07-30 |
| Full suite (SM-032 final) | `npx vitest run --reporter=dot` | 290 files / 3,182 passed / 1 known unrelated stale-baseline failure | 2026-07-30 |
| i18n parity (SM-032 final) | `node tools/i18n-check.cjs` | Passed; 5,993 English keys in ja/zh/ru; exit 0 | 2026-07-30 |
| SM-032 recipe summary | Live Japanese pass | Passed after fix: nine filters in words, two columns ending at x=469, no overflow. `auto-fit`/`1fr` had first stretched it to three columns at x=1473, past the screen in this window position | 2026-07-30 |
| SM-032 opportunity type names | Live `Why this` panel in Japanese | Passed: `提案の種類 · 準備済みで未視聴` instead of the raw `prepared-unwatched` slug; all 20 types named in EN/JA/ZH/RU | 2026-07-30 |
| Persisted opportunity text | Live stream and evidence panel | **Still English, filed as the next slice**: titles, explanations and evidence labels are written into the Study document by `generateStudyOpportunities`, so the renderer cannot translate them after the fact | 2026-07-30 |
| SM-032 focused regression | `npx vitest run studyFilterRecipe studyPipelineStageDetail` | 2 files / 34 tests passed (10 new) | 2026-07-30 |
| Full suite (SM-032) | `npx vitest run --reporter=dot` | 290 files / 3,181 passed / 1 known unrelated stale-baseline failure | 2026-07-30 |
| i18n parity (SM-032) | `node tools/i18n-check.cjs` | Passed; 5,961 English keys in ja/zh/ru; exit 0 (262 added here) | 2026-07-30 |
| SM-032 live proof (Japanese UI) | Study surface driven over the debug bridge with `ui-lang=ja` | Passed: funnel, filter bar, candidate list, rail, card preview, episode rail and stage names all read naturally in Japanese; zero renderer errors; no document overflow | 2026-07-30 |
| SM-032 visual defects | Screenshot and text review in Japanese | **Two found and fixed**: the recipe undo hint quoted the English button label; the recipe code rendered `15XR5GC` in the header but `15xr5gc` in the copy notice | 2026-07-30 |
| Stage detail translation | Live production line | Fallback confirmed: the user's job document predates `detailKey`, so stored English details still display. Translated details await the next preparation; deterministic coverage only | 2026-07-30 |
| Cross-episode recipe offer | Authentic document with one workspace | Correctly absent — no earlier episode of the series exists. Positive path deterministic-only, no fixture created | 2026-07-30 |
| Rank 24 focused regression | `npx vitest run src/shared/__tests__/studyFilterRecipe.test.ts` | 1 file / 24 tests passed | 2026-07-30 |
| Full suite (rank 24) | `npx vitest run --reporter=dot` | 289 files / 3,171 passed / 1 known unrelated stale-baseline failure — exactly the previous 3,147 plus 24 | 2026-07-30 |
| Full suite side effects | Hashed `%APPDATA%\jp-study-app` before and after two full runs | No runtime file written by the suite | 2026-07-30 |
| i18n parity (rank 24) | `node tools/i18n-check.cjs` | Passed; 5,716 English keys translated in ja/zh/ru; exit 0 (45 keys added here) | 2026-07-30 |
| Changed-slice ESLint (rank 24) | `studyFilterRecipe.ts`, `studyFilterRecipe.test.ts`, `StudyOrchestratorWorkspace.tsx` | Passed, exit 0 | 2026-07-30 |
| TypeScript (rank 24) | `npx tsc --noEmit` | Zero diagnostics on any line this slice wrote; repository-wide count is now 17, all in another track's unparseable `reading-garden/audio/fetch-mooncap-music.mjs` | 2026-07-30 |
| Production bundles (rank 24) | renderer, main, preload | All three pass, re-run after the visual-QA CSS fix | 2026-07-30 |
| Rank 24 live export | Authentic workspace, no fixture, over the debug bridge | Passed: 370 candidates / 30 selected / `0% → 17%`; export carried the real filters, label `The Big O - 01`, code `15xr5gc` | 2026-07-30 |
| Rank 24 live clipboard | `Copy recipe`, read back through the main process | Passed: 443 characters byte-identical after normalizing Windows `\r\n`; user's own clipboard captured first and restored | 2026-07-30 |
| Rank 24 live apply | Pasted recipe (`maximumCards` 12, `minimumOccurrences` 2) | Passed: 30 → 12, coverage 17% → 13%, one history entry (3 → 4) and one action record matching the preview exactly; panel then reported identical and disabled its own apply | 2026-07-30 |
| Rank 24 live undo | Existing `Undo filter` | Passed: 30/370, 17%, history 3, filter object byte-for-byte including the original `['N5','N4']` order | 2026-07-30 |
| Rank 24 live rejections | Plain text, `[1,2,3]`, foreign `kind`, `version: 2`, no readable filter, trimmed recipe | Passed: each rendered its own localized reason; the trimmed case reported all three notes with correct plurals and showed `Excluded JLPT levels N4 · N5 → None` before applying | 2026-07-30 |
| Rank 24 live geometry | Partially off-screen Media Center window (−222,−113 → 1698,896) | Passed after fix: whole panel inside one 821px viewport, left-aligned at x=85, right edge 1251 in a 1,264px document, no horizontal overflow, apply passes `elementFromPoint` | 2026-07-30 |
| Rank 24 visual QA | Screenshot review of the diff rows | **Defect found and fixed**: `space-between` pushed values to x≈1160 against the far right edge (the ranks 10/11/14/17 pattern); values now at x=305 after their labels | 2026-07-30 |
| Bridge `/focus` endpoint | `POST /focus {"window":"main"}` after minimizing through the app's own `popoutControl` | **Proven on its first ever call**: `ok:true, focused:true, visible:true`; `/health` confirmed `focused:true, minimized:false` | 2026-07-30 |
| Rank 22 `requestAnimationFrame` premise | Frame armed while minimized, then `/focus` | **Proven**: still 0 after 2 s while minimized, fired immediately once focused; newly armed frames fire too | 2026-07-30 |
| Runtime files (rank 24 pass) | `media.json`, Study document, Anki snapshot, app down, from PowerShell | `media.json` never modified (`DC2C4E37…1F52`, stamped 21:01:11); Study document audited (only 2 QA action records + 3 app-restamped opportunities differed, zero fixture residue) then restored byte-for-byte to `FC9E50B9…4490`; Anki snapshot left as the app's own authentic 00:52:35 poll wrote it | 2026-07-30 |
| Focused mining/Anki/player regression | `npx vitest run profileRules videoCoreMining ankiMediaFields mediaStudyOrchestrator videoCoreStudy --reporter=dot` | 5 files / 60 tests passed | 2026-07-28 |
| Full suite | `npx vitest run --reporter=dot` | 288 files / 3,147 passed / 1 known unrelated stale-baseline failure | 2026-07-29 |
| i18n parity | `node tools/i18n-check.cjs` | Passed; 5,449 English keys translated in ja/zh/ru; exit 0 | 2026-07-29 |
| Rank 23 focused regression | `videoCoreTimingRepair.test.ts`, `videoCoreStudy.test.ts` | 2 files / 33 tests passed (17 new) | 2026-07-29 |
| Rank 23 live proof | Adopted-player timing cue | **Not run, and not claimed.** The running app reported `SEANIME_SIDECAR` unset, so `MediaWorkspaceHost` renders null and the overlay this cue lives in is not mounted — the same gate that blocks ranks 2 and 7 | 2026-07-29 |
| Bridge `/focus` endpoint | `src/main/debugBridge.ts` | Added and bundled; **unexercised** — no app has started since, and it needs a main-process restart to load | 2026-07-29 |
| Changed-slice ESLint (rank 23) | `videoCoreStudy.ts`, `VideoCoreStudyOverlay.tsx`, `videoCoreTimingRepair.test.ts`, `debugBridge.ts` | Passed, exit 0 | 2026-07-29 |
| TypeScript (rank 23) | `npx tsc --noEmit` | Zero diagnostics on any line this slice wrote. Two pre-existing ones sit in `debugBridge.ts:336-337` (`/key` modifiers), unchanged HEAD code | 2026-07-29 |
| Runtime files this session | `media.json`, `study-orchestrator-v2.json`, app down | Untouched: `DC2C4E37…1F52` and `FC9E50B9…4490`, both still stamped before this session began | 2026-07-29 |
| Rank 22 focused regression | `studySeriesRecurrenceForecast.test.ts`, `studySeriesRecurrenceOpportunity.test.ts` | 2 files / 14 tests passed | 2026-07-29 |
| Rank 22 authentic guard | Real library with one prepared episode | Passed: no forecast, because a later prepared episode of the series does not exist | 2026-07-29 |
| Rank 22 live panel | Labelled two-episode fixture, driven over the debug bridge | Passed: 30 words / 1 later episode / 109 future uses, 8 cards, both exact-scene actions present | 2026-07-29 |
| Rank 22 live geometry | Same fixture, panel revealed | Passed: seats 399–934 inside the 98–934 content region; document 1,920 px; no horizontal or internal overflow | 2026-07-29 |
| Rank 22 on-click reveal | Same fixture | **Not proven.** Unfocused Electron window never runs the effect's `requestAnimationFrame`; direct `scrollIntoView` reaches the correct seated position | 2026-07-29 |
| Rank 22 exact-scene action | Same fixture, real bridge click | **Did not navigate** — reproduced the filed `openContext` defect with two Media Center windows open; not a rank-22 regression | 2026-07-29 |
| Rank 22 fixture restoration | Study document + media document, app down | Passed: Study `FC9E50B9…4490` (1 workspace / 3 readiness / 3 authentic opportunities), media `DC2C4E37…1F52` (30 items, `lastPlayedAt` restored, `positionSec` 53.267 untouched); zero residue in either or in the Anki snapshot | 2026-07-29 |
| Renderer bundle | `npx vite build --config vite.renderer.config.ts` | Passed; 4,583 modules; existing chunk warnings only | 2026-07-29 |
| Main entry bundle | `npx vite build --config vite.main.config.ts --ssr src/main.ts` | Passed; 199 modules | 2026-07-29 |
| Preload entry bundle | `npx vite build --config vite.preload.config.ts --ssr src/preload.ts` | Passed; 4 modules | 2026-07-29 |
| Changed-slice ESLint | Explicit changed TypeScript/TSX paths | Passed with zero warnings or errors | 2026-07-29 |
| TypeScript | `npx tsc --noEmit --pretty false` | 348 broad repository diagnostics; changed-slice filter has zero | 2026-07-29 |
| Rank 21 focused regression | Snapshot evidence, detector, signal retirement, opportunity, existing Study suites | 4 files / 50 tests passed | 2026-07-29 |
| Rank 21 authentic Anki poll | Existing 87,257-entry collection | Passed: one `leech: true` expression (`厳粛`), zero suspended expressions | 2026-07-29 |
| Rank 21 authentic guard | Real Anki state + authentic prepared workspace | Passed: no false recommendation because `厳粛` has no prepared cue | 2026-07-29 |
| Rank 21 positive Electron journey | Labelled runtime-only candidate fixture over the real Anki flag | Passed: read-only panel, viewport fit, exact 0:42 handoff, zero renderer errors | 2026-07-29 |
| Rank 14 scene projection | `studySceneQuickSession.test.ts` | 3 tests passed | 2026-07-29 |
| Rank 14 live journey | Authentic `The Big O - 01` Study workspace | Passed: 0:48–3:59 preview; A=48/B=239; endpoint looped to 49.71; zero errors | 2026-07-29 |
| Rank 15 stale queue detection | `studyStaleQueueCleanup.test.ts` | 17 tests passed | 2026-07-29 |
| Rank 15 live journey | Three labelled fixtures over the authentic library | Passed: all three reasons shown; retire → 3 dismissed; undo → 3 active; zero errors | 2026-07-29 |
| Rank 15 data preservation | Study document before/after the retire-undo cycle | Passed: 2 workspaces (370/30 and 3/3), 3 readiness snapshots, 15 actions unchanged | 2026-07-29 |
| Profile-rule migration | Live Settings and persisted rules file | Passed: Subtitles distinct from Audio; schema version 2 persisted | 2026-07-28 |
| Shared Anki destination | Live preview and note creation | Passed: same profile, rule, deck, and model | 2026-07-28 |
| Partial export recovery | Forced six-card mixed batch | Passed: retry created only two failed entries | 2026-07-28 |
| Exact Anki undo | Live created-note IDs | Passed: exactly three proof notes removed; none remain | 2026-07-28 |
| Large collection responsiveness | Immediate preview after write/delete | Passed: approximately 0.15 seconds instead of a greater-than-75-second refresh wait | 2026-07-28 |
| Replay-to-shadowing | Real G-PLAY cue, three explicit replays | Passed: prompt on third click, shadowing enabled, recording idle, zero renderer errors | 2026-07-28 |
| Prepared-but-unwatched logic | Shared opportunity, sync, and analysis regression | 3 files / 40 tests passed | 2026-07-28 |
| Prepared-but-unwatched live journey | Authentic `The Big O - 01` durable state | Passed: resume strip, exact title/evidence/action, authoritative active state, zero renderer errors | 2026-07-28 |
| Recent Anki context regression | Interval evidence plus Study opportunity suites | 4 files / 48 tests passed | 2026-07-28 |
| Real Anki evidence audit | Persisted 87,257-entry interval snapshot | No interval-change evidence yet; no synthetic review event seeded | 2026-07-28 |
| Comprehension rescue regression | Four player/Study suites | 4 files / 59 tests passed | 2026-07-28 |
| Comprehension rescue live boot | Adopted Video workspace | Renderer booted with zero errors; media activation blocked by untouched Windows firewall prompt | 2026-07-28 |

The microphone hardware path was intentionally not invoked. It remains a
separate permission-gated smoke.
