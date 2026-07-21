# Era I Root-Path Runtime Pack — Production Record

- Record id: `noctis.generation.era1.root_path_runtime_pack.v01`
- Date: 2026-07-20
- Tool: Codex built-in image generation plus deterministic local normalization
- Model/version: specific model label not exposed by the built-in tool
- Reference: `review/contact-sheets/era1_phase6_batch05_root_path_family_v01.png`, center candidate visual language only
- Runtime targets: straight, bend, fork, and terminal/connection isolated overlays

Production uses one generation call per segment role on flat `#00ff00` chroma key. Every accepted source is alpha-cleaned, normalized to 512 × 512 without stretching, registered with explicit connection anchors, and continuity-tested before promotion.

## Production Status

- Straight: generated successfully, chroma key removed with soft matte, despill, and one-pixel edge contraction.
- Bend: an initial request and one combined-sheet retry stalled without artifacts; the isolated retry completed successfully.
- Fork: generated successfully as a style-locked sibling of the straight and bend.
- Terminal/connection: generated successfully as a modest low endpoint rather than a landmark.
- Normalization: each complete source canvas was resized to 512 × 512 without trimming or padding so its declared edge contacts remain fixed.
- Runtime promotion: all four roles passed visual continuity and alpha review and were promoted together.

## Production Prompts

### Straight

Create one isolated Era I organic root path with a dark charcoal walkable soil center bounded by woven brown living roots. Keep the path narrow, traversable, vertically continuous, and free of curbs, terrain slabs, rocks, buildings, characters, glow, text, and UI. Render on flat `#00ff00` chroma key with both ends touching the canvas edges.

### Bend

Create one broad clockwise 90-degree root-path bend matching the straight master. Entry is centered on the bottom edge and exit is centered on the right edge. Preserve a consistent walkable width, dark soil center, woven root edges, restrained Era I palette, and flat `#00ff00` isolation. Exclude all scene dressing and architecture.

### Fork

Create one broad Y-shaped root-path fork matching the straight and bend masters. Entry is centered on the bottom edge and equal traversable branches exit at the upper-left and upper-right edges. Keep a smooth readable junction, consistent width, dark soil center, woven roots, and flat `#00ff00` isolation. Exclude all scene dressing and architecture.

### Terminal

Create one quiet root-path terminal matching the other roles. Entry is centered on the bottom edge; the dark walkable center stops near the upper-center in a modest low asymmetrical fan of resting roots with negative space around it. It must not resemble a tree, shrine, building, cave, or landmark. Use flat `#00ff00` isolation.

## Runtime Mapping

| Role | Runtime id | Entry | Exit(s) |
| --- | --- | --- | --- |
| Straight | `noctis.environment.era1.ancestral_basin.root_path.v01.base` | `(0.50, 1.00)` | `(0.50, 0.00)` |
| Bend | `noctis.environment.era1.ancestral_basin.root_path.v02.base` | `(0.50, 1.00)` | `(1.00, 0.44)` |
| Fork | `noctis.environment.era1.ancestral_basin.root_path.v03.base` | `(0.50, 1.00)` | `(0.04, 0.00)`, `(0.96, 0.00)` |
| Terminal | `noctis.environment.era1.ancestral_basin.root_path.v04.base` | `(0.50, 1.00)` | terminates near `(0.50, 0.18)` |
