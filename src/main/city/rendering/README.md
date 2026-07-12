# Noctis rendering

The living civilization window — layered 2D / 2.5D diorama composition.

Rendering is separate from `ui/`. Rendering stages the observational diorama; UI hosts Study OS workspace panels.

Canon: `docs/ART_DIRECTION.md`

## Subfolders

| Folder | Role |
|--------|------|
| `diorama/` | Layer composition and viewport staging |
| `particles/` | Spore, glow, and atmospheric particle systems |
| `lighting/` | Bio-light pools, masks, and illumination staging |

Not a 3D pipeline. Not an open-world camera.

Future production pipeline docs: `docs/VISUAL_PIPELINE.md`, `docs/ASSET_PIPELINE.md`.
