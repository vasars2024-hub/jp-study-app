---
doc_id: noctis.character_design
tier: 8
authority: production_pipeline
role: noctae_character_art_specification
status: approved
depends_on:
  - VISION.md
  - ART_DIRECTION.md
  - NOCTIS_ECOLOGICAL_ENGINE.md
  - GAME_DESIGN.md
  - SIMULATION_SYSTEMS.md
  - CITIZEN_SYSTEM.md
  - CULTURE_SYSTEM.md
  - TECHNOLOGY_SYSTEM.md
---

# Noctis Character Design

## Document Status And Authority

This document binds the visual production of the Noctae and their presentation-only variants. It does not create citizen biology, roles, identity, culture, or simulation state. Those truths come from Tiers 3, 6, and 7.

The Noctae must read as a society at tiny scale: emotionally legible, physically non-human, adapted to permanent night, and never reduced to mascots or controllable units.

## 1. Silhouette Law

At normal District View, a Noctae is approximately 24–40 CSS pixels tall. The silhouette must remain recognizable at that size without facial detail.

Required silhouette traits:

- small, compact body with a slightly forward, sensing posture;
- large obsidian or mirror-like eyes that reflect ambient light but do not emit it;
- faint sensory spires, veins, or filaments breaking the head and shoulder contour;
- hands and tools readable through gesture, not anatomical detail;
- clothing and carried forms grown, woven, knotted, crystallized, or biosilicate-based;
- no ordinary human hairstyle silhouette as the primary identifier;
- no helmet, armor, weapon, or fantasy-class silhouette unless future higher-authority canon explicitly requires it.

The result should feel curious, patient, observant, and strange. Oversized heads, chibi proportions, plush-toy cues, and expressive cartoon mouths are rejected.

## 2. Anatomy Translation

### Eyes

- occupy enough silhouette area to catch one or two controlled reflection pixels at runtime;
- use polished dark values with a pale reflected edge;
- never glow as lamps;
- never receive human iris colors or exaggerated emotional pupils.

### Sensory Spires

- appear as short antenna-like filaments, lateral veins, or crest traces;
- carry low-intensity presentation tints based on current knowledge emphasis;
- remain subordinate to civic light sources;
- use a separate emissive mask where animated.

### Skin And Surface

- dark-adapted values: charcoal violet, deep slate, muted umber, cold gray, or wine-shadow;
- enough local contrast to separate body, clothing, tool, and ground;
- no glossy superhero material or neon full-body outline.

### Clothing And Tools

Early forms use woven mycelial fibers, layered cap material, tactile cords, seed vessels, raised tablets, and simple prism tools. Later forms may use grown biosilicate, resonant instruments, organic glass, and living-circuit adornment. Every later-era element remains anchored in biology and night.

## 3. Presentation Identity Model

Ambient individuals are deterministic expressions of aggregate Citizen state. Art therefore uses modular appearance slots rather than unique permanent portraits for every visible citizen.

```text
body silhouette
  + era garment family
  + civic-role prop
  + knowledge-affinity tint mask
  + district/ecology accent
  + seeded minor variation
```

Allowed seeded variation includes height within a narrow range, garment edge, carried prop, sensory-spire shape, walking phase, and subtle palette shift. It may not imply a simulation fact such as wealth, rank, health, belief, or profession unless committed state supports it.

When a citizen performs a durable action or is captured into Memory, the selected presentation identity is committed through stable identifiers so later rendering remains reproducible.

## 4. Source Sheet Standard

The master character model is drawn at 96 × 128 pixels per frame on a transparent canvas, then rendered down with nearest or high-quality pixel-aware sampling according to the final illustration treatment.

- frame footprint: 96 × 128 px;
- visual body height: 88–112 px inside the frame;
- ground contact anchor: `(48, 112)`;
- four diagonal directions: northeast, northwest, southeast, southwest;
- symmetrical directions may be mirrored only when tools, cords, and light masks remain physically valid;
- all frames use identical bounds and anchor points;
- body color, emissive mask, carried prop, and optional shadow are separate layers.

The master may be painterly-pixel or clean illustrated sprite work, but one production set cannot mix incompatible edge languages.

## 5. Era I Character Set

The first complete set contains no more than six body/garment combinations and five role props. Variety comes from controlled composition rather than a large inconsistent roster.

Required body/garment combinations:

- 3 base silhouettes with distinct posture and sensory-spire shape;
- 2 garment families per silhouette: civic and field;
- 3 approved night-value variants per family.

Required props:

- tactile knot cord or raised tablet;
- seed vessel;
- small prism instrument;
- maintenance tool grown from root or biosilicate;
- portable lantern organ with separate low-intensity mask.

Required ambient actions:

- idle sensing;
- four-direction walk;
- pause at light;
- kneel or tend;
- read tactile record;
- exchange semaphore with one partner;
- carry one approved prop.

No attack, panic, damage, hunger, command acknowledgment, or victory animation belongs in the Era I set.

## 6. Role Expression

Citizen roles are character, not employment controls. They are expressed through action and prop, never a colored class uniform.

- Memory Custodian: tactile record, measured route, archive pause.
- Spore Tender: seed vessel, canopy inspection, careful tending loop.
- Resonance Interpreter: prism or lattice instrument, listening posture.
- Route Keeper: cord markers, path inspection, small maintenance gesture.
- Teacher or Apprentice: paired semaphore and tactile demonstration.
- Observer: still posture near ridge, pool, or instrument.

The same base citizen may express several roles over time. Generated art must not hard-code a permanent caste.

## 7. Motion Personality

- gait is careful and grounded, with small vertical amplitude;
- pauses are longer than in conventional game sprites;
- turns anticipate through head or sensory-spire orientation;
- gestures are slow enough to read at small scale;
- group motion uses offset timing rather than synchronized loops;
- reaction to a focus surge is subtle orientation and sensory-line response, never cheering;
- hibernation uses sparse presence and deliberate preservation routines, never collapse.

## 8. Palette And Emissive Masks

Body values remain within the night palette. Knowledge-type tints affect sensory masks and small garment or tool accents only.

- mathematics/logic: pale cyan and white geometric trace;
- history/memory: muted amber and root gold;
- language/literature: soft violet and spore gold;
- science/engineering: scholarly teal and glass cyan;
- art/music: restrained magenta and resonant gold.

Tinting is a user-facing translation, blended when inputs are mixed. A citizen never becomes a saturated team color.

## 9. AI Reference-Pack Requirements

Before any production sprite is requested from an image model, one approved model sheet must exist with:

- front, back, and both three-quarter silhouettes;
- neutral palette and three approved tint examples;
- eye, spire, hand, foot, garment, and prop callouts;
- a scale comparison against the Era I spore-hearth and shelter;
- positive and negative examples;
- a written identity lock copied into every generation prompt.

Image-model output is concept material until a human cleanup pass normalizes silhouette, perspective, frame bounds, transparency, palette, and anchors. Generated sprite sheets are never accepted directly into runtime assets.

## 10. Rejection Rules

Reject any character asset that:

- reads as an ordinary human, elf, child mascot, robot, or fantasy class;
- uses vocal-performance poses as the primary communication language;
- contains baked scenery, text, UI, particle fields, or a colored background;
- changes eye emission, anatomy, direction, scale, or garment logic between frames;
- implies user command, combat, suffering from absence, or a collectible rarity;
- cannot be separated into body, prop, shadow, and emissive layers;
- loses its silhouette at 32 px display height.

## 11. Acceptance Checklist

- [ ] Silhouette reads at 24, 32, and 40 CSS pixels.
- [ ] Four directions share one perspective and anchor.
- [ ] Eyes reflect but do not emit.
- [ ] Sensory tint remains subordinate to environmental light.
- [ ] Every role reads through behavior rather than uniform color.
- [ ] Reduced-motion presentation has a valid still pose.
- [ ] Hibernating citizens look patient, not harmed.
- [ ] No frame contains text, UI, baked environment, or unapproved anatomy.
- [ ] The final sheet passes frame-bound, anchor, alpha-edge, and palette validation.

## Closing Validation Statement

The Noctae are small lives adapted to a vast night. Their design succeeds when the user senses work, care, memory, and curiosity without ever mistaking them for pieces waiting to be moved.
