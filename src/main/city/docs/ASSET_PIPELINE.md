---
doc_id: noctis.asset_pipeline
tier: 8
authority: production_pipeline
role: asset_ingestion_provenance_and_delivery_specification
status: approved
depends_on:
  - VISION.md
  - ART_DIRECTION.md
  - VISUAL_PIPELINE.md
  - ENVIRONMENT_DESIGN.md
  - CHARACTER_DESIGN.md
---

# Noctis Asset Pipeline

## Document Status And Authority

This document binds how Noctis art is named, sourced, reviewed, normalized, registered, and delivered. It is the final authority before asset generation begins. It does not choose simulation outcomes and does not permit runtime generation.

## 1. Asset Classes

| Class | Examples | Runtime format |
|---|---|---|
| Environment base | sky, ridge, terrain, canopy, civic plate | WebP or PNG |
| Environment control | emissive, tint, occlusion, reflection masks | grayscale PNG or lossless WebP |
| Character | body frames, props, shadows, sensory masks | PNG or lossless WebP |
| Motion support | displacement maps, fog tiles, flow strips | PNG/WebP |
| Particle | mote, spore, glint, soft disc textures | small PNG/WebP |
| UI | icons and glass decoration | existing SVG/code-native system |
| Reference only | moodboards, model sheets, contact sheets | PNG/JPEG, excluded from runtime |

Audio is outside this asset contract.

## 2. Repository Layout

```text
src/main/city/assets/
  README.md
  manifests/
    asset-manifest.json
    scene-manifest.json
    provenance.json
  runtime/
    environments/era1/ancestral_basin/
    characters/era1/noctae/
    particles/common/
    masks/
  source/
    briefs/
    prompts/
    references/
    environment/
    character/
    cleanup/
  review/
    contact-sheets/
    approvals/
```

Runtime code imports only `runtime/` and `manifests/`. Large editable masters may move to external artifact storage later, but their provenance record and review flatten remain in `source/` or `review/`.

## 3. Asset Identity

Canonical id format:

```text
noctis.<class>.<era>.<scene_or_family>.<element>.<variant>.<role>
```

Example:

```text
noctis.environment.era1.ancestral_basin.ridge.v02.base
noctis.environment.era1.ancestral_basin.ridge.v02.emissive
noctis.character.era1.noctae.body_a.southwest.base
```

Filenames mirror the final id segments with lowercase snake case. Version history belongs to source control and provenance metadata, not filenames such as `latest`, `new`, or `final3`.

## 4. Manifest Contract

Every runtime asset has a manifest record:

```text
id
path
class
era
sceneOrFamily
role
width
height
format
alpha
anchor? { x, y }
cropSafe? { left, top, right, bottom }
pairedAssetIds[]
fallbackAssetId?
licenseRecordId
provenanceRecordId
contentHash
```

Scene manifests additionally declare layer order, local normalized transforms, world-space region bounds, parent/connection topology, strata, route anchors, semantic focus targets, overview/district/detail LODs, depth bands, crop-safe bounds, era reveal conditions, and permitted seeded variants. The renderer never discovers assets by directory scanning.

## 5. Provenance Contract

Every source, including AI-assisted work, records:

- creator or tool;
- tool/model and version when available;
- date;
- full prompt and negative prompt;
- source references and rights status;
- seed, job id, or generation parameters when available;
- edits performed after generation;
- reviewer and approval result;
- license or terms snapshot reference;
- relationship to derived runtime assets.

No asset with unknown provenance enters `runtime/`. A model output is not assumed commercially safe merely because it is downloadable.

## 6. Generation Brief Package

Before requesting any image, create one brief file under `source/briefs/` containing:

1. asset id family;
2. authority citations;
3. visual purpose and runtime role;
4. canvas, perspective, crop, and layer contract;
5. palette and light-source contract;
6. required negative space;
7. positive prompt block;
8. negative prompt block;
9. reference-image list;
10. expected variants and selection criteria;
11. expected cleanup work;
12. acceptance checklist.

Environment briefs also declare the target region id, world bounds, neighbor seams, overlap bleed, traversal anchors, strata, supported semantic LODs, and whether the image is overview-only or safe for close inspection. A fixed rectangular full-world background is rejected.

One broad prompt may explore composition, but production extraction uses one role at a time. Do not ask a model for a finished scene, UI, sprite sheet, masks, transparency, and particles in one response.

## 7. Tool Roles

The pipeline chooses tools by production role rather than brand loyalty.

- **Concept model:** strong composition, atmosphere, and style exploration.
- **Controlled image model:** reference conditioning, repeatable perspective, inpainting, and isolated variants.
- **Raster editor:** layer separation, paint-over, edge cleanup, alpha repair, grading, and mask authoring.
- **Sprite editor:** frame alignment, palette control, anchors, onion-skin cleanup, and sheet export.
- **Validation scripts:** dimensions, hashes, alpha, manifest completeness, and budget checks.

A single tool may cover several roles, but no model is trusted with every role automatically. Current vendor selection is made at generation time because model capabilities and license terms change.

## 8. Ingestion Stages

### Stage 1 — Brief Approval

Confirm canon, role, dimensions, and intended use before generation.

### Stage 2 — Exploration

Generate low-cost contact sheets. Reject off-canon direction early. Exploration files remain reference-only.

### Stage 3 — Reference Lock

Select one composition/style master and record it as the visual reference. Character work requires an approved model sheet before action frames.

### Stage 4 — Controlled Production

Create isolated components and variants against the locked reference. Preserve generation metadata.

### Stage 5 — Human Normalization

Correct perspective, anatomy, continuity, edges, palette, alpha, repeating texture defects, and unintended symbols. Remove all generated text and UI-like marks.

### Stage 6 — Technical Export

Export dimensions, masks, anchors, and formats exactly. Generate hashes and manifest entries.

### Stage 7 — Runtime Review

Review at real application size in newborn, active, dimmed, hibernating, and returning composites. Approve only after performance and accessibility checks.

## 9. AI-Specific Rejection Rules

Reject output with:

- pseudo-text, signatures, watermarks, logos, or UI glyphs;
- inconsistent architecture or perspective between variants;
- generic fantasy, steampunk, cyberpunk, or surface-human visual language;
- unrequested citizens baked into environments;
- uncontrolled bright emission or daylight-like global lighting;
- smoke-like atmospheric forms suggesting combustion;
- anatomy drift between character frames;
- halos or dirty RGB values around transparency;
- copied reference composition or identifiable protected character design;
- uncertain commercial rights or missing provenance.

## 10. Runtime Packaging

- Hash-address or version manifest records so cache invalidation is explicit.
- Keep reference, prompt, and editable-master files out of production bundles.
- Load the default Era I scene eagerly only when Noctis opens; preload a small neutral fallback with the application.
- Eagerly load only the Era I origin overview/district fallback; lazy-load neighboring regions, detail LODs, interiors, strata, and later-era assets.
- Do not embed large assets as source-code data URLs.
- Avoid a single atlas so large that one changed sprite invalidates the entire scene cache.
- Package masks with their paired bases and fail validation if dimensions differ.

## 11. Validation Automation

The asset validator must fail on:

- missing manifest or provenance fields;
- duplicate ids or paths;
- missing files or hash mismatch;
- incorrect dimensions or formats;
- paired masks with different bounds;
- character frames with inconsistent anchors;
- transparent images with non-clean edges beyond tolerance;
- initial payload above the hard budget;
- runtime assets referenced from `source/` or `review/`;
- missing fallback for a required scene role.
- region bounds that move an existing region between eras;
- missing or mismatched connection anchors and overlap bleed;
- a detail focus target without an approved detail LOD or code-native fallback;
- a whole-world opaque plate that prevents horizontal or vertical expansion.

Visual canon approval remains human; mechanical validity is automated.

## 12. Asset-Generation Entry Gate

Asset generation may begin only when all are true:

- [ ] Tier 6/7 reconciliation is closed.
- [ ] UI, environment, character, visual, sprite, animation, and particle specifications are approved.
- [ ] The implementation roadmap identifies the exact Era I vertical slice.
- [ ] The new engine exposes a stable, tested presentation projection.
- [ ] Renderer scaffolding can display code-native fallbacks for every required role.
- [ ] Era I asset ids, scene anchors, dimensions, prompts, and negative prompts are prepared.
- [ ] Stable world coordinates, region bounds, connection anchors, semantic LODs, and the Whole Civilization fit contract pass in code-native form.
- [ ] Manual pan/zoom, Detail focus, strata selection, and Night Drift work without production raster art.
- [ ] The selected generation tool’s current license and privacy terms are reviewed.
- [ ] A human cleanup tool and review process are available.

This checklist is the stopping point before external image generation.

## Closing Validation Statement

An asset is not ready because an image model produced something beautiful. It is ready when its origin is known, its role is exact, its layers are controllable, its canon is intact, and the application can use it without surrendering truth to pixels.
