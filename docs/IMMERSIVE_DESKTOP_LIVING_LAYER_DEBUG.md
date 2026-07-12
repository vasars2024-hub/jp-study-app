# Immersive Desktop Living Layer — Implementation Verification & Debug Record

**Date:** 2026-07-12  
**Scope:** Engineering verification pass (audit → fix → verify → document)  
**Related QA handbook:** `docs/LIVING_DESKTOP_QA.md`  
**Architecture:** Unchanged (EnvironmentStack + optional OS host)

---

## Phase 1 — Implementation Audit Summary

| Area | Implementation state | Issues found |
|---|---|---|
| Wallpaper rotation | Complete | Stuck `wall-from-env` when living layer disabled; stage cleanup weak |
| Particles | Complete | Stale kinds after preset change; full remount on every env save; incomplete cleanup |
| Day-cycle lighting | Complete | OK (component rename already fixed Windows case clash) |
| Companions | Complete | **Severe:** setState every rAF + persist thrash; type filter missing; `noctis` omitted from TS type |
| OS host | Complete | Needs full restart for main changes; multi-monitor API present |
| Achievements | Complete | OK |
| Noctis light bridge | Complete | **Double-fired** study/flashcard companion reactions |
| Session restore | Complete | Works via `hydrateLayout` + `restoreSessionWindows` |
| Custom CSS | Complete | OK |

---

## Phase 2 — Fixed Issues

### FIX-01 — Stuck black/neutral wall after disabling living layer / rotation

| | |
|---|---|
| **Problem** | Shell stayed in `wall-from-env` mode after turning off living desktop or rotation, leaving a blank/neutral background. |
| **Cause** | `EnvironmentStack` returned `null` when `!env.enabled` without notifying parent; `WallpaperStage` unmount did not always clear shell flag. |
| **Fix** | Clear rotation via `onRotationActive(false)` when living layer or rotation is off; WallpaperStage cleanup also calls `onActiveChange(false)`. |
| **Files** | `EnvironmentStack.tsx`, `WallpaperStage.tsx` |
| **Verify** | Enable rotation → desk uses stage; disable living layer → layout/static wall returns. |

---

### FIX-02 — Companion wander destroyed performance and flooded disk

| | |
|---|---|
| **Problem** | Companions caused UI lag and constant layout/env writes. |
| **Cause** | Wander loop called `setList` every animation frame; a `useEffect([list])` persisted to `localStorage` ~every 800ms. |
| **Fix** | Wander mutates `listRef` and updates DOM (`left`/`top`/`transform`) only. React state + `saveEnvironment` commit every **2s** when dirty, and on drag end / menu / reaction. |
| **Files** | `CompanionLayer.tsx` |
| **Verify** | Enable companions + particles; icon drag remains smooth; env key not rewritten every frame. |

---

### FIX-03 — Disabled companion types still appeared

| | |
|---|---|
| **Problem** | Toggling off a companion type in settings did not remove existing instances until full reseed. |
| **Cause** | `seedOrLoad` restored all saved companions regardless of `companionTypes`. |
| **Fix** | Filter saved instances to active types; seed defaults only for missing active types. |
| **Files** | `CompanionLayer.tsx` |
| **Verify** | Disable Critter → only remaining types visible after re-init. |

---

### FIX-04 — TypeScript omitted `noctis` from companionTypes

| | |
|---|---|
| **Problem** | Runtime default included `noctis`; type union did not → type holes / filter inconsistencies. |
| **Cause** | Incomplete type update when Noctis emissary was added. |
| **Fix** | `companionTypes: Array<'study-buddy' \| 'critter' \| 'timekeeper' \| 'noctis'>`. |
| **Files** | `types.ts` |
| **Verify** | Typecheck accepts noctis in settings/store. |

---

### FIX-05 — Double companion reactions on study/cards

| | |
|---|---|
| **Problem** | Study buddy status flipped twice / spammy reactions when reading. |
| **Cause** | `CompanionLayer` listened to `jp-reading-recorded` / deck events **and** `noctisLightBridge` re-emitted `env:companion` for the same activity. |
| **Fix** | `noctisLightBridge` only dispatches `noctis:pulse` (no second companion event for study/flashcard). |
| **Files** | `noctisLightBridge.ts` |
| **Verify** | One status update per reading pulse; console can still see `noctis:pulse`. |

---

### FIX-06 — Particles kept old kinds after weather/preset change

| | |
|---|---|
| **Problem** | Switching match tags or manual presets left previous particle kinds on screen. |
| **Cause** | `ensurePopulation` only grew/truncated array; never removed disallowed kinds. |
| **Fix** | Cull particles whose `kind` is not in active `presets` before refill. |
| **Files** | `particleEngine.ts` |
| **Verify** | Rain-only → then snow-only: rain disappears. |

---

### FIX-07 — Particle rAF remounted on every env identity change

| | |
|---|---|
| **Problem** | Companion position saves re-created env object → ParticleLayer effect re-ran → canvas flash / reset. |
| **Cause** | `useEffect(..., [env])` depended on full object. |
| **Fix** | Hard-gate effect deps: `enabled && particlesEnabled && tier !== off`. Soft settings via `envRef.current` each frame. Cleanup clears particle buffer + canvas. |
| **Files** | `ParticleLayer.tsx` |
| **Verify** | Companions wander without particle field resetting. |

---

## Phase 3 — Feature Verification (engineering review)

| System | Result | Notes |
|---|---|---|
| Wallpaper rotation | **Pass (code)** | Time rules + calendar priority; crossfade; reduce-motion cut |
| Particles | **Pass (code)** | All presets; density/tier caps; match tags; cleanup improved |
| Lighting | **Pass (code)** | Phase wash; intensity |
| Companions | **Pass (code)** | After wander/persist fix; reactions; hide/lock |
| OS host | **Pass (code)** | Transparent host, click-through, span modes; needs full restart for main |
| Session restore | **Pass (code)** | `restoreSessionWindows` strips windows on hydrate when false |
| Custom CSS | **Pass (code)** | Sanitize blocklist; clear/reset |
| Noctis bridge | **Pass (code)** | Pulse only; no city IPC |
| Themes + chrome | **Pass (code)** | Opaque `--chrome` tokens for Start/taskbar |

Manual runtime stress (8h session, multi-monitor plug) should still be executed on target hardware using `docs/LIVING_DESKTOP_QA.md`.

---

## Phase 4 — Testing Checklist Results

### Functional

| Item | Result |
|---|---|
| Master off = no stack | Pass (code path) |
| Rotation enable/disable | Pass after FIX-01 |
| Particle enable/disable + preset swap | Pass after FIX-06/07 |
| Companion spawn/drag/menu | Pass after FIX-02/03 |
| OS host toggle API | Pass (main/preload present) |
| Session restore flag | Pass (hydrate) |

### Regression risks checked in code

| Item | Result |
|---|---|
| Icon drag path unchanged | Pass |
| Desktop layout commit path unchanged | Pass |
| No CityService imports in living layer | Pass |
| Companion host closes with main | Pass (`mainWindow.on('closed')`) |

### Stress (code-level mitigations)

| Scenario | Mitigation |
|---|---|
| Many particles | Tier × density cap |
| Companion wander | DOM-only motion |
| Env save spam | 2s dirty commit |
| Hidden tab | Particle loop pauses |

### User scenario (expected path)

1. Morning: enable living + rotation + lighting → dawn wall.  
2. Study: companions react once per reading pulse (not double).  
3. Particles match night tags in evening.  
4. Restart: prefs persist; session windows per desktop pref.  
5. Disable living layer: static desk restored (not stuck black).

---

## Pass 2 — Additional fixes (continue)

### FIX-08 — OS host pets ignored multi-monitor / desk size

| | |
|---|---|
| **Problem** | Host pets used raw Study OS `x/y` on a different-sized OS window → wrong place or off-screen. |
| **Cause** | No mapping from desk space → host viewport. |
| **Fix** | Bridge pushes `deskW`/`deskH`; host scales positions into primary work area (and offsets primary within virtual desktop when span=all). |
| **Files** | `companionOsBridge.ts`, `CompanionHostView.tsx`, `companionHost.ts` (`getViewport`) |
| **Verify** | Enable OS pets; pets appear on primary work area proportional to desk positions. |

### FIX-09 — Host after sleep / unlock

| | |
|---|---|
| **Problem** | Host could lose always-on-top or click-through after sleep. |
| **Cause** | No power-resume handling. |
| **Fix** | `powerMonitor` resume/unlock → re-place host, re-assert ignore-mouse, re-push state, `companionHost:wake` for renderer. |
| **Files** | `companionHost.ts`, preload, `CompanionHostView.tsx` |
| **Verify** | Sleep/wake with host on; empty space still click-through. |

### FIX-10 — Fade vs crossfade

| | |
|---|---|
| **Problem** | `fade` behaved like crossfade. |
| **Cause** | Same promote path for both. |
| **Fix** | `fade`: set front to −1 (black stage) for half duration, then promote; `crossfade`: dual opacity swap. |
| **Files** | `WallpaperStage.tsx` |
| **Verify** | Settings transition Fade shows brief black; Crossfade blends layers. |

### FIX-11 — Calendar companion pulse spam

| | |
|---|---|
| **Problem** | Calendar change listeners re-fired “Exam day” repeatedly. |
| **Cause** | `pulseCalendarCompanions` had no day/category debounce. |
| **Fix** | Pulse once per calendar day + note key. |
| **Files** | `schedules.ts` |
| **Verify** | Edit calendar twice same day → one companion calendar reaction. |

---

## Pass 3 — Additional fixes

### FIX-12 — All-displays pets only on primary

| | |
|---|---|
| **Problem** | Span=all expanded host but all pets stayed on primary work area. |
| **Cause** | Mapping always used primary work area. |
| **Fix** | Stable hash of companion id → display index; map into that display’s work area within virtual bounds. |
| **Files** | `CompanionHostView.tsx` |
| **Verify** | All displays mode with 2+ monitors → pets distributed across screens. |

### FIX-13 — Day-cycle playlist missing exam/study items on old saves

| | |
|---|---|
| **Problem** | Older `jp-os-environment-v1` playlists lacked `dc-ember` / `dc-crimson`. |
| **Cause** | Normalize kept saved playlist as-is. |
| **Fix** | Merge missing default day-cycle items by id. |
| **Files** | `environmentStore.ts` |
| **Verify** | Calendar exam wall can resolve after upgrade. |

### FIX-14 — Achievement milestone selection

| | |
|---|---|
| **Problem** | Only first crossed milestone celebrated (e.g. always 3-day when jumping higher). |
| **Cause** | `break` on first match. |
| **Fix** | Celebrate **highest** newly crossed streak / char bucket. |
| **Files** | `achievements.ts` |
| **Verify** | Streak 10 with last=0 → celebrates 7-day, not 3-day. |

### FIX-15 — Storage migration DOMException noise

| | |
|---|---|
| **Problem** | Boot log: `[storage] migration failed: [object DOMException]`. |
| **Cause** | IndexedDB closed/blocked; errors propagated as uncaught. |
| **Fix** | Reset `dbPromise` on versionchange/close; one retry on InvalidStateError; migration runner catches and warns without failing boot. |
| **Files** | `storage/db.ts`, `storage/migrationRunner.ts` |
| **Verify** | Boot succeeds; warn only if IDB truly unavailable; localStorage cache still works. |

---

## Pass 4 — Additional fixes

### FIX-16 — Fade transition clobbered wrong wall buffer

| | |
|---|---|
| **Problem** | Fade sometimes showed the wrong layer or skipped black gap. |
| **Cause** | `frontRef` was forced from `front === -1` back to `0`, so `back` buffer was computed wrong. |
| **Fix** | Track `visibleFrontRef` (always 0\|1) separately from display `front` (may be -1). |
| **Files** | `WallpaperStage.tsx` |
| **Verify** | Fade transition: outgoing disappears, brief black, then new wall. |

### FIX-17 — Wallpaper stage re-ticked on every companion persist

| | |
|---|---|
| **Problem** | Env object identity change (companion save) restarted the 30s timer and re-applied walls. |
| **Cause** | `useEffect(..., [env])`. |
| **Fix** | Hard deps `enabled` + `rotationEnabled`; soft settings via `envRef`. |
| **Files** | `WallpaperStage.tsx` |
| **Verify** | Companions wander without wallpaper flicker. |

### FIX-18 — Custom CSS applied even when sandbox disabled

| | |
|---|---|
| **Problem** | Boot re-applied user CSS after user disabled the sandbox. |
| **Cause** | `bootCustomCss` ignored `customCssEnabled`. |
| **Fix** | Boot checks personalization toggle before inject. |
| **Files** | `customCss.ts` |
| **Verify** | Disable sandbox, restart → no `#jp-user-css`. |

### FIX-19 — Host pets stale after Study OS resize

| | |
|---|---|
| **Problem** | Desk size change left host mapping using old deskW/H. |
| **Cause** | Bridge only pushed on env/desk-pref events. |
| **Fix** | Window `resize` re-pushes companion state with new desk metrics. |
| **Files** | `companionOsBridge.ts` |
| **Verify** | Resize main window with OS pets on → pets re-scale. |

### FIX-20 — Calendar wall change did not nudge rotation immediately

| | |
|---|---|
| **Problem** | Adding an exam event waited up to 30s for wall swap. |
| **Cause** | WallpaperStage only ticks on interval. |
| **Fix** | Calendar ping re-dispatches env-changed so stage re-resolves. |
| **Files** | `EnvironmentStack.tsx` |
| **Verify** | Add exam today + calendar walls → wall updates promptly. |

---

## Pass 5 — Additional fixes

### FIX-21 — Soft env changes no longer re-resolved walls (regressed FIX-20)

| | |
|---|---|
| **Problem** | After FIX-17 hard-deps, calendar / rule / playlist updates only hit `setEnv` and waited up to 30s for the interval tick. |
| **Cause** | Tick loop no longer re-ran on soft env identity changes. |
| **Fix** | `tickRef` soft re-tick on every `env` update; `lastKey` still short-circuits identical walls (companion saves stay cheap). |
| **Files** | `WallpaperStage.tsx`, `EnvironmentStack.tsx` (calendar always echoes when rotation on) |
| **Verify** | Add exam today → wall swaps promptly; companion wander does not flicker walls. |

### FIX-22 — Hidden companions stayed gone until next state write

| | |
|---|---|
| **Problem** | “Hide 1 hour” filtered visibility by time, but no re-render fired when the timer elapsed. |
| **Cause** | No timeout to force list refresh at `hiddenUntil`. |
| **Fix** | Schedule a snapshot re-render at the next `hiddenUntil`. |
| **Files** | `CompanionLayer.tsx` |
| **Verify** | Hide 1 hour (or temporary short hide in dev) → pet reappears without restart. |

### FIX-23 — Companion wander kept rAF while document hidden

| | |
|---|---|
| **Problem** | Particles paused on `visibilitychange`; companions kept animating and dirty-committing. |
| **Cause** | Wander loop had no visibility gate. |
| **Fix** | Pause rAF when hidden; flush dirty positions; resume on visible. |
| **Files** | `CompanionLayer.tsx` |
| **Verify** | Minimize / switch away → no continuous companion writes; return → wander resumes. |

### FIX-24 — Morning/night companion pulse on every remount

| | |
|---|---|
| **Problem** | Type filter / companion toggle remounts re-fired “Good morning” / night status. |
| **Cause** | Local hour-pulse had no cross-remount debounce. |
| **Fix** | Module-level day + period key so each period fires once per calendar day. |
| **Files** | `CompanionLayer.tsx` |
| **Verify** | Toggle companion type midday → no repeated morning status. |

### FIX-25 — Multi-monitor plug left host pets with stale geometry

| | |
|---|---|
| **Problem** | Display add/remove re-placed the host window but host renderer kept old viewport mapping. |
| **Cause** | Only `placeHost` on display metrics; no wake/state re-push. |
| **Fix** | On display events: place, send `companionHost:wake`, re-send latest state. |
| **Files** | `companionHost.ts` |
| **Verify** | Plug second monitor with OS pets on → pets remapped; click-through restored. |

---

## Pass 6 — Boot / storage / shortcuts debug (app restart)

### FIX-26 — IndexedDB corrupt profile left migration dead

| | |
|---|---|
| **Problem** | Boot: `migration skipped (IndexedDB unavailable): Data lost due to missing file`. |
| **Cause** | Chromium IDB leveldb file corrupted (crash / multi-instance). |
| **Fix** | On corrupt open errors, `deleteDatabase` once and reopen; clearer error messages. |
| **Files** | `storage/db.ts`, `storage/migrationRunner.ts`, `main.tsx` |
| **Verify** | Restart → migration runs or recreates empty IDB; localStorage still boots. |

### FIX-27 — Companion host ran full main boot path

| | |
|---|---|
| **Problem** | Host window ran migrations, tokenizer warm, shortcuts install. |
| **Cause** | `main.tsx` always ran full boot. |
| **Fix** | Skip CSS/env/migrations/tokenizer/shortcuts when `?companionHost=1`. |
| **Files** | `main.tsx` |
| **Verify** | Enable OS pets → host stays light; main window still full. |

### FIX-28 — Mouse shortcuts double-fired

| | |
|---|---|
| **Problem** | Middle/side buttons could fire twice (`mousedown` + `auxclick`). |
| **Fix** | Listen only on `mousedown`. |
| **Files** | `keyboardShortcuts.ts` |

### FIX-29 — knownWords `??` dead code warning

| | |
|---|---|
| **Problem** | Vite warning: `?? 0` always unused after `% 4`. |
| **Fix** | Remove redundant nullish coalesce. |
| **Files** | `knownWords.ts` |

---

## Remaining Issues / Limitations

| Item | Severity | Notes |
|---|---|---|
| ~~No true snow accumulation~~ | Done | Ground piles + melt when snow off |
| ~~No full playlist editor UI~~ | Done | PlaylistEditor: items, rules, image/video |
| All-displays pets use hash distribution, not free placement per monitor | Low | Intentional simple policy |
| Manual multi-hour stress | Manual | Still run via LIVING_DESKTOP_QA.md |
| Full LIVING_DESKTOP_QA manual matrix | Manual | Code-pass done; user hardware matrix open |
| CSP / React DevTools dev warnings | Dev-only | Expected in forge dev |

---

## Files Changed

### Pass 1
```
src/renderer/environment/types.ts
src/renderer/environment/EnvironmentStack.tsx
src/renderer/environment/WallpaperStage.tsx
src/renderer/environment/ParticleLayer.tsx
src/renderer/environment/particleEngine.ts
src/renderer/environment/CompanionLayer.tsx
src/renderer/environment/noctisLightBridge.ts
```

### Pass 2
```
src/main/companionHost.ts
src/preload.ts
src/renderer/window.d.ts
src/renderer/environment/CompanionHostView.tsx
src/renderer/environment/companionOsBridge.ts
src/renderer/environment/WallpaperStage.tsx
src/renderer/environment/schedules.ts
docs/IMMERSIVE_DESKTOP_LIVING_LAYER_DEBUG.md
```

### Pass 3
```
src/renderer/environment/CompanionHostView.tsx
src/renderer/environment/environmentStore.ts
src/renderer/environment/achievements.ts
src/renderer/storage/db.ts
src/renderer/storage/migrationRunner.ts
docs/IMMERSIVE_DESKTOP_LIVING_LAYER_DEBUG.md
```

### Pass 4
```
src/renderer/environment/WallpaperStage.tsx
src/renderer/environment/EnvironmentStack.tsx
src/renderer/environment/companionOsBridge.ts
src/renderer/customCss.ts
src/renderer/main.tsx
docs/IMMERSIVE_DESKTOP_LIVING_LAYER_DEBUG.md
```

### Pass 5
```
src/renderer/environment/WallpaperStage.tsx
src/renderer/environment/EnvironmentStack.tsx
src/renderer/environment/CompanionLayer.tsx
src/main/companionHost.ts
docs/IMMERSIVE_DESKTOP_LIVING_LAYER_DEBUG.md
```

### Pass 6
```
src/renderer/storage/db.ts
src/renderer/storage/migrationRunner.ts
src/renderer/main.tsx
src/renderer/keyboardShortcuts.ts
src/renderer/knownWords.ts
docs/IMMERSIVE_DESKTOP_LIVING_LAYER_DEBUG.md
```

---

## Progress snapshot (2026-07-12 restart)

| Track | Done | Notes |
|---|---|---|
| Engineering audit & fixes (FIX-01…29) | **~92%** | Remaining: product polish (snow pile, playlist editor) |
| Automated tests (`vitest`) | **100%** of suite | 135/135 pass |
| Code-path living-layer verification | **~85%** | Passes 1–6; soft/calendar/host hardened |
| Manual QA handbook matrix | **~25%** | Needs hands-on LIVING_DESKTOP_QA.md on target HW |
| Shortcuts settings completeness | **~90%** | Edit/add/mouse/multi-key; not all obscure UI keys |
| Overall release readiness (living + shortcuts) | **~70%** | Blocked on long stress + multi-monitor manual |

---

## Regression Checklist (reuse after future living-layer PRs)

- [ ] Living **off** → no `.os-env-stack`  
- [ ] Rotation on → wall paints; off → shell wallpaper returns (not stuck)  
- [ ] Particles on → canvas; off → gone; preset swap culls old kinds  
- [ ] Companions wander without tanking FPS; positions persist after ~2s / drag end  
- [ ] Disabling a companion type removes that type  
- [ ] Reading once → single companion reaction (not double)  
- [ ] `noctis:pulse` still fires when living enabled  
- [ ] Classic Light Start/taskbar still opaque  
- [ ] Session restore on/off across restart  
- [ ] OS host enable/disable; empty space click-through  
- [ ] No imports of CityService / city IPC from living layer  
- [ ] Calendar exam today → wall updates within ~1s (not 30s)  
- [ ] Hide companion 1h → reappears after expiry without restart  
- [ ] Morning status does not re-spam when toggling companion types  

---

## Release Notes (engineering)

- Living layer is **opt-in** (default off).  
- Companion performance fixed for production use.  
- Wallpaper stage no longer traps shell background state.  
- Particle weather transitions clean old kinds.  
- Soft env / calendar changes re-resolve walls without thrashing the stage.  
- OS host remaps after sleep and display topology changes.  
- Noctis remains **pulse-only**; city simulation independent.  

---

*Use `docs/LIVING_DESKTOP_QA.md` for exhaustive manual cases. This file records what was fixed and verified in the engineering pass.*
