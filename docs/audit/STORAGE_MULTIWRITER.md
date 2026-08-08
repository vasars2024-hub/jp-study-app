# Storage 6.2 — last-writer-wins sweep

_Generated 2026-08-07T18:25:36.213Z by `docs/migration/tools/storage-multiwriter.mjs`._

**Read the header of the tool before this table.** The naive query — "keys written by
`setItem` from two modules" — returns 11
keys and **misses item 3.3**, the one confirmed instance the audit already holds, because both
of 3.3's owners write through the same setter. The population that matters is a **shallow-merge
setter reached from two or more modules with a contested collection-valued field**.

| Measure | Count |
|---|---|
| Keys with at least one declared write site | 173 |
| Keys whose `setItem` calls span 2+ modules (the naive query) | 11 |
| **Shallow-merge setters with a contested collection field** | **2** |
| Contested fields across those keys | 2 |
| Keys with a pinned ruling | 12 |
| **Keys still unruled** | **0** |

## Candidates — shallow merge, 2+ caller modules, contested collection field

### `jp-os-environment-v1`

Setter `saveEnvironment` (src/renderer/environment/environmentStore.ts:204), merge shape **shallow-merge**, called from 6 modules.

| Contested field | Written from |
|---|---|
| `companions` | `src/renderer/environment/CompanionLayer.tsx`<br>`src/renderer/findingReadouts.ts`<br>`src/renderer/miniRoutines.ts` |

Call sites: `src/renderer/environment/buddyRoutines.ts:401`, `src/renderer/environment/buddyRoutines.ts:404`, `src/renderer/environment/buddyRoutines.ts:410`, `src/renderer/environment/buddyRoutines.ts:416`, `src/renderer/environment/buddyRoutines.ts:422`, `src/renderer/aeroEnvironment.ts:125`, `src/renderer/aeroEnvironment.ts:130`, `src/renderer/aeroEnvironment.ts:139`, `src/renderer/aeroEnvironment.ts:148`, `src/renderer/environment/CompanionLayer.tsx:375`, `src/renderer/environment/CompanionLayer.tsx:608`, `src/renderer/findingReadouts.ts:199`, `src/renderer/findingReadouts.ts:232`, `src/renderer/findingReadouts.ts:244`, `src/renderer/findingReadouts.ts:275`, `src/renderer/findingReadouts.ts:298`, `src/renderer/miniRoutines.ts:99`, `src/renderer/components/settings/SettingsApp.tsx:177`

**Ruling:** **defect — fixed** — `companions` is contested by three modules. `findingReadouts.ts:215` and `miniRoutines.ts:97` both `loadEnvironment()` immediately before writing, synchronously, so neither can carry a stale array. `CompanionLayer.persist()` is the erasing writer: it autosaves its in-memory `listRef`. Item 3.3 closed the same-window case with a resync effect, and this pass proved that fix's coverage is exact — `CompanionsPage.tsx` writes precisely `primaryRoutineId` / `secondaryRoutineId` / `holdRoutineId` and the resync reconciles precisely those three. The gap was cross-window: `environmentStore` has no `storage` listener and `main/desktopWindows.ts` opens one Study OS window per display, so the resync never fired for a change made in another window. `persist()` now re-reads the three assignment fields at write time (`companionAssignments.ts`, 6 tests).

### `jp-study.toolbox.settings.v1`

Setter `saveToolboxSettings` (src/renderer/toolboxSettings.ts:29), merge shape **shallow-merge**, called from 2 modules.

| Contested field | Written from |
|---|---|
| `themeOverrides` | `src/renderer/components/blanc/BlancReadyToolPanels.tsx`<br>`src/renderer/components/blanc/BlancShell.tsx` |

Call sites: `src/renderer/components/blanc/BlancReadyToolPanels.tsx:544`, `src/renderer/components/blanc/BlancReadyToolPanels.tsx:550`, `src/renderer/components/blanc/BlancReadyToolPanels.tsx:557`, `src/renderer/components/blanc/BlancReadyToolPanels.tsx:568`, `src/renderer/components/blanc/BlancReadyToolPanels.tsx:573`, `src/renderer/components/blanc/BlancShell.tsx:1306`, `src/renderer/components/blanc/BlancShell.tsx:1311`, `src/renderer/components/blanc/BlancShell.tsx:1406`, `src/renderer/components/blanc/BlancShell.tsx:2563`, `src/renderer/components/blanc/BlancShell.tsx:3037`

**Ruling:** **safe** — Flagged as a candidate and cleared on reading. Both owners write through `saveToolboxSettings`, whose shallow merge would be exposed to a stale `themeOverrides` — but `BlancShell` derives that map from state subscribed at `:1255` and `:2551`, and `onToolboxSettingsChanged` listens to BOTH the same-window CustomEvent and the cross-window `storage` event (`toolboxSettings.ts:63-64`). That second listener is exactly what `environmentStore` lacks, which is why one candidate is a defect and this one is not.

## Keys whose `setItem` calls span modules, with no contested collection field

These are the naive query's hits. Each is listed so the sweep can be shown to have looked at
them, not because each is suspect — most are one owner plus `migrationRunner`'s
whole-snapshot restore, which writes every key by construction and is not a competing owner.

| Key | Writing modules | Ruling |
|---|---|---|
| `jp-calendar-events` | `src/renderer/calendar.ts`<br>`src/renderer/storage/migrationRunner.ts` | **safe** — One owner plus `migrationRunner.ts:83`, which writes every `LS_KEYS` key from a snapshot inside `replaceAtomic` (`:74-84`). That is the whole-store restore path, a deliberate replacement of the entire store, not a competing owner racing for one key. |
| `jp-clipboard-history` | `src/renderer/clipboardHistory.ts`<br>`src/renderer/storage/migrationRunner.ts` | **safe** — One owner plus the `migrationRunner.ts:83` whole-snapshot restore. See `jp-calendar-events`. |
| `jp-flashcard-deck` | `src/renderer/flashcardDeck.ts`<br>`src/renderer/storage/migrationRunner.ts` | **safe** — One owner (`flashcardDeck.ts:89,108`) plus the `migrationRunner.ts:83` whole-snapshot restore. This key's real defect was 6.A over-encoding, not a second writer. |
| `jp-media-player-preferences-v1` | `src/media/VideoCoreStudyOverlay.tsx`<br>`src/renderer/components/media/MediaContent.tsx` | **defect — fixed** — Two owners with different schemas on one key, each declaring the literal separately (`MediaContent.tsx:99`, `shared/videoCoreStudy.ts:218`). Nine fields belong only to the study overlay. `normalizeVideoCoreStudyPreferences` returns `{ ...raw, ...normalized }` and preserved the legacy player's fields; `normalizePlayerPreferences` returned a fixed 14-field object and erased all nine of the overlay's whenever the legacy player was opened. Confirmed against the live profile, which holds the 23-field union — i.e. the overlay wrote last. The legacy player now merges over what is stored (`mergeStoredPlayerPreferences`, 3 tests). |
| `jp-media-study-database-v1` | `src/renderer/mediaStudyStore.ts`<br>`src/renderer/storage/migrationRunner.ts` | **safe** — One owner plus the `migrationRunner.ts:83` whole-snapshot restore. |
| `jp-media-tracking-v1` | `src/renderer/mediaTrackingStore.ts`<br>`src/renderer/storage/migrationRunner.ts` | **safe** — One owner plus the `migrationRunner.ts:83` whole-snapshot restore. |
| `jp-study-csv-editor-v1` | `src/renderer/components/csv-editor/csvEditorStorage.ts`<br>`src/renderer/storage/migrationRunner.ts` | **safe** — One owner plus the `migrationRunner.ts:83` whole-snapshot restore. This key's real defect was 6.A / 6.D, not a second writer. |
| `jp-telemetry-consent` | `src/renderer/components/ConsentScreen.tsx`<br>`src/renderer/views/SettingsView.tsx`<br>`src/renderer/widgets/more.tsx` | **safe** — Three writers (`ConsentScreen.tsx:20`, `SettingsView.tsx:350`, `widgets/more.tsx:231`) but the value is a bare scalar string, not an object. Last-writer-wins on a scalar is a conflict, not erasure — there is no field for one owner to drop. 6.2 is scoped to erasure. |
| `jp-video-core-mining-history-v1` | `src/media/VideoCoreMiningPanel.tsx`<br>`src/renderer/components/music/useMusicMining.ts`<br>`src/renderer/__devharness__/continueWatchingHarness.tsx`<br>`src/renderer/__devharness__/detachedBlockHarness.tsx`<br>`src/renderer/__devharness__/watchLoopHarness.tsx` | **defect — fixed** — `useMusicMining.ts:117` appends with a fresh read every time and loses nothing. `VideoCoreMiningPanel.tsx` is the opposite: `history` is seeded into React state once at mount (`:159`), the panel never subscribes, and the effect at `:216` wrote the whole array back on every change — so a note mined from the music player while the panel was open was erased by the panel's next append or undo. Now folded against storage (`mergeVideoCoreMiningHistory`, 5 tests); the union is well defined because both owners only append and every entry carries an `id`. |
| `jp-video-core-resume-v1` | `src/media/StudyPlayerSlice.tsx`<br>`src/renderer/__devharness__/continueWatchingHarness.tsx`<br>`src/renderer/__devharness__/resumeLastHarness.tsx` | **scope** — The only writer that ships is `StudyPlayerSlice.tsx:666`. The other two are `__devharness__` files, which are not in the product. Recorded rather than dropped so a later grep does not re-raise it. |
