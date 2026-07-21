---
doc_id: noctis.animation_system
tier: 8
authority: production_pipeline
role: presentation_motion_specification
status: approved
depends_on:
  - ART_DIRECTION.md
  - GAME_DESIGN.md
  - ARCHITECTURE.md
  - SIMULATION_SYSTEMS.md
  - VISUAL_PIPELINE.md
  - SPRITE_PIPELINE.md
---

# Noctis Animation System

## Document Status And Authority

This document binds presentation motion. Animation reveals committed state; it never advances the simulation, reads the wall clock as simulation input, or decides that a transition occurred.

## 1. Motion Thesis

Noctis is awake, not restless. Motion is slow to medium, eased, layered, small in amplitude, and rich in staggered detail. During active study it recedes toward ambient minimum. Consequence becomes more visible after a session ends or when the user deliberately returns to the city.

## 2. Time Domains

Three clocks remain separate:

- **simulation time:** owned by engine evaluation and elapsed-time inputs;
- **presentation time:** local monotonic renderer time used for loops and easing;
- **interaction time:** short UI transitions controlled by the application motion system.

Pausing, throttling, or dropping presentation frames cannot alter simulation state. Reopening a window begins loops from a deterministic phase derived from seed, asset id, and stable scene context when continuity matters; incidental fog may start from any visually valid phase.

## 3. Motion Tiers

| Tier | Purpose | Typical behavior |
|---|---|---|
| Still | reduced motion or static preview | state shown through value, color, and composition only |
| Ambient | study and Glance View | long holds, slow currents, sparse citizens, minimal particles |
| Observational | District and Detail View | full calm loops and readable civic routines |
| Transitional | committed event or return | short, localized causal sequence, then observational state |

Transitional motion never loops indefinitely and never blocks input.

## 4. Core Loop Ranges

| Motion | Recommended cycle |
|---|---:|
| spore-hearth breathing | 4.5–8 s |
| canopy pulse | 7–14 s |
| liquid-current texture | 5–12 s depending on circulation |
| crystal refraction | 8–18 s with long holds |
| window/chamber variation | 6–20 s, seeded offsets |
| fog band drift | 25–70 s |
| distant civic signal | 8–24 s |
| Noctae idle | 4–10 s including holds |
| Noctae walk | 0.8–1.4 s per cycle |

Ranges prevent mechanical synchronization. Runtime chooses deterministic values within them; it does not use uncontrolled randomness.

## 5. State Modulation

- Illumination changes amplitude and local emissive intensity, not global playback speed.
- Circulation changes current speed and pulse reach within approved bounds.
- Citizen activity changes visible routine frequency and presentation density.
- Stability changes haze disturbance and the spacing of subtle atmospheric motion.
- Hibernation stops active emission, current, and growth loops; it may retain near-imperceptible non-metabolic atmosphere needed to keep the scene visually legible.
- Secured structures never disappear because a presentation loop stops.

State interpolation is visual smoothing only. The committed target remains authoritative and must be reached within a bounded presentation interval.

## 6. Study-Focus Behavior

When a focus session is active:

- enter Ambient tier over 600–1000 ms;
- reduce nonessential citizen loops and atmospheric density;
- avoid event staging, camera travel, or bright pulses;
- allow only a subtle local focus acknowledgment when higher canon requires it;
- defer newly committed high-salience consequences until the session-completion exhale or the next deliberate city inspection.

Noctis must never bid against the study task for attention.

## 7. Canonical Event Presentation

### `THE_PHEROMONE_PLUME`

A soft route-following spore movement crosses one or more districts, accompanied by brief sensory orientation from nearby citizens. Duration 4–8 s. No full-screen overlay.

### `BAROMETRIC_SHOCK_WAVE`

A restrained pressure ripple moves through haze, current, and canopy with a brief local dim-and-settle response. No camera shake during study and no failure styling.

### `ABYSSAL_DOUSE`

Active local emission and current settle over 2–5 s when observed. Citizens reduce presence and move toward preservation routines. The sequence communicates patience, never loss.

### `BENTHIC_BLOOM`

A teal civic-core lift follows existing channels, briefly increases ecological expression, and settles into the new committed state over 5–10 s. It is not a reward burst. An era boundary may also have crossed, but the bloom and era metamorphosis remain separately detectable consequences.

## 8. Domain And Era Transitions

Domain transitions are staged only when a typed transition record or before/after committed comparison proves them. Each sequence names:

- source transition;
- affected scene roles;
- start and end visual states;
- duration range;
- interrupt behavior;
- reduced-motion equivalent;
- persistence after the animation ends.

Era transitions unfold as a gradual metamorphosis. Structural additions settle into the scene between observations or through one calm reveal. There is no level-up popup, progress meter, fanfare screen, or forced cinematic.

An era boundary never crossfades from one complete era painting to another. Existing regions remain registered and visually continuous. Newly authorized space settles in additive stages—connection/terrain, routes/circulation, ecology, civic forms, then local light and fine detail—with overlapping eased intervals rather than a synchronized pop. Continuous secured readings keep changing density and maturity between boundaries, so the boundary is a new capability envelope rather than the only moment the world evolves. The code-native transition proof uses a roughly 10–12 second interruptible settle; production timing may spread low-salience additions across later observations. Reduced motion presents the final committed layers immediately.

## 9. Camera Motion

- District focus pan: 400–900 ms.
- Detail focus: 300–700 ms.
- Cursor parallax: maximum 6 px at default window, disabled during resize and reduced motion.
- Idle scenic drift: maximum 12 px over 20 s, optional and disabled during study.
- No free orbit, inertial navigation, rapid sweep, or continuous camera bob.

The camera is a curator. It does not become a vehicle.

## 10. Reduced Motion

Reduced motion is a complete visual mode, not zero-duration animation with missing meaning.

- choose authored still frames;
- show events through localized static emphasis and concise readable context;
- disable parallax, drift, particles with trajectories, and repeated pulses;
- preserve active/dimmed/hibernating distinctions through value and composition;
- avoid flashing; no element exceeds three high-contrast changes per second in any mode.

## 11. Performance

- animate transform, opacity, sprite-frame selection, shader uniforms, or canvas draw parameters;
- do not animate layout dimensions in steady loops;
- use one renderer scheduler per viewport rather than one timer per element;
- pause or reduce work when the viewport is hidden, minimized, or fully occluded;
- cull off-screen citizens and particles;
- avoid React state updates per animation frame;
- scale citizens, particles, refraction, and fog by performance tier;
- window dragging and resizing take priority over ambient fidelity.

## 12. Acceptance Checklist

- [ ] Motion cannot mutate or advance simulation state.
- [ ] Study focus visibly reduces salience.
- [ ] All canonical events have restrained, interruptible sequences.
- [ ] Hibernation stops metabolic motion without implying damage.
- [ ] Era transition has a non-modal, reduced-motion equivalent.
- [ ] No loop synchronizes the whole scene mechanically.
- [ ] Hidden/minimized viewport work is throttled.
- [ ] Dragging and resizing remain responsive.
- [ ] Reduced motion preserves every essential state distinction.
- [ ] No sequence uses uncontrolled randomness.

## Closing Validation Statement

Noctis motion is the breath over a persistent state. It makes the world feel alive, then knows when to become quiet enough for the user to live their own life.
