# Companion Integration

Sources: `environment/companionCatalog.ts`, `CompanionLayer.tsx`, `buddyRoutines.ts`,
`companionEvents.ts`, `CompanionHostView.tsx`, `companionOsBridge.ts`,
`achievements.ts`, `noctisLightBridge.ts`. **Pre-existing and mature** — Phase 3
audited and integrated, did not rebuild.

## What exists

- **Registry:** `companionCatalog.ts` — 4 types (study-buddy, critter, timekeeper,
  noctis), `CompanionInstance` (x/y/mood/status/facing/locked/routines).
- **Rendering:** `CompanionLayer.tsx` — DOM creatures (wander/drag/menu/lock/hide),
  persisted to `env.companions` (~2s debounce).
- **Behaviour engine:** `buddyRoutines.ts` — a sanitized, allowlisted, nested
  programmable routine engine driven from in-app and OS-host clicks.
- **Reaction bus:** `companionEvents.ts` — `env:companion` events.
- **OS presence:** transparent always-on-top host window (`CompanionHostView` +
  `companionOsBridge`), click-through, multi-monitor.
- **Achievements:** streak/daily-volume celebrations (`achievements.ts`).

## Reactions (event bus)

`emitCompanionEvent(kind, note)` → `CompanionLayer.react()` sets mood/status. Kinds:
`study` · `flashcard` · `music-play` · `music-stop` · `morning` · `night` · `tick` ·
`streak` · `achievement` · `calendar` · **`environment`** (Phase 3).

Existing seams feed it: `jp-reading-recorded` (study), `flashcard-deck-changed`,
`calendar-events-changed`, music (`onPlayingChanged`), time-of-day (internal), and
achievements.

## Phase 3 addition (M7)

A new **`environment`** reaction kind so companions gently acknowledge when the world
shifts. Emitted when a preset is applied (settings). `react()` gains a chance-gated,
non-distracting curious/"Exploring · <preset>" case that cools down like the others.
No rewrite of the companion system.

## Environment awareness

Companions are already time-of-day aware (morning/night), calendar aware (exam/study
walls), and now environment aware. Future full companions (dialogue, autonomy,
outside-app life) build on this registry + routine engine — out of scope here.
