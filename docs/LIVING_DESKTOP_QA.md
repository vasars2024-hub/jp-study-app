# Immersive Desktop Living Layer — QA, Debugging & Testing Handbook

**Status:** Living document (fill Status columns as tests are run)  
**Scope:** Immersive Desktop Living Layer + related personalization/desktop prefs that gate it  
**Audience:** Developers and release engineers verifying behaviour months after implementation  
**Last aligned to codebase:** 2026-07-12 (refresh: document map + gap-fills)  

**This document is not marketing.** Features below are treated as **unverified until tested**.

### Document map (brief §1–9 → handbook sections)

| Brief outline | Handbook |
|---|---|
| 1. System Overview | §1 |
| 2. Architecture Map | §2 |
| 3. Feature Testing Matrix | §3 |
| 4. Debugging Procedures | §11 (+ per-system debug in §4–8) |
| 5. Regression Checklist | §12 |
| 6. Performance Checklist | §13 |
| 7. Known Risks | §14 |
| 8. Optional Backlog QA | §15 |
| 9. Release Readiness Checklist | §16 |
| Core systems 1–8 (wallpaper … performance) | §4–10, §13 |
| Optional backlog 1–4 | §15.1–15.4 |

---

## 1. System Overview

### 1.1 Purpose

The Living Layer adds optional atmosphere and soft presence on the Study OS desktop:

| Layer | Role |
|---|---|
| Wallpaper rotation | World / environment switching |
| Particles | Atmosphere (canvas, non-interactive) |
| Day-cycle lighting | Ambient colour wash |
| Companions | Inhabitants (DOM, interactive) |
| OS companion host | Optional pets over the real Windows desktop |
| Achievements / Noctis pulse | Soft reactions to study activity (not city simulation) |

**Immersion goal (test against this):**

> The desktop should feel like a living environment, not a pile of disconnected effects.

Evaluate every feature for:

1. **Functionality** — Does it work?  
2. **Reliability** — Does it keep working over time and restarts?  
3. **Performance** — Does it avoid harming icon drag, windows, and study apps?  
4. **Integration** — Does it coexist with themes, widgets, calendar, readers?  
5. **Immersion** — Does the combination feel intentional?

### 1.2 Default behaviour (critical)

| Gate | Default | Effect if off |
|---|---|---|
| Living desktop layer (`enabled`) | **false** | Entire `EnvironmentStack` unmounts (zero cost) |
| Wallpaper rotation | false | Shell paints static/layout wallpaper |
| Particles | false | No particle canvas |
| Companions | false | No companion DOM |
| OS desktop pets | false | No host window |
| Day-cycle lighting | false | No lighting wash |
| Calendar walls | false | Time-of-day rules only |
| Achievement celebrations | true (when env on) | No streak/milestone companion events from watcher |

**Baseline test:** Fresh install / wiped env storage → desktop must match “classic” Study OS (icons/start/taskbar only), no particles/companions/host.

### 1.3 Settings locations

| Feature group | UI path |
|---|---|
| Master living layer, rotation, particles, lighting, calendar walls, achievements | **Settings → Personalization → Living atmosphere** |
| Custom CSS, Reset look | **Settings → Personalization → Advanced** |
| Companions, OS host, multi-monitor | **Settings → Desktop → Companions** |
| Session restore | **Settings → Desktop → Session** |
| Reduce motion | **Settings → Display → Animation** |
| Theme / accent / density | **Settings → Personalization** |

---

## 2. Architecture Map

### 2.1 Runtime tree

```
DesktopShell (src/renderer/components/DesktopShell.tsx)
├── Static wall (preset/image/video) when rotation inactive
├── EnvironmentStack          // only if env.enabled
│   ├── WallpaperStage        // rotationEnabled
│   ├── DayCycleLightingLayer // dayCycleLighting
│   ├── ParticleLayer         // particlesEnabled && tier !== off
│   └── CompanionLayer        // companionsEnabled
├── Icons / windows / widgets / Start / taskbar
├── startCompanionOsBridge()  // mirrors pets to OS host when companionsOnOsDesktop
├── startAchievementWatcher()
└── startNoctisLightBridge()  // event-only; no CityService

Main process (src/main/companionHost.ts)
└── Transparent always-on-top BrowserWindow (?companionHost=1)
    └── CompanionHostView.tsx
```

### 2.2 Module index

| Module | Path | Responsibility |
|---|---|---|
| Environment store | `src/renderer/environment/environmentStore.ts` | Load/save/normalize env prefs |
| Types / defaults | `src/renderer/environment/types.ts` | `EnvironmentSettings`, playlists, rules |
| Wall catalog | `src/renderer/environment/wallCatalog.ts` | Preset gradients + tags |
| Schedules | `src/renderer/environment/schedules.ts` | `resolveWall`, calendar pulse |
| Wallpaper stage | `src/renderer/environment/WallpaperStage.tsx` | Crossfade paint |
| Particles | `particleEngine.ts`, `ParticleLayer.tsx` | rAF sim + draw |
| Companions | `CompanionLayer.tsx`, `companionCatalog.ts`, `companionEvents.ts` | Wander, react, persist |
| OS bridge | `companionOsBridge.ts` | Enable host + push state |
| OS host (main) | `src/main/companionHost.ts` | Window bounds, click-through IPC |
| OS host (UI) | `CompanionHostView.tsx` | Host-only render |
| Lighting | `dayCycleLighting.ts`, `DayCycleLightingLayer.tsx` | Time-of-day overlay |
| Achievements | `achievements.ts` | Streak / char buckets → events |
| Noctis light | `noctisLightBridge.ts` | `noctis:pulse` only |
| Personalization | `osPersonalization.ts` | Theme-adjacent look tokens |
| Custom CSS | `customCss.ts` | Sandbox style tag |
| Desktop prefs | `desktopPrefs.ts` | Icons, session, host span |
| Settings UI | `DesktopSettings.tsx` | All toggles |
| Layout | `desktopState.ts`, `main/desktop.ts` | Icons/windows geometry |

### 2.3 Storage keys

| Key | Location | Contents |
|---|---|---|
| `jp-os-environment-v1` | localStorage | Living layer master settings, playlists, companions |
| `jp-os-personalization-v1` | localStorage | Density, radius, accent mode, dim, etc. |
| `jp-os-desktop-prefs-v1` | localStorage | Icon size, snap, session restore, host displays |
| `jp-os-custom-css-v1` | localStorage | User CSS text |
| `jp-os-achievements-v1` | localStorage | Last celebrated streak / daily char bucket |
| `jp-os-theme` | localStorage | Theme id |
| `jp-os-accent` | localStorage | Legacy accent preset id |
| `jp-os-reduce-motion` | localStorage | `"1"` / absent |
| `desktop-layout.json` | Electron userData | Dual-desktop layout (icons, windows, wallpaper, widgets) |

**Wipe for clean living-layer retest (DevTools console):**

```js
localStorage.removeItem('jp-os-environment-v1');
localStorage.removeItem('jp-os-achievements-v1');
// optional full look wipe:
localStorage.removeItem('jp-os-personalization-v1');
localStorage.removeItem('jp-os-desktop-prefs-v1');
localStorage.removeItem('jp-os-custom-css-v1');
location.reload();
```

### 2.4 Event bus

| Event | Emitter | Consumers |
|---|---|---|
| `jp-os-environment-changed` | `saveEnvironment` | Stack, settings, OS bridge |
| `env:companion` | `emitCompanionEvent` | CompanionLayer, noctis light bridge |
| `jp-reading-recorded` | `stats.recordReading` | CompanionLayer, achievements, noctis bridge |
| `flashcard-deck-changed` | flashcard deck | CompanionLayer, noctis bridge |
| `calendar-events-changed` | calendar module | EnvironmentStack calendar pulse |
| `noctis:pulse` | noctisLightBridge | Future listeners only (no city engine today) |
| `companionHost:state` | main process → host | CompanionHostView |

### 2.5 Enable dependency graph

```
env.enabled
 ├─ rotationEnabled → WallpaperStage
 ├─ dayCycleLighting → lighting overlay
 ├─ particlesEnabled && performanceTier ≠ off → ParticleLayer
 ├─ companionsEnabled → CompanionLayer
 │    └─ companionsOnOsDesktop → companion host window
 └─ achievementCelebrations → still requires env.enabled for meaningful stack presence
```

---

## 3. Feature Testing Matrix

Fill **Status** with: `Pass` / `Fail` / `Blocked` / `N/A` and date.

| Feature | Expected behaviour | Primary test cases | Failure signs | Status |
|---|---|---|---|---|
| Master living layer | Off → no env stack; on → stack mounts | Toggle off/on; restart | Particles/companions when master off | |
| Wallpaper rotation | Time-of-day rules pick preset; crossfade | Enable rotation; change system clock / wait for slot | Instant wrong wall; black desk; no fade | |
| Calendar walls | Exam/study/assignment today override TOD | Add calendar exam; enable calendar walls | Wrong priority; no override | |
| Particles | Canvas under icons; non-blocking | Enable fireflies; drag icons | FPS collapse; icon drag lag; canvas intercepts clicks | |
| Match suggestions | Presets from wall/time tags | Night → fireflies/stars | Wrong preset; empty canvas | |
| Manual presets | Multi-select when match off | Pick rain only | All presets at once unexpectedly | |
| Day-cycle lighting | Wash updates with phase | Enable lighting; change intensity | Solid black/white overlay; no update | |
| Companions in-app | Spawn, wander, drag, menu | Enable companions | Frozen; duplicates; under taskbar only | |
| Companion reactions | Study/cards/music/time change mood | Read book; play music | No status change | |
| Achievements | Streak/char milestones celebrate | Trigger streak bucket | Spam every second; never fires | |
| OS host | Transparent overlay; click-through empty | Enable OS desktop | Blocks desktop; no pets; crash | |
| Multi-monitor host | Primary vs all displays | Plug second monitor; switch mode | Host only primary when “all”; wrong bounds | |
| Session restore | Windows restore if on | Restart with apps open | Windows always empty or always force-open | |
| Custom CSS | Apply / block / clear / reset | Valid CSS; `@import` blocked | Broken UI with no recovery | |
| Themes + living | Light theme chrome opaque | Classic Light + living on | Black Start menu; invisible text | |
| Reduce motion | Cuts transitions; stops particle motion | Toggle reduce motion | Animations continue full rate | |
| Noctis pulse | Event only; no city state | Listen for `noctis:pulse` in console | Unexpected city files written | |

---

## 4. Wallpaper Rotation System

### 4.1 Feature description

When `enabled && rotationEnabled`, `WallpaperStage` paints the desktop background from playlists + rules (`resolveWall`). The shell suppresses its own wall (`wall-from-env`) while rotation is active.

**Source:** `schedules.ts`, `WallpaperStage.tsx`, `wallCatalog.ts`, `types.ts`  
**UI:** Personalization → Living atmosphere → “Rotate wallpaper by time of day”

### 4.2 Expected behaviour

- Default playlist id: `day-cycle`  
- Time-of-day mapping (local clock):

| Hours | Item (default) |
|---|---|
| 05–11 | Dawn |
| 11–17 | Midday |
| 17–21 | Dusk |
| 21–24 | Night |
| 00–05 | Late night (Aurora) |

- Transitions: `crossfade` | `fade` | `cut`; duration slider 200–3000 ms  
- Reduce motion → effective cut (0 ms)  
- Re-evaluates about every 30s  
- Calendar rules (if `calendarWallsEnabled`): exam > study > assignment priorities above TOD  

### 4.3 Test cases

| ID | Steps | Expected |
|---|---|---|
| WR-01 | Master on, rotation off | Static wallpaper from Desktop settings/layout |
| WR-02 | Enable rotation | Stage paints; Settings shows “Now: …” label |
| WR-03 | Set transition Crossfade, 1200 ms | Visible fade between walls when item changes |
| WR-04 | Set Cut | Instant swap |
| WR-05 | Enable reduce motion | No long fade |
| WR-06 | Restart app with rotation on | Same rule set restored; wall correct for clock |
| WR-07 | Disable master living layer | Rotation stops; shell wall returns |
| WR-08 | Calendar walls on + exam event today | Prefers exam veil (higher priority) |
| WR-09 | Calendar walls off + exam today | Time-of-day wall only |
| WR-10 | Corrupt `jp-os-environment-v1` to `{}` | Normalize to defaults without crash |
| WR-11 | Large playlist (20+ items) with short re-eval | No crash; memory stable; transitions may thrash — document FPS |
| WR-12 | Rapidly toggle rotation on/off 10× | Shell wall and stage swap cleanly; no stuck `wall-from-env` |
| WR-13 | Playlist item with missing image/video path | Fallback or blank layer without killing desktop |
| WR-14 | Prefs saved, kill app, restart | Rotation + transition settings restored |

### 4.4 Failure scenarios

| Symptom | Likely cause | Check |
|---|---|---|
| Black desktop | Stage failed; shell background neutral | Console errors; `wallFromEnv` stuck true |
| Never changes | Timer/rules; clock stuck in one band | Log `resolveWall(loadEnvironment())` |
| Flash / flicker | Crossfade layer order | WallpaperStage front/back indices |
| Image/video item blank | Media path hydrate failed | `mediaFileUrl` / wallpaper APIs |
| Layout wallpaper fights stage | Rotation off but `wallFromEnv` true | DesktopShell `onRotationActive` |

### 4.5 Debugging checklist

1. `loadEnvironment()` — `enabled`, `rotationEnabled`, `activePlaylistId`, `rules`  
2. `resolveWall(loadEnvironment(), new Date())` — item + reason  
3. Confirm `EnvironmentStack` mounted (DOM: `.os-env-stack`, `.os-wall-stage`)  
4. Confirm shell class `wall-from-env` only when rotation active  
5. Inspect localStorage `jp-os-environment-v1` JSON  
6. Verify reduce-motion class on `<html>`  

### 4.6 Persistence / assets / performance notes

- Playlists live in env store, not `desktop-layout.json` wallpaper field (layout wallpaper remains fallback when rotation off).  
- Large custom image/video libraries: stress-test memory when switching often.  
- Missing preset id: `getWallPreset` falls back to first catalog entry — verify no throw.  

---

## 5. Universal Particle Environment System

### 5.1 Feature description

Full-desk canvas (`pointer-events: none`) running an rAF simulation. Presets are independent of wallpaper; wall tags only **suggest** presets when match mode is on.

**Source:** `particleEngine.ts`, `ParticleLayer.tsx`  
**Caps:** low ~48 · medium ~120 · high ~240 × density (0–1)  
**UI:** Living atmosphere → particle toggles  

### 5.2 Expected behaviour

- Requires `enabled && particlesEnabled && performanceTier !== 'off'`  
- Reduce motion → clear canvas / no motion  
- Hidden document → loop pauses  
- Icons remain draggable; particles do not capture pointer  

### 5.3 General particle test cases

| ID | Steps | Expected |
|---|---|---|
| PT-01 | Enable particles, density 45%, medium | Visible atmosphere, usable UI |
| PT-02 | Density 0 | No/near-zero particles |
| PT-03 | Performance Off | No particles |
| PT-04 | Match wallpaper on + night | Fireflies and/or stars suggested |
| PT-05 | Match off + manual Rain only | Only rain |
| PT-06 | Disable particles | Canvas gone; no residual rAF cost |
| PT-07 | Drag desktop icons during particles | No lag regression vs particles off |
| PT-08 | Open many windows + high density | Acceptable FPS; document numbers |
| PT-09 | Reduce motion on | Simulation stops |
| PT-10 | Alt-tab away 2 min, return | Restarts cleanly without leak spike |
| PT-11 | Match on; force wall tag change night→day (rotation or clock) | Preset set changes; old particles replaced (population re-seeded via rAF config), no second canvas |
| PT-12 | Enable rain, then switch manual preset to snow only | Rain stops; snow only; no dual-stack of orphaned systems |
| PT-13 | Disable living master while particles running | Canvas unmounts; rAF stops |

### 5.3.1 Weather / wallpaper-change cleanup

When match mode is on, active presets are derived from **current wall tags** or time-of-day fallbacks (`ParticleLayer` → `activeTags` / `suggestPresetsFromTags`). There is a **single** canvas and particle array — not stacked independent weather systems.

| Check | Expected |
|---|---|
| Wallpaper/time tag change | Next frames use new preset list; particle kinds gradually reflect new spawn mix |
| Disable particles | Component unmount; no leftover full-screen canvas |
| Multiple “layers” | **Not multi-canvas** — multi-preset means mixed kinds in one sim |

### 5.4 Fireflies

| Check | Expected |
|---|---|
| Spawn | Soft glowing orbs mid/lower field |
| Movement | Slow drift + twinkle |
| Night boost | Brighter when tags night/evening |
| Day | Dimmer if nightBoost false |
| Background | Readable over dark walls; may be weak on snow/midday |

### 5.5 Rain

| Check | Expected |
|---|---|
| Motion | Diagonal streaks, high vertical speed |
| Density | Scales with density × tier |
| Suggest tags | `rain`, `storm` (not auto on default day-cycle without those tags) |
| Performance | Worst-case with high density — measure FPS |

### 5.6 Snow

| Check | Expected |
|---|---|
| Motion | Drift + fall; wrap when leaving bottom |
| Layering | Above wallpaper/lighting, below companions |
| **Accumulation** | **Not implemented** — flakes wrap/respawn; do **not** expect ground pile-up |
| Suggest tags | `winter`, `snow` |

### 5.7 Other presets (smoke)

| Preset | Smoke expectation |
|---|---|
| Dust | Slow floating specs (day tags) |
| Leaves | Larger falling ovals |
| Stars | Twinkle upper field |
| Magic | Rising purple/pink motes |

### 5.8 Failure scenarios / debug

| Symptom | Check |
|---|---|
| Particles block clicks | `.os-particle-canvas` must be `pointer-events: none` |
| Particles after disable | Component unmounted; no rAF in Performance panel |
| Memory climb | Long session PT-10; watch heap |
| GPU hot | Lower tier/density; reduce motion |
| Empty with match on | Tags may not match any preset — expect dust fallback in engine |

---

## 6. Living Desktop Environment (Atmosphere)

### 6.1 Description

Combination of rotation + lighting + particles + optional calendar overrides. Judge immersion, not only individual toggles.

### 6.2 Day-cycle lighting

**Source:** `dayCycleLighting.ts`, `DayCycleLightingLayer.tsx`  
**Phases:** dawn (5–8), day (8–17), dusk (17–21), night (else)  
**UI:** Living atmosphere → Ambient light wash + intensity  

| ID | Steps | Expected |
|---|---|---|
| LT-01 | Lighting on, intensity 45% | Visible but non-opaque wash |
| LT-02 | Intensity 0 | Effectively none |
| LT-03 | Intensity 100% | Strong wash; UI still readable |
| LT-04 | Classic Light theme + night lighting | Chrome remains light/opaque; wash only on desk area |

### 6.3 Immersion evaluation (subjective but required)

Rate 1–5 after 5 minutes with rotation + particles + lighting:

| Question | Pass criteria |
|---|---|
| Feels coordinated? | Effects share time-of-day story |
| Feels static wallpaper only? | Fail if yes |
| Feels screensaver-y / distracting? | Fail if study apps unusable |
| Disconnected effects? | Fail if particles ignore night/day entirely with match on |

### 6.4 Failure / debug

- Lighting covering Start/taskbar incorrectly → check z-index (stack under icons; taskbar outside stack)  
- Windows case import: lighting util is `dayCycleLighting.ts`; component is `DayCycleLightingLayer.tsx` (do not import `DayCycleLighting` bare on Windows)

---

## 7. Desktop Companion System

### 7.1 Feature description

DOM companions with CSS silhouettes (no emoji). Types: **study-buddy**, **critter**, **timekeeper**, **noctis**.

**Source:** `CompanionLayer.tsx`, `companionCatalog.ts`, `companionEvents.ts`  
**UI:** Desktop → Companions  

### 7.2 Expected behaviour

| Area | Behaviour |
|---|---|
| Spawn | Defaults when no saved instances; filtered by `companionTypes` |
| Wander | Reactivity quiet/normal/playful speeds |
| Drag | Pointer drag; locked skips drag |
| Click | Menu: lock place, hide 1 hour, close |
| Persist | Positions/moods in `env.companions` |
| Reduce motion | No wander animation loop |
| Hide 1h | `hiddenUntil` timestamp |

### 7.3 Appearance tests

| ID | Steps | Expected |
|---|---|---|
| CP-01 | Enable companions | 1–4 creatures visible |
| CP-02 | Toggle type set | Reseed when types change (companions cleared) |
| CP-03 | Noctis variant | Purple glow silhouette (`variant-noctis`) |
| CP-04 | Under taskbar / off-screen | Positions clamped to layer bounds |

### 7.4 Behaviour tests

| ID | Steps | Expected |
|---|---|---|
| CP-10 | Open reader, accumulate reading | Study buddy / noctis status update |
| CP-11 | Change flashcard deck | Flashcard reaction |
| CP-12 | Play/stop music | Music mood/status |
| CP-13 | Quiet vs playful | Playful moves more |
| CP-14 | Celebrate off | Happy without celebrate animation |
| CP-15 | Streak milestone | Achievement celebration if enabled |

### 7.5 Persistence tests

| ID | Steps | Expected |
|---|---|---|
| CP-20 | Move companion, wait >1s, restart | Position restored |
| CP-21 | Disable companions, re-enable | Instances may reseed or restore from store |
| CP-22 | Hide 1 hour, restart within hour | Still hidden |

### 7.6 Failure scenarios / debug

| Symptom | Check |
|---|---|
| Frozen | reduce-motion; pauseWhenStudying; locked |
| Duplicates | Multiple EnvironmentStacks (should be one) |
| Clicks fall through | `.os-companion { pointer-events: auto }` inside stack `none` |
| Never reacts | Event names; `companionsEnabled`; master off |
| Always reseeding | Type-set change clears `companions: []` |

---

## 8. Outside-App Desktop Integration (Companion Host)

### 8.1 Feature description

Transparent, always-on-top, skip-taskbar Electron window loading `?companionHost=1`. Click-through via `setIgnoreMouseEvents(true, { forward: true })`; host disables ignore when cursor over a companion.

**Main:** `src/main/companionHost.ts`  
**UI:** `CompanionHostView.tsx`  
**Bridge:** `companionOsBridge.ts`  

**Requires full app restart after main/preload changes.**

**Not in this subsystem:** Study OS **widgets** (WidgetGallery / WidgetFrame) are in-app desktop chrome, not OS overlays. Test widgets under §9.2, not as outside-app host features.

### 8.2 Expected behaviour

- Empty space: clicks pass to underlying OS apps  
- Companion hit targets: interactive  
- Menu: Open Study OS, Close  
- Closes with main window / app quit  
- Span: primary work area **or** union of all display bounds  

### 8.3 Test cases

| ID | Steps | Expected |
|---|---|---|
| OH-01 | Enable OS desktop pets | Host window appears; pets visible |
| OH-02 | Click empty area | Focuses app under host |
| OH-03 | Click companion | Menu opens |
| OH-04 | Open Study OS from menu | Main window focuses |
| OH-05 | Disable OS pets | Host closes |
| OH-06 | Monitors: All displays | Host spans virtual desktop |
| OH-07 | Monitors: Primary | Host matches primary work area |
| OH-08 | Unplug/plug display | Host repositions (display-metrics events) |
| OH-09 | Sleep/wake | Host still click-through; pets present |
| OH-10 | Quit Study OS | Host does not remain orphaned |

### 8.4 Risks (must verify)

| Risk | How to detect |
|---|---|
| Blocks interaction | Cannot click desktop icons under empty host |
| Wrong z-order | Host under other windows always / covers fullscreen badly |
| Resource leak | Host process after quit |
| Coordinate mismatch | Pets off-screen when span mode changes |

### 8.5 Debug

1. Confirm `window.api.companionHostIsOpen()`  
2. Main process: host bounds vs `screen.getAllDisplays()`  
3. Host DevTools only if launched with logging; check `companionHost:state` payloads  
4. Click-through stuck off → host captures all mouse; reload host or toggle enable  

---

## 9. Study OS Integration Testing

### 9.1 Themes

| ID | Steps | Expected |
|---|---|---|
| IN-01 | Classic Light + living on | Start/taskbar opaque light (`--chrome`) |
| IN-02 | Auto theme toggle | Theme follows OS; living still works |
| IN-03 | High contrast theme | Readable companions/settings |

### 9.2 Widgets / windows / taskbar

| ID | Steps | Expected |
|---|---|---|
| IN-10 | Open widgets gallery + particles | No z-fight blocking taskbar |
| IN-11 | Maximize window over desk | Companions under window content |
| IN-12 | Drag icons with all living effects | Drag remains smooth |

### 9.3 Calendar

| ID | Steps | Expected |
|---|---|---|
| IN-20 | Exam event today + calendar walls | Wall override + optional companion calendar pulse |
| IN-21 | Delete event | Override clears after re-resolve |

### 9.4 Readers / study path

| ID | Steps | Expected |
|---|---|---|
| IN-30 | EPUB/novel reading time | Reading events fire companions/achievements |
| IN-31 | CSV editor heavy use | Living layer does not steal focus or freeze grid |

### 9.4.1 Sticky notes / note windows

| ID | Steps | Expected |
|---|---|---|
| IN-32 | Open sticky note over living desk | Note receives focus/input; companions do not steal typing |
| IN-33 | Drag note + companions present | Note drag works; companions stay under/around without blocking title bar |
| IN-34 | Particles + note | Particles never capture pointer over note |

### 9.5 Civilization / Noctis module

| ID | Steps | Expected |
|---|---|---|
| IN-40 | Open Noctis app section | App opens; living layer unrelated crash-free |
| IN-41 | Study with living on | **No** writes to city simulation files from living layer |
| IN-42 | Console listen `noctis:pulse` | Events may fire; city IPC not required |

### 9.6 Session

| ID | Steps | Expected |
|---|---|---|
| IN-50 | Session restore ON, open Media+Dictionary, restart | Windows return |
| IN-51 | Session restore OFF, restart | Icons/widgets/wallpaper yes; floating apps closed |

---

## 10. Settings Testing

### 10.1 Living atmosphere

| Control | Save | Restart | Notes |
|---|---|---|---|
| Enable living desktop | yes | yes | Master |
| Performance tier | yes | yes | Caps particles |
| Rotate wallpaper | yes | yes | |
| Transition / duration | yes | yes | On active playlist |
| Calendar walls | yes | yes | Needs calendar data |
| Day-cycle lighting / intensity | yes | yes | |
| Achievement celebrations | yes | yes | |
| Particles / density / match / presets | yes | yes | |

### 10.1.1 Audio controls (N/A for living-layer settings)

The living layer has **no dedicated audio settings panel**. Music influence is indirect:

| Path | What to test |
|---|---|
| Music app / widget plays | Companions may enter music-play mood via `onPlayingChanged` / `audioBus` |
| Music stops | music-stop reaction |
| Music visualizer settings | **Visualizer** category — separate from Living atmosphere; do not confuse the two |

**Do not fail living-layer settings QA for “missing audio controls.”** Fail only if companion music reactions never fire when music plays.

### 10.2 Companions

| Control | Save | Restart |
|---|---|---|
| Show in-app companions | yes | yes |
| Who (types) | yes | may reseed positions |
| Reactivity | yes | yes |
| Celebrate / calmer movement | yes | yes |
| OS desktop overlay | yes | host spawn |
| Monitors primary/all | yes | may need host reopen |

### 10.3 Advanced / session

| Control | Expected |
|---|---|
| Custom CSS Apply | Style applies if sanitized |
| Blocked constructs | Error message; no apply |
| Clear CSS | Tag removed; key cleared |
| Reset look | Personalization defaults + CSS clear |
| Session restore | Next launch only for window strip |

### 10.4 Corrupted preferences

| Action | Expected |
|---|---|
| Set env key to `not-json` | Defaults / no crash |
| Truncate playlists | Defaults injected |
| Missing calendar rules in old save | Store merges calendar rules back |

---

## 11. Debugging Procedures

### 11.1 Living layer not appearing

1. Settings: master **Enable living desktop layer** on.  
2. `loadEnvironment().enabled === true`.  
3. DOM: `.os-env-stack` exists.  
4. Sub-feature toggles on.  
5. Hard reload renderer; if host-related, full Electron restart.

### 11.2 Persistence not sticking

1. Inspect localStorage keys (section 2.3).  
2. Confirm `saveEnvironment` / `saveDesktopPrefs` not throwing (quota).  
3. For windows/icons: check `desktop-layout.json` in userData.  
4. Session restore OFF explains missing windows.

### 11.3 Performance regression

1. Toggle living **off** — if lag remains, not living layer.  
2. Lower particle density / set tier Low / disable particles.  
3. Disable companions (DOM + rAF wander).  
4. Performance panel: look for ParticleLayer rAF when disabled (leak).  

### 11.4 Windows path / import issues

- Utility: `dayCycleLighting.ts`  
- Component: `DayCycleLightingLayer.tsx`  
- Bare import `DayCycleLighting` on Windows can resolve to the utility (no default export).

### 11.5 Companion host

1. Full restart after main.ts/preload changes.  
2. `companionHostIsOpen()`.  
3. Span mode vs actual displays.  
4. Ensure main window close closes host.

---

## 12. Regression Checklist (pre-release)

Run with **living layer off** and **on** where noted.

- [ ] App boots without renderer crash  
- [ ] Living **off**: no `.os-env-stack`  
- [ ] Living **on** + rotation: wall paints; restart retains  
- [ ] Particles on/off; icon drag OK  
- [ ] Companions on/off; drag/menu OK  
- [ ] OS host enable/disable; click-through empty space  
- [ ] Multi-monitor primary/all (if hardware available)  
- [ ] Classic Light: Start/taskbar not black  
- [ ] Reduce motion stops heavy motion  
- [ ] Session restore on/off verified across restart  
- [ ] Custom CSS apply/clear/reset look  
- [ ] Calendar walls with exam event (optional if calendar used)  
- [ ] Achievements do not spam every frame  
- [ ] No unexpected city/Noctis simulation file changes  

---

## 13. Performance Checklist

### 13.1 Metrics to record

| Metric | How | Living off baseline | Living full load |
|---|---|---|---|
| Idle CPU % | Task Manager | | |
| Idle GPU % | Task Manager | | |
| Memory (renderer) | Task Manager / DevTools | | |
| Startup to interactive | Stopwatch | | |
| Icon drag smoothness | Subjective 1–5 | | |

### 13.2 Scenarios

| Scenario | Setup |
|---|---|
| P-01 Baseline | Living off |
| P-02 Light living | Rotation + lighting medium, particles off |
| P-03 Particles medium | Density 0.45, tier medium, fireflies |
| P-04 Particles stress | Density 1, tier high, multi-preset |
| P-05 Companions | All types, playful |
| P-06 Full immersion | Rotation + lighting + particles + companions |
| P-07 OS host + in-app | Both visible |
| P-08 Multi-monitor host | All displays |
| P-09 Long session | ≥ 2h (target 8h if possible) full immersion |
| P-10 Low-end proxy | Tier low, density ≤ 0.3 |

### 13.3 Pass guidance (adjust for hardware)

- Icon drag should remain usable under P-06.  
- Disabling living should drop CPU toward baseline within a few seconds.  
- No unbounded memory growth over long session (trend, not single spike).  

---

## 14. Known Risks

| Risk | Severity | Notes |
|---|---|---|
| Particle rAF cost | High | Primary performance risk |
| Companion host click-through bugs | High | Can brick desktop interaction |
| Multi-monitor coordinate confusion | Medium | Pets off-screen after span change |
| Env store vs layout wallpaper dual source | Medium | Confusion when debugging “wrong wall” |
| Windows case-insensitive imports | Medium | DayCycleLighting clash class of bugs |
| Translucent chrome regression | Medium | Start/taskbar must stay opaque |
| Achievement spam if state corrupt | Low | Check `jp-os-achievements-v1` |
| Noctis over-coupling | Process | Do not expand into CityService until engine ready |
| Storage migration DOMException | Existing | Seen in logs; separate from living layer but pollutes QA |

---

## 15. Optional Backlog QA

### 15.1 Custom CSS sandbox

**Path:** Personalization → Advanced  
**Code:** `customCss.ts`, style id `jp-user-css`, key `jp-os-custom-css-v1`, max 24k chars  

| ID | Test | Expected |
|---|---|---|
| CSS-01 | Apply `.os-start { outline: 2px solid red; }` | Visible outline |
| CSS-02 | Include `@import` | Rejected; message shown |
| CSS-03 | Include `javascript:` | Rejected |
| CSS-04 | Disable sandbox | Styles stop; draft may remain in textarea |
| CSS-05 | Clear CSS | Tag + storage gone |
| CSS-06 | Reset look | Personalization defaults + CSS cleared |
| CSS-07 | Restart after apply | CSS returns if still stored and enabled |

### 15.2 Multi-monitor companion host

**Path:** Desktop → Companions → Monitors  

| ID | Test | Expected |
|---|---|---|
| MM-01 | Primary | Host = primary work area |
| MM-02 | All displays | Host spans virtual bounds |
| MM-03 | Hot-plug display | Reposition without crash |
| MM-04 | Restart with All | Mode persists; host correct after full restart |

### 15.3 Noctis light bridge (shallow)

**Code:** `noctisLightBridge.ts`  
**In scope:** emit `noctis:pulse` on study/cards/achievements; soft companion flavour  

| ID | Test | Expected |
|---|---|---|
| NX-01 | Listen for `noctis:pulse` while reading | Event fires with kind/note |
| NX-02 | Noctis emissary enabled | Companion may show city-flavoured status |
| NX-03 | Inspect userData | No unexpected noctis simulation coupling from this bridge |

**Explicit non-tests (do not implement against):**

- `city:` IPC success  
- `noctis-state.json` mutations  
- CityService / economy / map systems  

### 15.4 Session restore

**Path:** Desktop → Session  
**Code:** `desktopPrefs.restoreSessionWindows`; applied in `hydrateLayout`  

| ID | Test | Expected |
|---|---|---|
| SR-01 | ON, open 2 apps, restart | Windows restore |
| SR-02 | OFF, open 2 apps, restart | No floating apps; icons remain |
| SR-03 | OFF → ON without restart | Still old session until next launch |
| SR-04 | Corrupt layout file | App recovers (main desktop store) |

---

## 16. Release Readiness Checklist

Living layer is **release-ready** only if:

### Must pass

- [ ] Master off = no living cost / no unexpected UI  
- [ ] Master on does not break icon drag or Start/taskbar  
- [ ] Light theme chrome remains correct  
- [ ] Settings persist across restart for env + desktop prefs  
- [ ] Particles and companions can be fully disabled  
- [ ] OS host click-through verified on target OS (Windows)  
- [ ] Host does not orphan after quit  
- [ ] No living-layer writes into Noctis simulation storage  
- [ ] Regression checklist (section 12) completed  
- [ ] Performance notes recorded for P-01 vs P-06  

### Should pass

- [ ] Calendar walls verified  
- [ ] Multi-monitor verified (if multi-monitor is a supported config)  
- [ ] Long-session smoke ≥ 2h  
- [ ] Custom CSS sandbox reject list verified  
- [ ] Immersion subjective score ≥ 3/5 for “coordinated atmosphere”  

### Release notes should mention

- Living layer default **off**  
- OS desktop pets experimental; full restart after host code changes  
- Session restore applies on next launch  
- Noctis simulation remains independent  

---

## Appendix A — Quick console helpers

```js
// Inspect env
JSON.parse(localStorage.getItem('jp-os-environment-v1') || 'null')

// Resolve wall now (if modules available in context)
// Use after importing via app source maps / temporary debug

// Wipe living layer
localStorage.removeItem('jp-os-environment-v1')
location.reload()
```

## Appendix B — File path quick reference

```
src/renderer/environment/
  EnvironmentStack.tsx
  environmentStore.ts
  types.ts
  wallCatalog.ts
  schedules.ts
  WallpaperStage.tsx
  particleEngine.ts
  ParticleLayer.tsx
  CompanionLayer.tsx
  companionCatalog.ts
  companionEvents.ts
  companionOsBridge.ts
  CompanionHostView.tsx
  dayCycleLighting.ts
  DayCycleLightingLayer.tsx
  achievements.ts
  noctisLightBridge.ts
  index.ts
src/main/companionHost.ts
src/renderer/components/DesktopShell.tsx
src/renderer/components/DesktopSettings.tsx
src/renderer/osPersonalization.ts
src/renderer/desktopPrefs.ts
src/renderer/customCss.ts
```

## Appendix C — Status log

| Date | Tester | Build | Notes |
|---|---|---|---|
| 2026-07-12 | — | post-L5 + backlog | Handbook authored; status columns not yet executed |
| 2026-07-12 | — | refresh | Document map; audio N/A; weather cleanup; notes; large playlist cases |

---

*End of handbook. Update this file when living-layer behaviour or settings paths change.*
