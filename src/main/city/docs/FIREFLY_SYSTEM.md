---
doc_id: noctis.firefly_system
tier: 8
authority: production_pipeline
role: atmospheric_particle_specification
status: approved
depends_on:
  - ART_DIRECTION.md
  - GAME_DESIGN.md
  - SIMULATION_SYSTEMS.md
  - ECOLOGY_SYSTEM.md
  - VISUAL_PIPELINE.md
  - ANIMATION_SYSTEM.md
---

# Noctis Atmospheric Particle System

## Document Status And Authority

The historical filename `FIREFLY_SYSTEM.md` is retained for repository compatibility. “Firefly” is production shorthand only; this document does not introduce a canonical species. Canonical fauna remain owned by `ECOLOGY_SYSTEM.md`, including the spore-moth network and its silver pheromone paths.

This document binds atmospheric particles, motes, spore clouds, mineral haze, and event trails. Particles reveal committed state and atmosphere; they create no simulation value.

## 1. Particle Families

| Family | Meaning | Typical source |
|---|---|---|
| ambient mote | depth and local light | spore-hearth, window organ, crystal edge |
| spore drift | ecological activity and language-pathway expression | canopy, mycelial habitat |
| pheromone trace | active spore-moth season | `THE_PHEROMONE_PLUME` and ecology state |
| study-light mote | recent interpreted learning consequence | post-session presentation only |
| mineral haze | depth, ridge atmosphere, disturbance | terrain and stability projection |
| liquid glint | circulation and reflected local light | liquid-light current |
| data glint | later-era network expression | approved era envelope |
| weather particle | district-specific rain mist, snow, or pollen analog | presentation context |

None are currency pickups, collision objects, or interactive rewards.

## 2. Renderer Architecture

One particle scheduler belongs to each visible Noctis viewport. Emitters are data records created from the presentation model and scene manifest.

```text
ParticleEmitter
  id
  family
  assetId
  normalizedBounds
  depthBand
  rate
  lifetimeRange
  velocityRange
  scaleRange
  opacityRange
  tint
  blendMode
  seed
  activeCondition
```

Emitter configuration is presentation state. It is never written into the simulation save.

## 3. Determinism And Variation

Structural particle behavior is reproducible from scene seed, emitter id, committed transition ordinal, and presentation time bucket. Variation may choose trajectory and spawn offset within approved ranges. It may not decide whether a canonical event is active.

Decorative ambience may restart with a visually valid phase after window reopening. Event traces must remain causally tied to the event message or before/after committed state that activated them.

## 4. Density Budgets

At the default 960 × 640 window:

| Performance tier | Ambient cap | Transitional cap | Notes |
|---|---:|---:|---|
| low | 40 | 80 | no refraction, simplified fog |
| standard | 100 | 180 | default target |
| high | 180 | 300 | only while Noctis is focused |

Caps apply across all families. Emitters reduce rate before shortening lifetime so motion remains calm. Hidden, minimized, or occluded viewports stop spawning and retire existing particles without affecting state.

## 5. Motion Rules

- Most particles move horizontally, laterally, or in slow curls shaped by cave air and civic circulation.
- Warm-colored spore-hearth motes must not rise in a convection pattern.
- Ambient lifetimes range from 3–14 s; fog bands use 20–70 s motion owned by environment animation.
- Velocity stays low enough that particles read as atmosphere, not projectiles.
- Depth uses scale, blur, opacity, and parallax; it never requires full 3D physics.
- Turbulence is bounded and deterministic.
- No particle collision, collection, damage, or gameplay hit testing exists.

## 6. Canonical Presentations

### Spore-Hearth Motes

Sparse amber and fungal-gold motes drift laterally around the local cold-light source. Their rate follows active illumination and becomes zero in hibernation.

### Spore Drift

Soft, low-contrast particles move between canopy groups. Glucan emphasis may increase route length and violet/amber tint variation, within the global density cap.

### Pheromone Plume

Heavy silver dust forms one or more horizontal, undulating paths across the diorama when the canonical event or active moth-season state is present. Paths remain translucent enough to preserve the scene and persist as a season, not a full-screen burst.

### Benthic Bloom

Teal motes travel outward along existing civic and liquid routes, then settle. No radial confetti, screen-edge burst, or shower over UI controls.

### Hibernation

Metabolic motes and active currents stop. Optional non-metabolic mineral haze may remain at minimal density for spatial depth. It cannot imply hidden local activity.

## 7. Assets

The Era I particle pack requires:

- 3 soft round/irregular mote textures;
- 3 spore silhouettes;
- 2 silver dust textures;
- 2 liquid glints;
- 2 mineral haze tiles;
- 1 soft pheromone ribbon mask;
- 1 teal route-mote texture.

Textures are 32–128 px, transparent, neutral where runtime tinting is required, and free of baked trails unless the manifest declares a trail role.

## 8. Accessibility And Study Safety

- reduced motion disables trajectories and substitutes static sparse atmosphere or a single soft route highlight;
- no rapid flashing or high-contrast strobing;
- particles never cross essential text at an opacity that harms readability;
- focus sessions reduce particle density to low tier regardless of hardware tier;
- UI glass may clip or soften particles behind text;
- event meaning remains available through non-motion state and concise readable context.

## 9. Validation Checklist

- [ ] Particle families map to presentation state or approved ambience.
- [ ] No family creates or mutates simulation state.
- [ ] Warm-colored motes avoid convection imagery.
- [ ] Global caps hold under overlapping events.
- [ ] Hidden/minimized viewports stop spawning.
- [ ] Reduced motion preserves event meaning.
- [ ] No particles behave as rewards, projectiles, or collectibles.
- [ ] Pheromone paths remain horizontal, silver, sparse, and ecologically grounded.
- [ ] Hibernation has zero metabolic particle emission.
- [ ] Text and controls retain required contrast.

## Closing Validation Statement

Noctis particles are traces in the air: pollen, memory, pressure, and routed light. They give the night depth without filling the mystery that makes every small signal matter.
