---
doc_id: noctis.environment_design
tier: 8
authority: production_pipeline
role: environment_art_specification
status: approved
depends_on:
  - VISION.md
  - ART_DIRECTION.md
  - NOCTIS_ECOLOGICAL_ENGINE.md
  - GAME_DESIGN.md
  - SIMULATION_SYSTEMS.md
  - ECOLOGY_SYSTEM.md
  - ERA_PROGRESSION.md
---

# Noctis Environment Design

## Document Status And Authority

This document binds the visual composition of the eternal-night diorama. It translates committed ecology, era, and civilization state into environment art without defining simulation rules. Every scene is an illustrated 2D/2.5D observation plate; no scene implies first-person traversal, free camera orbit, or a realistic 3D world.

## 1. Environmental Thesis

The terrain is the civilization’s body, infrastructure, memory, and mood. It must remain readable at three distances:

- at a glance, one calm luminous world;
- at rest, distinct ecological and civic systems;
- over time, a personal historical record.

The image is composed, not generated afresh at runtime. Simulation variation selects and modulates approved layers; it does not ask an image model to improvise new canon inside the application.

## 2. World And Region Geometry

No single raster canvas defines the world. Noctis uses a stable authored world-coordinate space containing connected regions. Each environment region may use a 1920 × 1200 working plate at its standard district LOD, but that plate is a compositing unit rather than the civilization boundary. Whole Civilization View computes a rectangular camera fit around the union of revealed region bounds; other modes crop into that union and must not advertise the rectangle as geography.

Coordinate rules:

- world coordinates are stable across eras and never renormalized when the world expands;
- each region owns a world-space bounds rectangle, a local normalized `[0,1]` plate space, connection anchors, strata, focus targets, and semantic LODs;
- revealed world bounds grow monotonically from secured era and historical facts, horizontally into adjacent chambers, downward into deep infrastructure, and upward into the stellar chasm;
- the origin basin remains at the same world coordinates forever and is never scaled up to impersonate expansion;
- the fixed elevated three-quarter ground-plane axis is shared by connected surface regions; cross-section and stellar regions declare explicit compatible camera axes;
- stylized perspective is permitted, but adjoining plates must share horizon, ground-plane angle, scale reference, and an overlap bleed sufficient for seamless traversal;
- essential civic targets declare focus bounds for District and Detail cameras rather than relying on one centered crop;
- foreground occlusion belongs to a region and LOD; it may not block traversal exits or selected focus targets;
- unrevealed regions remain dark and non-interactive, not empty checkerboard space.

The semantic scale ladder is `whole → district → structure → interior/strata`. Overview art may simplify distant detail; close LODs may add approved structure and interior layers without changing the committed world fact they depict.

## 3. Canonical Layer Stack

Every environment is delivered in independently compositable groups:

1. `sky`: night gradient, stars, distant atmospheric field;
2. `far`: crystalline ridges, canopy horizon, distant civic traces;
3. `terrain`: ground plate, root paths, river bed, terraces;
4. `ecology`: fungal canopies, crystal clusters, mycelial veins, habitat forms;
5. `civic`: shelters, archives, bridges, instruments, plazas, spore-hearth bodies;
6. `props`: vessels, tactile markers, portable instruments, route details;
7. `foreground`: near silhouettes and framing forms;
8. `light`: masks, emissive pools, reflections, refraction accents, local shadow;
9. `atmosphere`: fog bands, sparse spores, mineral haze, weather masks.

Citizens and UI are not baked into environment plates. Particles are not baked into base backgrounds. Text, labels, selection rings, and interface icons never appear in generated environment art.

## 4. Era I: First Light Environment Set

The first production set is deliberately small and complete.

### Required Scene

`era1_ancestral_basin` contains:

- deep violet crystalline ridges against a star-scattered permanent night;
- layered near-black blue and wine-shadow terrain;
- one central ancestral spore-hearth with a cold amber decay-glow;
- a dark liquid channel or pool capable of receiving a teal focus pulse;
- sparse root paths leading beyond the frame;
- two to four grown shelters or civic forms, subordinate to the hearth;
- one distant canopy group and one foreground silhouette group;
- enough negative space that light remains precious.

The origin basin is intentionally cramped. Near walls, canopy, and foreground forms keep routes short and the first settlement close around the hearth. One or two dark connection mouths lead beyond the known clearing so future horizontal and vertical expansion is promised without making Era I feel spacious. The approved exploration sheet locks mood, camera, palette, and origin layout only; it is not a full-world background.

The scene must read before citizens are added. Nothing burns, emits smoke, implies daylight, or uses surface-industrial material language.

### Required Modular Elements

- 3 far-ridge variants;
- 3 fungal canopy clusters;
- 2 foreground framing silhouettes;
- 4 root-path segments with shared perspective;
- 2 liquid-channel segments plus one pool;
- 3 shelter silhouettes;
- 1 spore-hearth body with separate emissive mask;
- 3 crystal cluster sizes with separate refraction masks;
- 2 bridge or crossing forms;
- 4 terrain decals for growth history;
- 3 atmospheric fog bands.
- 2 region-edge transition sets with overlap bleed and matching connection anchors;
- overview, district, and detail LOD declarations for the origin hearth and shelters;
- one authored root-strata cross-section fallback, initially quiet until its observation capability is revealed.

Variants create seeded composition without changing simulation truth.

## 5. State Variants

Base geometry remains stable across renewable conditions. State changes are expressed by masks, color grading, animation parameters, visibility, and sparse additive details.

Era evolution is cumulative. A later envelope may reveal a connected region and authorize new materials, structures, or LODs, but it never replaces the origin basin or repaints all terrain at once. Production assets must support a staged sequence of terrain connection, routes, ecology, civic accumulation, and local light. Secured older forms and their historical traces remain visible at their established coordinates while continuous maturity readings modulate growth within each envelope.

### Newborn

Very low local illumination, still current, sparse civic traces, no false sense of damage. The world is latent rather than empty.

### Active

Localized spore-hearth glow, readable current flow, modest window organs, citizen routes visible, and ecology breathing. Darkness still dominates the frame.

### Dimmed

Lower emissive intensity, slower current, longer quiet intervals, and reduced citizen visibility. Permanent structures remain clear enough to communicate continuity.

### Hibernating

Zero active illumination as required by simulation state. Residual non-metabolic starlight and reflective silhouette separation may preserve legibility, but no local organ reads as active. Current is still, citizens are sparse, and the composition remains patient rather than ruined.

### Returning

The first qualifying reawakening uses a restrained teal arrival through the liquid system, followed by local amber recovery. It is a causal relighting, not a full-screen celebration.

## 6. Ecological Visual Grammar

### Mycelial Network

Root depth and secured network maturity appear as route density, anchored civic reach, older visible layers, and connections continuing beyond the frame. Active routing light may dim; cumulative structural history remains.

### Crystal Ecology

Secured lattice maturity appears as sharper internal organization, coupled clusters, and more legible refraction planes. Crystals are grown and resonant, never presented as extracted treasure.

### Liquid-Light Circulation

Circulation appears through internal flow speed, pulse reach, branch activation, and reflected local light. Dark fluid boundaries remain visible even at low activity.

### Succession

Succession changes interdependence and density rather than simply adding more objects. Later stages show ecological systems visibly supporting one another: canopy over route, route feeding pool, lattice stabilizing civic form.

### Pathway Emphasis

- Brine tendency: cleaner lattice geometry and pale cyan structural highlights.
- Glucan tendency: deeper root reach, layered amber, and denser archival ecology.
- Catalyst tendency: broader photophore variety, teal circulation, and restrained magenta expression.

These are blended tendencies. No single study category guarantees a fixed object.

## 7. The Five Era Envelopes

Environment production may eventually cover all five eras, but Tier 8 defines their visual direction without requiring immediate asset volume.

| Era | Environmental change | Light language |
|---|---|---|
| `SPORE_HEARTH` | intimate basin, sparse paths, wild cultivation, close communal forms | isolated amber and low teal response |
| `CRYSTAL_INSCRIPTION` | ordered terraces, illuminated aqueducts, archives, ridge instruments | focused cyan, amber inscription, restrained magenta refraction |
| `PHONONIC_SUBTERRANEAN` | deep civic scale, fluidic works, vibration infrastructure, dense routes | heavy rhythmic pulses and cold industrial mains |
| `OPTOGENETIC_CIRCUIT` | living networks, organic glass, diagnostic districts, mycelial boards | precise teal/cyan data-light with dark negative space |
| `COSMIC_STELLAR` | vertical rifts, observatory basins, anchored orbital plates, vast continuity | aurora calibration and pale star reflection; never independent illumination |

An era opens a visual capability envelope. It never forces every representative structure into every scene.

Spatially, the envelopes expand in different directions: Era I is one close origin pocket; Era II reveals horizontal terraces and adjacent chambers; Era III adds deep stacked canyon and fluid strata; Era IV links broad lateral districts; Era V opens the upper rift, observatory crowns, and anchored orbital plates. Older regions persist and remain navigable after every expansion.

## 8. Palette Contract

Base night families:

- near-black blue `#080C18`;
- charcoal violet `#151426`;
- deep wine shadow `#2A1321`;
- muted indigo `#252A48`;
- dark teal `#102C32`;
- cold slate `#536071`.

Emissive reference families:

- spore amber `#E7A95B`;
- fungal gold `#F2CC72`;
- scholarly teal `#53D5C8`;
- liquid cyan `#66CFE3`;
- crystal magenta `#C17AB7`;
- pale star white `#DCE8F1`;
- restrained aurora green `#79C99E`.

These values are compositing targets, not a demand that source art use flat fills. Final grading must preserve value separation under dim display conditions and common color-vision deficiencies.

## 9. Lighting Rules

- Darkness occupies most of every frame.
- Emission is localized and has an identifiable source.
- Bloom never erases form or floods the full viewport.
- Every emissive asset supplies a grayscale mask separate from color art.
- Reflections and refractions are separate layers so renewable state can modulate them.
- Ambient starlight may reveal silhouette edges during hibernation but may not read as metabolic power.
- No generated asset may contain baked lens flares, UI glows, or irreversible global grading.

## 10. Production Validation

An environment set is accepted only when:

- the scene reads at 960 × 640 and at a 320 px-wide preview;
- active and hibernating composites remain clearly different without changing geometry;
- all crop-safe regions pass;
- independent light masks can be disabled without exposing painted halos;
- citizens can cross the designated routes without visual collision;
- no text, citizen, particle field, or UI is baked into the environment;
- a color-blind and grayscale review preserves structural hierarchy;
- the result remains an illustrated diorama rather than a realistic 3D render;
- every asset can name the committed state or presentation role it serves.
- region seams remain coherent while panning at overview and district LODs;
- every selectable target has stable bounds, an accessible name, and a truthful fallback;
- the Era I origin feels enclosed at District scale but never clips its two future connection anchors;
- Whole Civilization View fits all revealed regions using overview LODs without treating the rectangular fit as a world border;
- horizontal, downward, and upward expansion can occur without stretching or repainting the origin plate.

## Closing Validation Statement

Noctis environment art is a patient night ecology shaped by accumulated learning. The first basin begins with one cold light and enough darkness for a civilization’s entire future to remain imaginable.
