# Feature parity ledger (P0-6)

Built 2026-07-27 from a full survey of the active plan documents. This is the retirement gate:
**no existing path may be removed until its row here carries migration, automated, runtime,
visual and rollback evidence.**

## Requirement universe — what was counted

| Source | Unit | Count | Read |
|---|---|---:|---|
| `docs/MASTER_PLAN.md` | `###` subsections across 22 sections / 6 parts | **255** | headings + TOC + section census |
| `docs/MASTER_PLAN.md` | bullet requirements | 706 | counted, not individually transcribed |
| `src/renderer/components/scraper/featureStatus.ts` | registered feature ids | **60** | in full |
| `src/.coordination/study-mode/CURRENT_STATE.md` | "What works now" claims | **22** | in full |
| `src/.coordination/study-mode/DECISIONS.md` | ADR-SM-001..014 | **14** | headings |
| `src/.coordination/study-mode/OPPORTUNITY_CATALOGUE.md` | ranked opportunities | **31** | count |
| `src/MEDIA_CENTER_REVAMP_AUDIT.md` | capability areas (done + partial) | **8** | Phase 1–6 |
| `src/PHASE_{2,8,10,20,21}_*_STATE.md` | section state reports | **5** | run-status lines |
| `src/PHASE_4_5*`, `4_75*`, `5_*` | Aero / Secret-OS UI track | **7 docs** | headings |
| `PROJECT.md`, `AGENTS.md`, `TASKS.md` | stack status, guidance, task pipeline | 3 | headings |

**Accounting unit is the MASTER_PLAN `###` subsection (255 rows).** The other sources are
implementations *of* those subsections and are reconciled against them, not counted twice —
`featureStatus.ts`'s 60 ids sit inside Parts I–II, the 22 Study-Mode claims inside §13–§14 and
§16, the 8 Media Center areas inside §10–§13.

**Every one of the 22 sections has a destination and disposition below. Unaccounted: 0.**

Per-subsection rows are filled **when that section's phase opens**, not now. Filling 255 rows
before Phase 1 proves the sidecar boundary would be speculation, and ADR-005 requires evidence,
not prose. What is fixed now is ownership and disposition — which is what prevents a
requirement from being silently dropped.

## Status legend

`ready` verified live · `untested` implemented, not exercised end-to-end · `shell` nothing
behind it · `completed` per its state report · `partial` · `planned` · `n/a`

## Section ledger

### Part I — Scraper Core & Configuration → **Anime Scraper** owner

| § | Subsec | Current status | Disposition | Phase | Notes |
|---|---:|---|---|---|---|
| 1 Advanced Settings | 17 | `featureStatus`: 5 ready, 4 untested, 11 shell | **Merge** — Seanime settings schema for source/torrent/download concerns; retain Study-OS-only groups | 4 | 11 shell groups persist values nothing reads. Must not be promoted by adoption. |
| 2 Connection Profiles | 14 | state report **completed**; `page.profiles`/`set.profiles` **untested** | **Merge** — Seanime extension/client auth where equivalent | 4 | State report and registry disagree; registry wins (ADR-005). |

### Part II — Sites, Sources & Servers → **Anime Scraper** owner

| § | Subsec | Current status | Disposition | Phase | Notes |
|---|---:|---|---|---|---|
| 3 Verified Sites Manager | 11 | `page.sources` **ready** (live probes) | **Retain Study OS** | 4 | No Seanime equivalent. |
| 4 Community Site Sources | 0 | prose only | **Merge** into Seanime extension repo model | 4 | Zero subsections; requirement lives in bullets. |
| 5 Video Server Profiles | 10 | `VideoServerProfilesManager.tsx` + tests | **Adopt Seanime** — online-source extensions | 4 | Seanime `internal/onlinestream` + `extension_repo`. |
| 6 Unified Multi-Source Search | 5 | state report **completed** | **Merge** — Seanime source contracts, keep merged-result model | 4 | Canonical identity from shared platform. |

### Part III — Media Ecosystem → **Media Library** owner (Scraper for operations)

| § | Subsec | Current status | Disposition | Phase | Notes |
|---|---:|---|---|---|---|
| 7 Global Media Provider System | 7 | state report **completed** | **Merge** — Seanime AniList identity + Study OS MAL/Jikan | 2 | Identity bridge; AniList id as external column. |
| 8 Subtitle Provider & Management | 6 | state report **completed**; live Kitsunekko proof | **Retain Study OS** | 3 | Seanime does track selection only. Study OS is stronger. |
| 9 External Player Integration | 4 | `ExternalPlayerPanel.tsx` + tests | **Adopt Seanime** — MPV/VLC/MPC-HC profiles | 3 | Seanime's is broader. |
| 10 Media Hub | 12 | state report **completed** | **Adopt Seanime** scanner/matching (Habari); retain organization/backup | 2 | Largest single adoption. |
| 11 Anime Dashboard & Tracking | 14 | tracking components exist | **Adopt Seanime** entry/lists/schedule; Study badges added | 2 | Deeper MAL sync deferred → Phase 8. |
| 12 YouTube Content Manager | 15 | add/download exist; search incomplete | **Retain Study OS, deferred** | 8 | No Seanime equivalent. |

### Part IV — Japanese Study OS Integration → **Study Mode** owner · **all Retain**

| § | Subsec | Current status | Disposition | Phase | Notes |
|---|---:|---|---|---|---|
| 13 Media Module Integration | 12 | Media Center audit: 8 areas integrated | **Merge** — same workflows, Seanime-backed data | 2–3 | UI replaced, capability preserved. |
| 14 Japanese Content Intelligence | 11 | **22 verified claims**, 2,888 tests | **Retain Study OS — do not touch** | 3–6 | ADR-SM-001..014 binding. No second study DB, tokenizer, readiness engine, card pipeline or AI mutation path. |
| 15 Visual Novel Immersion | 18 | `immersion/visualNovels.ts` + 11 components | **Retain Study OS** | 5 | Outside Seanime scope entirely. |
| 16 Japanese-Learning Video Player | 14 | **verified**: auto-pause, loop, furigana, dual sub, dictation, shadowing, Whisper, A–B, frame step, PiP | **Merge — port controls onto `video-core`** | **3** | The critical row. Gate G-PLAY. |

### Part V — Local AI Layer → **AI capability registry** owner

| § | Subsec | Current status | Disposition | Phase | Notes |
|---|---:|---|---|---|---|
| 17 Local AI Agent Engine | 16 | `localAgent.ts`, typed Study ops verified | **Retain Study OS, extend** | 7 | ADR-SM-006: AI uses normal Study services. |
| 18 AI Advanced Config & Control | 15 | `aiProviderClient.ts` | **Retain Study OS** | 7 | — |
| 19 Local Model Stack | 5 | node-llama-cpp, Whisper, ONNX | **Retain Study OS** | 7 | Models runtime-downloaded; licenses separate. |
| 20 AI-Powered UI Customization | 9 | state report **completed**, verified live | **Retain Study OS** | 7 | Must not collide with Seanime theming (`internal/handlers/theme.go`). |

### Part VI — Consolidation, Quality & Release → **Shared platform** owner

| § | Subsec | Current status | Disposition | Phase | Notes |
|---|---:|---|---|---|---|
| 21 Architecture Streamline Audit | 20 | state report **completed**, verified in app | **Retain — re-run after Phase 4** | 9 | Its backlog is a Phase-9 input. |
| 22 Autonomous QA & Visual Testing | 20 | `jp-app` MCP in use | **Retain, extend to Seanime surfaces** | 9 | Becomes the visual-regression gate. |

**Totals: 22/22 sections mapped · 255/255 subsections accounted · 0 unaccounted · 0 proposed
retirements without a gate.**

## Cross-source reconciliation

| Conflict | Resolution |
|---|---|
| §2 state report says "completed"; `featureStatus.ts` says `page.profiles` **untested** | **Registry wins.** State reports describe a build run; the registry describes verified behaviour. |
| Media Center audit lists Video as "completed and integrated"; §16 player is being replaced | Both true. UI replaced, capability preserved — Phase 3 gate G-PLAY. |
| `result.streams` **shell**; §5/§6 assume stream resolution | Real gap. Seanime `onlinestream` fills it — the clearest net gain from adoption. |
| Study Mode claims 247 files/2,735 tests; measured 251/2,888 | Work progressed since. Measured value is authoritative (2026-07-27). |
| `TASKS.md` Task 3 "Virtual Scroll & Search Patch for Media Component" | Superseded by Phase 2; requirement carried, implementation replaced. |

## Deliberately deferred (retained, not dropped)

31 Study-Mode opportunities · §12 YouTube · authenticated MAL sync · secure browser/overlay ·
Chrome-extension parity · mpv-prism native player. Their identities and events must exist in
the shared contracts from Phase 2 so promotion later is additive.

## Not in scope of this ledger

The Aero / Secret-OS UI track (`PHASE_4_5*`, `PHASE_4_75*`, `PHASE_5_*`, `FRUTIGER_AERO_OS_VISION.md`)
governs shell identity, not media capability. ADR-004 protects the shell; the Media workspace
is a section inside it. No row is required, and none of its requirements are dropped.
