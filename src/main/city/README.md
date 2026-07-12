# Noctis Civilization Module

All Noctis application code belongs in this folder. The Study OS shell exposes a desktop icon and window slot for Noctis on Desktop 1.

Read the canon docs in `docs/` before writing code:

1. `docs/VISION.md`
2. `docs/ART_DIRECTION.md`
3. `docs/NOCTIS_ECOLOGICAL_ENGINE.md`
4. `docs/DOCUMENT_ARCHITECTURE.md`
5. `docs/GAME_DESIGN.md`
6. `docs/ARCHITECTURE.md`

---

## Folder structure

```
src/main/city/
  index.ts              Main-process entry (IPC registration)
  README.md
  docs/                 Canon, simulation placeholders, production pipeline placeholders
  engine/               Pure deterministic simulation boundary
  service/              CityService, persistence, lifecycle
  ipc/                  Channel registry, handlers, push events
  rendering/            Living civilization diorama (diorama/, particles/, lighting/)
  ui/                   Study OS workspace panels (panels/, dashboard/, widgets/)
```

---

## Documentation hierarchy

```
VISION → ART_DIRECTION → ECOLOGICAL_ENGINE → DOCUMENT_ARCHITECTURE
  → GAME_DESIGN → ARCHITECTURE → SIMULATION_SYSTEMS → DOMAIN SYSTEMS
  → ENGINE CODE → UI → VISUAL ASSETS
```

| Layer | Location | Notes |
|-------|----------|-------|
| IPC registration | `index.ts` → `ipc/` | `registerCityIpc()` from `src/main.ts` |
| Main simulation owner | `service/CityService.ts` | Single writer; wall clock and disk |
| Pure simulation | `engine/` | No Electron, React, or I/O |
| Diorama rendering | `rendering/` | The living civilization window |
| Study OS UI | `ui/` | Human-facing Fluent workspace panels |

---

## Integration stack

```
Electron main process
        |
        v
CityService (service/)
        |
        v
Pure Engine (engine/)
        |
        v
Renderer Mirror (future cityState.ts)
        |
        +---> Rendering (rendering/) — diorama
        |
        +---> UI (ui/) — workspace panels
```

---

## Current phase

Documentation alignment complete. No simulation logic or UI implementation.

Obsolete Virtual City / City Points design is archived at `docs/archive/CITY_ENGINE.md`.

---

## Desktop integration (Study OS shell)

- **Desktop 1:** Noctis icon in the app grid; placeholder window until rendering and ui are wired.
- Shell hooks (outside this folder): `DesktopShell` `city` section, `shared/desktop` icon seed, `stats.ts` reading hook.

Do **not** use: City Points, coin economies, grid placement, forge/industrial progression, or traditional strategy-game loops.
