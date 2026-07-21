---
doc_id: noctis.sprite_pipeline
tier: 8
authority: production_pipeline
role: sprite_authoring_and_export_specification
status: approved
depends_on:
  - ART_DIRECTION.md
  - CHARACTER_DESIGN.md
  - ENVIRONMENT_DESIGN.md
  - VISUAL_PIPELINE.md
  - ASSET_PIPELINE.md
---

# Noctis Sprite Pipeline

## Document Status And Authority

This document binds frame geometry, sprite-layer separation, naming, sheet export, and runtime sampling for Noctae and small animated civic elements. Animation timing belongs to `ANIMATION_SYSTEM.md`; identity and anatomy belong to `CHARACTER_DESIGN.md`.

## 1. Sprite Families

- Noctae bodies and garments;
- carried props and tools;
- sensory-line emissive masks;
- grounded shadows;
- small civic elements such as vessels, shutters, signs, and portable instruments;
- environment animation strips such as hearth pulse, canopy pulse, current highlights, and crystal refraction.

Particles are excluded and follow `FIREFLY_SYSTEM.md`.

## 2. Character Frame Grid

Character masters use 96 × 128 px frames and the ground anchor `(48,112)`.

Direction ids:

```text
ne  nw  se  sw
```

Action ids for the Era I set:

```text
idle_sense
walk
pause_light
tend
read_tactile
semaphore_pair
carry
```

Recommended frame counts:

| Action | Frames | Loop |
|---|---:|---|
| `idle_sense` | 6 | yes, with runtime hold variance |
| `walk` | 8 | yes |
| `pause_light` | 6 | no; returns to idle |
| `tend` | 8 | yes while action is active |
| `read_tactile` | 8 | yes while action is active |
| `semaphore_pair` | 12 | coordinated sequence |
| `carry` | 8 | walk-compatible loop |

Frame count is a production target, not simulation state. Fewer frames are acceptable only when motion remains calm and readable.

## 3. Layer Separation

Every character frame can be reconstructed from aligned layers:

```text
shadow
body_and_garment
prop_back
prop_front
sensory_mask
optional_local_light_mask
```

Sheets for every layer share identical frame cells and ordering. If a prop crosses the body, it is split into back/front layers. Color tint is applied only through approved masks.

## 4. Sheet Layout

One sheet contains one family, one action, and all four directions. Rows are directions in `ne,nw,se,sw` order; columns are frames in playback order.

Example filename:

```text
noctae_body_a_walk_base.png
noctae_body_a_walk_sensory_mask.png
noctae_body_a_walk_shadow.png
```

Sheet metadata declares frame width, frame height, rows, columns, direction order, anchor, frame count, and paired sheets. Runtime code never guesses a grid from image dimensions alone.

## 5. Environment Animation Sprites

Environment strips use exact pixel alignment with their owning base asset or an explicit normalized anchor.

- Spore-hearth: body remains in environment art; animation supplies emissive and subtle surface-change frames.
- Liquid current: tileable highlight strips and flow masks, never a replacement river painting.
- Canopy: localized pulse overlays or small deformation loops; the whole background is not re-rendered per frame.
- Crystal: refraction and internal-coupling masks with no geometry drift.
- Civic shutters/signals: small isolated sprite sequences with consistent perspective.

## 6. Edge And Palette Rules

- no matte fringe on alpha edges;
- no semi-transparent noise outside the intended silhouette;
- no frame-to-frame palette crawl in static regions;
- emissive masks are neutral grayscale;
- shadows use neutral alpha and are tinted by runtime scene grade;
- mirrored directions require review for asymmetric props, garments, and signal sequences;
- downscaled review at 24, 32, and 40 CSS px is mandatory.

## 7. AI-Assisted Sprite Procedure

An image model may generate model-sheet concepts, isolated poses, prop variations, or motion reference. It is not trusted to output final aligned sheets.

Production sequence:

1. lock the approved character model sheet;
2. generate or draw key poses against the same reference;
3. choose one clean key pose per direction;
4. normalize silhouette, perspective, and scale in a sprite editor;
5. author in-betweens with onion-skin review;
6. separate masks, props, and shadows;
7. validate anchors and frame bounds automatically;
8. approve the loop at real application size.

Reference-conditioned generation is preferred over unconditioned prompts. A change of model or settings mid-sheet requires a new consistency review.

## 8. Atlasing

Small sheets may be packed into runtime atlases by era and asset class after validation. Source sheets remain independent.

- maximum atlas dimension: 2048 × 2048 unless measured hardware support justifies more;
- 2 px transparent padding around each packed region;
- duplicate edge pixels only where the chosen sampler requires it;
- manifest retains original asset ids and atlas coordinates;
- emissive masks may use a separate grayscale atlas;
- one changed family should not invalidate unrelated environment assets.

## 9. Runtime Sampling

- choose nearest-neighbor only if the approved art uses intentional pixel clusters;
- otherwise use smooth sampling with pixel-aligned anchors;
- never mix sampling modes within one character family;
- animation advances from renderer time and presentation settings, never engine ticks;
- visibility culling stops off-screen sprite work without changing state;
- reduced-motion uses the designated still frame for each action.

## 10. Validation Checklist

- [ ] Every frame cell is 96 × 128 for character families.
- [ ] All paired layers share dimensions, ordering, and anchors.
- [ ] Four directions preserve anatomy and perspective.
- [ ] Static regions do not crawl between frames.
- [ ] Alpha edges are clean against light and dark test backgrounds.
- [ ] Mirrored frames remain physically valid.
- [ ] Real-size previews remain readable.
- [ ] Sheet metadata and manifest records agree.
- [ ] Reduced-motion stills are declared.
- [ ] No generated sheet enters runtime before manual normalization.

## Closing Validation Statement

The sprite pipeline makes small lives consistent enough to be believed. Variation gives them character; alignment, anchors, and restraint let them inhabit one continuous world.
