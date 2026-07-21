# Noctis Civilization Module

All Noctis application code belongs in this folder. The Study OS shell exposes a desktop icon and window slot for Noctis on Desktop 1.

The implementation follows the complete Tier 1–8 authority chain in `docs/`:

1. `docs/VISION.md`
2. `docs/ART_DIRECTION.md`
3. `docs/NOCTIS_ECOLOGICAL_ENGINE.md`
4. `docs/DOCUMENT_ARCHITECTURE.md`
5. `docs/GAME_DESIGN.md`
6. `docs/ARCHITECTURE.md` and `docs/SIMULATION_SYSTEMS.md`
7. the reconciled domain system documents
8. the approved production pipeline documents and `docs/DEVELOPMENT_ROADMAP.md`

---

## Folder structure

```
src/main/city/
  index.ts              Main-process entry (IPC registration)
  README.md
  docs/                 Tier 1–8 canon and implementation roadmap
  assets/               Pre-generation briefs, manifests, provenance, validation
  engine/               Pure deterministic simulation boundary
  service/              CityService, persistence, lifecycle
  ipc/                  Channel registry, handlers, push events
  rendering/            Living civilization diorama (world/, diorama/, particles/)
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
Renderer Mirror (src/renderer/cityState.ts)
        |
        +---> Rendering (rendering/) — diorama
        |
        +---> UI (ui/) — workspace panels
```

---

## Current phase

Pre-asset implementation is complete through the Phase 5.5 navigable-world correction: deterministic engine, reliable state owner, durable learning membrane, connected world coordinates, semantic cameras, manual exploration, Night Drift, Whole Civilization overview, a code-native Era I region, observational UI, manifests, validator, briefs, prompts, and provenance package. The Phase 6 contact sheet is approved only as a mood and origin-layout reference; production component generation has not begun.

Obsolete Virtual City / City Points design is archived at `docs/archive/CITY_ENGINE.md`.

---

## Desktop integration (Study OS shell)

- **Desktop 1:** Noctis opens the live read-only Observatory Workspace.
- Shell hooks (outside this folder): `DesktopShell` `city` section, `shared/desktop`, `cityState.ts`, and `citySession.ts`.

Do **not** use: City Points, coin economies, grid placement, forge/industrial progression, or traditional strategy-game loops.
