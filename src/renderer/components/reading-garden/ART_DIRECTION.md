# Mooncap Reading Garden — Living Asset Direction

The scene should feel like an aquarium without water: a single protected
ecosystem viewed through glass, always alive at the edges, but calm enough to
leave open while reading. The authored mushroom is the only hero. Every other
asset exists to frame its silhouette, carry its cyan light into the world, or
reward close observation.

Growth consumes 50 recorded EPUB pages per phase. Earned pages stay banked
across sessions and calendar days, while the garden releases no more than one
new phase per day. The scene should make that daily evolution feel meaningful
without turning ordinary page turns into a noisy reward loop.

## Perpetual-night ecology

This world has no photosynthetic trees or ordinary green forest canopy. Every
tree-scale silhouette is fungal or mycelial:

- **Shelf towers:** thick fibrous trunks grown from fused hyphae, with
  irregular bracket-fungus crowns rather than branches and leaves.
- **Spore umbrellas:** tall, thin stems supporting torn asymmetrical caps;
  distant examples read as crooked towers, never evenly spaced conifers.
- **Lantern columns:** hollow ribbed stalks with a few dim cyan pores. Their
  light is practical and localized, not a field of decorative dots.
- **Mycelial mangroves:** root arches and cable-like hyphae at the wetland edge,
  with small nodules and no foliage.
- **Coral fungi:** forked silhouettes used sparingly in the middle distance to
  break up repeated cap shapes.

The ecosystem feeds on mineral-rich soil, water, decay, moon radiation, and a
subterranean mycelial network. Moss-like ground cover should read as velvet
fungal mats, lichen crust, or fine hyphae—not grass. Large forms may be strange
and chaotic; micro-detail must remain selective so the mushroom hero stays
dominant.

No pines, deciduous trees, leafy shrubs, grass fields, or daylight biology
belong in final environment assets.

## Composition guardrails

“Clear for the hero” must never become a flat empty stage or a symmetrical
forest corridor. The environment needs strong, uneven landforms at every depth:

- One side carries a dominant near cliff, root arch, or leaning fungal shelf;
  the opposite side stays lower and more open.
- The mushroom stands on a raised irregular mycelial island or broken stone
  terrace, not a flat lawn.
- Water or a ravine crosses the scene diagonally and disappears behind terrain;
  it never forms a centered horizontal stripe.
- At least three overlapping hill layers lead toward distant jagged fungal
  mountains, mesas, or eroded mineral spires.
- The horizon is off-center and partially occluded. Avoid a central vanishing
  point with equal walls on both sides.
- Cloud banks have different scales and directions: one large moonlit storm
  mass, a torn middle bank, and a low fog front. Never mirror cloud volume.
- Detail density is deliberately uneven. A few rich anchors are balanced by
  broad shadow, mist, water, and sky—not by making both sides match.

## Layer stack

1. **Deep sky:** a near-black indigo-to-plum gradient. Avoid pure black except
   in the vignette and foreground occlusion.
2. **Star vault:** three star sizes, sparse cool pinpricks, and rare soft violet
   stars. Twinkle by opacity and sub-pixel scale; never blink fully off.
3. **Celestial layer:** one large cool moon, one tiny violet planet, and an
   extremely slow parallax drift. The moon is the key light and should move less
   than five percent of the viewport over a minute.
4. **Cloud depth:** three separate translucent banks. Back clouds are cool
   blue-grey and sharper; front clouds are larger, darker, and more blurred.
   Their loops must be long enough that a repeated formation is not obvious.
5. **Distant terrain:** two silhouette ridges with different contrast and
   movement amplitudes. Their job is scale, not detail.
6. **Garden ground:** wet soil, small roots, fungal velvet, scattered stones,
   and sparse coral-fungus silhouettes. Keep the center clear for all 50
   mushroom silhouettes.
7. **Mushroom:** the supplied 50-stage sequence, grown from the lower mycelial
   terrace at plate coordinates (0.415, 0.742) — left of centre, with the
   terrace lip in front of it and the river reading past its right shoulder —
   and allowed to become increasingly emissive. The scene must never crop its
   cap at stage 30+ or its tendrils at stage 45+.
8. **Life layer:** spores, dust, fireflies, crawling insects, and rare passing
   silhouettes. This layer moves independently from clouds and fog.
9. **Foreground glass:** low fog, near-black foliage occlusion, vignette,
   restrained bloom, and a faint cool color grade.

## Particle asset families

### Ambient dust and spores

- **Cold dust:** 1–2 px desaturated blue-grey dots, 24 variants of brightness,
  drifting upward at different speeds. These establish air volume.
- **Mycelial spores:** soft cyan pinheads with a dim halo and slightly curved
  paths. Density rises every ten growth stages.
- **Cap pollen:** rare lavender flecks emitted from the cap only at stages
  21–44. They lift briefly, lose saturation, then disappear.
- **Luminous dew:** tiny droplets that form under the cap at stages 16–39.
  Each droplet brightens, stretches, falls, and produces a one-frame ground
  glint. Keep the event rate low.
- **Late-stage motes:** stages 40–50 gain slow orbiting teal motes that follow
  the tendril silhouette without drawing a literal circle.
- **Reading burst:** a page turn releases 6–10 very small motes from the soil,
  one brighter firefly pulse, and a gentle contact-light swell. Avoid fireworks.

### Particle timing

- Dust/spores: 18 combined ambient motes, reduced to 8 with reduced motion.
- Fireflies: 3 at stage 1, growing to at most 6 at stage 50; all routes stay in
  asymmetric side clearings outside the mushroom and moon silhouettes.
- Dew: 1–3 slow drops from stage 16 onward.
- Page-turn burst: 7–10 tiny motes over 920 ms with a restrained ground pulse.

## Insect asset families

Each crawling creature needs a dark body that reads first as a moving silhouette
and a tiny reflected cyan rim that appears only when it crosses the mushroom
light.

- **Velvet beetle:** 8-frame walk, 16×12 px native sprite, deep aubergine shell,
  three leg pairs, cyan specular pixel. Slow, decisive movement with pauses.
- **Root springtail:** 8-frame scurry/jump loop, 12×8 px. Travels in short
  bursts, often reverses, and stays near the soil line.
- **Moon pillbug:** 8-frame crawl/curl loop, 14×10 px. Cool graphite plates
  with a muted violet rim.
- **Glasswing gnat:** 8-frame wing loop, 10×10 px. Appears only in the upper
  half, never more than two, with translucent wings and no large glow.
- **Tiny centipede:** 8-frame wave, 24×7 px. Rare background crossing at
  stages 31+, moving behind the mushroom base.
- **Moth silhouette:** 8-frame slow flap, 22×16 px. One dim side-route moth
  appears from stage 27 onward and never crosses the moon or progress text.

Insect routes should be splines with pauses and turnarounds, not straight
screen-edge conveyor belts. They must never cross the progress text.

## Firefly design

Use three related firefly temperatures:

- 60% mint-cyan: the mushroom’s primary reflected light.
- 25% sea-glass green: breaks color monotony near foliage.
- 15% warm amber: creates depth and stops the night from feeling digitally blue.

Each firefly is a one-pixel core, a small colored body glow, and a very soft
outer halo. The halo pulse and flight direction must use different periods so
the motion never feels synchronized.

## Lighting atmosphere

- **Moon key:** cool top-right directional wash, strongest on cloud tops and the
  right edge of the mushroom.
- **Mushroom practical:** cyan/violet point light centered low on the stem. It
  grows in radius and intensity across the five ten-stage bands.
- **Ground bounce:** a flattened cyan ellipse under the mushroom, broken by
  roots and stones rather than drawn as a clean UI glow.
- **Fog scatter:** the low fog should become visible only as it intersects the
  moonbeam or mushroom light.
- **Contact shadow:** broad, very soft, and nearly black-violet. Preserve it even
  when the mushroom becomes highly emissive so the asset stays grounded.
- **Bloom:** only emissive cyan pixels and the brightest moon edge bloom.
  Purple body pixels should remain crisp.
- **Vignette:** asymmetric, darker at the lower corners, with the center kept
  open. Do not apply an opaque black overlay across the authored pixel art.

## Delivered production raster pack

- `mooncap-background-master-v2.png`: clean 4:5 fungal world plate without
  baked celestial or cloud elements.
- `cloud-banks-atlas-v1.png`: six transparent cloud banks spanning three depths.
- `moon-surface-v1.png` and `planet-violet-v1.png`: authored alpha surfaces.
- `particle-atlas-v1.png`: fireflies, spores, dust, pollen, dew, and glints.
- `ground-insect-atlas-v1.png`: velvet beetle, springtail, pillbug, and
  centipede; eight frames per row.
- `aerial-insect-atlas-v1.png`: glasswing gnat and moon moth; eight frames per
  row.
- `mushroom-stages-01-10.png`, `mushroom-stages-11-20.png`,
  `mushroom-stages-21-30.png`, and `mushroom-stages-31-50.png`: the complete
  supplied growth sequence.

The primary composition is a compact 4:5 portrait widget. All authored layers
must also be overscan-safe when cropped to 4:3 or a narrow desktop window. No
text, labels, baked bloom, baked vignette, or mushroom appears in environment
plates.

## World projection

Everything that belongs to the landscape lives inside a **world rect**: the
cover crop of the master plate, computed in `readingGardenWorld.ts` and anchored
so the mushroom's contact point lands at a fixed viewport position instead of
wherever a centred crop happens to leave it. World-locked layers — plate, mist,
hero, root bed, occlusion mask, life canvas — position themselves in percentages
of that rect, and one camera transform scales all of them together about the
anchor.

This is not optional polish. The previous layout mixed three coordinate systems
(an `object-fit: cover` plate, a hero anchored to the container in `cqh`/px, and
a camera that scaled the plate but not the hero), so every window resize slid
the terrain out from under the mushroom. Anything new that belongs to the
landscape must go inside a world layer and be sized in world percentages; only
sky, HUD and full-frame grades belong to the viewport.

## Hero integration pass

The supplied atlas is authored warm — brown soil mound, tan stem, mauve cap — on
a front-facing sprite sheet. Rather than re-authoring 50 frames, the sprite is
re-lit at load time (`mushroomGrade.ts`): the soil bed is detected and cut, the
warm hues are folded onto the plate's indigo-to-periwinkle band, a moon key from
the upper right is applied against deep shadow on every downward-facing surface,
and existing cyan bioluminescence is detected first and protected from the
grade. The cut base is replaced by a procedural root bed (`mushroomBed.ts`) —
roots, mycelium, satellite fungi and low mist, drawn as a foreshortened fan so
it recedes with the terrain.

Two rules there are easy to break:

- The sprite is scaled exactly once, at blit time, with smoothing off. Every
  extra resample softens its edges until it reads as a different medium from the
  environment plate.
- Root spread scales with the stem, but everything that belongs to the *ground*
  — satellite fungi, mist, soil texture — is sized from `groundUnit`, a fraction
  of the world. Scale ground detail off the hero instead and the late stages
  drag the scenery up with them until the roots read as searchlights.

## Implementation status

All authorized raster batches and the final in-app compositing pass are
complete. Background parallax, six cloud routes, moon/planet drift, water/fog,
particles, crawling insects, aerial insects, contact light, and reduced-motion
fallbacks are integrated in the widget.
