---
doc_id: noctis.visual_pipeline
tier: 8
authority: production_pipeline
role: visual_production_and_compositing_specification
status: approved
depends_on:
  - VISION.md
  - ART_DIRECTION.md
  - GAME_DESIGN.md
  - ARCHITECTURE.md
  - SIMULATION_SYSTEMS.md
  - UI_DESIGN.md
  - ENVIRONMENT_DESIGN.md
  - CHARACTER_DESIGN.md
---

# Noctis Visual Pipeline

## Document Status And Authority

This document binds how approved visual concepts become deterministic runtime presentation. It owns production stages, compositing roles, renderer projections, quality gates, and performance boundaries. It defines no simulation values and permits no visual asset to feed state back into the engine.

## 1. Pipeline Principle

The runtime renders approved assets and code-native effects. It never calls an image model, generates new lore, or infers state from pixels. Generative tools are offline production assistants only.

```text
Tier 1–7 truth
   ↓
Tier 8 visual brief
   ↓
concept exploration
   ↓
approved reference master
   ↓
layered production asset
   ↓
technical normalization
   ↓
manifest registration
   ↓
renderer view-model mapping
   ↓
visual and performance QA
```

No stage may skip directly from an image-model response to a shipped runtime file.

## 2. Renderer Boundary

Rendering consumes a `CityPresentationModel` derived from committed simulation state and transitions. The projection is pure and testable.

```text
CityPresentationModel
  sceneId
  era
  status
  illumination01
  circulation01
  stability01
  activity01
  pathwayBlend { brine01, glucan01, catalyst01 }
  ecology { succession, crystalMaturity01, mycelialMaturity01 }
  civic { density01, institutionalMaturity01 }
  atmosphere { intensity01, eventAccent }
  focusTarget
  recentTransitions[]
  seed
```

This is a presentation projection, not persisted simulation state. It may simplify or combine engine fields but may not add causal facts. The same committed snapshot and view options always produce the same presentation model.

## 3. Visual Roles

Every visible element has exactly one production role:

- **base art:** stable illustrated form;
- **emissive mask:** grayscale local-light influence;
- **tint mask:** pathway or event color translation;
- **occlusion mask:** foreground/character depth relationship;
- **motion source:** sprite frames, displacement texture, vector path, or procedural parameter;
- **atmospheric source:** tileable fog, mote, spore, or weather texture;
- **UI source:** vector icon or code-native interface primitive;
- **fallback source:** code-native gradient, silhouette, or neutral still.

A single raster may not silently combine roles that require independent state control.

## 4. Source Standards

- Color space: sRGB.
- Working depth: 16-bit where painting and grading benefit; export at 8-bit unless a measured gradient defect requires otherwise.
- Transparency: straight alpha with clean RGB under transparent pixels.
- Standard district-region plate: 1920 × 1200. It is never a full-world canvas.
- Every region source includes overlap bleed, world bounds, connection anchors, strata, and declared overview/district/detail LOD eligibility.
- Master character frame: 96 × 128.
- Environment source: layered PSD, Krita, or equivalent editable file plus flattened review PNG.
- Runtime opaque plate: lossless or high-quality WebP after visual comparison.
- Runtime transparency, masks, and sprite frames: PNG or lossless WebP; never lossy alpha edges.
- UI icons: SVG using the project icon system; generated raster UI icons are rejected.
- Filenames: lowercase ASCII snake case; no spaces, model job ids, or version words such as `final2`.

## 5. Composition And Scaling

The renderer owns the semantic camera, scaling, crop, region loading, and LOD selection. Source images are never stretched independently.

- one world camera controls all visible regions; one region transform controls the registered layers within that region;
- world coordinates remain stable as revealed bounds expand; existing regions never shift because a later era appears;
- citizens use world-space region ids plus normalized local ground anchors from the scene manifest;
- emissive and tint masks share exact dimensions and origin with their base art;
- foreground occlusion uses depth bands or explicit masks, never ad hoc z-index guesses;
- adjoining region plates include overlap bleed and matching traversal anchors so manual pan never reveals a seam or empty canvas;
- Whole Civilization View uses overview LODs and fits the revealed-bounds union; only this mode may frame the civilization as one rectangle;
- District and Detail views crop into the world and may lazy-load higher LODs after the camera settles;
- Night Drift consumes declared focus targets and connections; it never invents a location or narrates uncommitted state;
- pixel snapping is used only if the approved sprite treatment requires it;
- device-pixel-ratio changes do not alter simulation or seeded selection;
- a resize may change crop and detail level but not which civilization facts are shown.

## 6. Compositing Order

```text
sky and far field
→ far silhouettes
→ terrain plate
→ ecology plates
→ civic plates
→ props behind citizens
→ citizens and moving civic elements
→ foreground occlusion
→ local emission and reflection
→ atmosphere and particles
→ sensory overlay
→ human UI glass
```

Lighting uses screen/additive techniques sparingly, with opacity clamped by the presentation model. Global bloom is a post-composite accent, not a substitute for painted value structure.

## 7. State-To-Visual Mapping

### Renewable State

- `illumination01` controls local emissive-mask intensity and the visibility of active civic lights.
- `circulation01` controls liquid-flow speed, pulse reach, and reflection activity.
- `activity01` controls visible citizen density and loop frequency, not population truth.
- `stability01` controls calmness of haze and local disturbance, never camera shake during study.

### Secured State

- ecological and civic maturity select approved structural layers and seeded variants;
- era selects a capability envelope and approved material/light families;
- Memory and transitions may add permanent landmarks or archive-visible details only when committed state identifies them;
- ordinary absence never removes secured structural layers.

Era selection never chooses one opaque replacement painting for the complete civilization. Later-era production is an additive region-and-layer package. Connection terrain, routes/circulation, ecology, civic structures, and local light remain independently revealable so the renderer can stage committed growth without changing or hiding older geography.

### Events

The four canonical event flags select restrained presentation sequences. Domain transitions may select additional typed sequences when before/after state proves the change. No visual sequence creates an event.

## 8. AI-Assisted Concept Workflow

Image models may assist with mood, form exploration, texture studies, isolated component concepts, and controlled variations. They are weakest at exact sprite continuity, transparent layer separation, perspective locks, and repeatable frame geometry; those require reference conditioning and human normalization.

Each generation brief must contain:

- authority citations and the intended asset role;
- era, scene, camera, palette, and crop contract;
- positive visual requirements;
- explicit negative constraints;
- whether the result is concept-only or intended for layer extraction;
- required empty areas and separation from text/UI;
- reference images and seed/job metadata where the tool supports them.

The production repository stores prompt text and provenance beside source masters, not inside runtime bundles.

## 9. Review Gates

### Gate A — Canon

Reject ordinary fantasy villages in dark paint, surface-human citizens, combustion imagery, free-floating structures without ecological anchors, generic cyberpunk neon, bright daytime logic, or strategy-game UI.

### Gate B — Composition

Confirm fixed perspective, crop safety, readable central focus, negative space, route anchors, layer separability, and citizen scale.

### Gate C — Technical

Confirm dimensions, color space, alpha, matching mask bounds, edge cleanup, filename, manifest entry, source provenance, and license status.

### Gate D — Runtime

Confirm state mapping, reduced motion, resize behavior, loading fallback, no React animation rerender loop, and performance budget.

### Gate E — Experience

Confirm study remains primary, absence reads as patient, light remains precious, and the scene communicates consequence after study without becoming a reward explosion.

## 10. Performance Budgets

Era I default scene budgets at 1920 × 1200 source quality:

- initial compressed visual payload: target ≤ 12 MB, hard cap 18 MB;
- decoded raster residency for the active scene: target ≤ 64 MB;
- concurrent full-resolution environment plates: maximum 6 before atlasing or downscaling review;
- ambient character count at default window: presentation target 6–18, derived from activity and performance tier;
- particle instances: performance-tier controlled, with a hard upper bound defined in `FIREFLY_SYSTEM.md`;
- steady-state compositor goal: 60 fps on standard tier, 30 fps acceptable on low tier;
- no frame may require synchronous disk access or image decoding during pointer drag.

Assets outside the active scene load lazily. Detail View may request a higher-resolution source only after the camera settles.

Whole Civilization View must remain within the decoded-raster budget by using overview LODs, culling invisible detail roles, and never decoding every structure interior at once. Manual camera input and Night Drift interpolation perform no synchronous disk reads.

## 11. Fallback Hierarchy

1. approved full asset;
2. approved lower-resolution asset;
3. neutral same-role silhouette or mask;
4. code-native gradient/shape fallback;
5. hidden optional detail.

The renderer never substitutes an unrelated scene or invents a different era. Missing art degrades fidelity, not truth.

## 12. Validation Checklist

- [ ] Every asset maps to one declared role and manifest id.
- [ ] Every simulation-driven visual reads only the presentation model.
- [ ] Same snapshot, seed, and viewport options reproduce the same structural composition.
- [ ] Masks align exactly with their bases.
- [ ] All crop targets and density tiers pass.
- [ ] Revealed world bounds expand monotonically and preserve every prior region coordinate.
- [ ] Region seams, traversal anchors, and overview/district/detail LOD transitions pass at all supported window sizes.
- [ ] Whole Civilization alone uses the full rectangular fit; other modes remain navigable crops.
- [ ] Night Drift visits only manifest-declared, currently revealed focus targets and pauses safely.
- [ ] No generated text, UI, citizens, or particles remain baked into the wrong layer.
- [ ] Reduced-motion mode preserves all information.
- [ ] Initial and decoded memory budgets pass.
- [ ] Canon, composition, technical, runtime, and experience gates have named reviewers or recorded approval.

## Closing Validation Statement

The visual pipeline turns a deterministic civilization into an illustrated night without letting the illustration become the civilization’s source of truth.
