# Phase 5 Icon System Provenance

## Secret Aero Icons

- Pack id: `secret-aero-icons`
- Implementation: `theme/aeroIconPack.ts` (data) + `theme/iconPacks.ts` (registry
  and resolution) + `components/Icons.tsx` (the single renderer)
- Assets: none. Every icon is inline path data on a 24×24 grid; nothing is
  loaded from disk or the network, so the pack adds no asset payload and cannot
  fail to load.
- Creator/source: original vector artwork authored in this repository.
- External icon sets, icon fonts, brand marks, or operating-system assets
  traced, sampled, or bundled: none.
- Runtime dependencies: none; works offline and in a packaged build.
- Missing-glyph behavior: a pack is partial by contract. Any `IconName` it does
  not cover renders the base monochrome line glyph in `Icons.tsx`, so adding a
  name can never blank an icon.

## The drawing language

Three tiers, so the set stays cohesive without every icon being hand-tuned:

1. **Applications** (`form: 'tile'`) — a rounded glass plate in the family
   gradient with the existing line glyph laid over it in white, plus one
   hard-edged top sheen. Every app plate shares the same geometry, so a row of
   them reads as one system and apps are told apart by their glyph, not by their
   outline.
2. **Shell objects** (`form: 'object'`) — folders, files, drives, discs, the
   bin, the tray icons. Real silhouettes with a filled body, an optional accent
   shape, and white detail strokes. These are things, not programs, so they do
   not wear the app plate.
3. **Inline chrome** — deliberately absent from the pack. `search`, `close`,
   `plus`, `chevron`, `check`, `refresh` and `edit` stay monochrome line glyphs
   that inherit `currentColor`, because a glossy plate inside a text field's
   search button is the Phase 4.5 mistake in the other direction.

Application plates additionally fall back to the line glyph below 17 px
(`TILE_MIN_SIZE`). Window chrome renders at 15 px, where a gradient plate is
mud. Shell objects never degrade — a folder is a folder at 12 px.

## Colour and accessibility

Twelve families (`media`, `language`, `reading`, `cards`, `study`, `system`,
`play`, `manila`, `paper`, `info`, `alert`, `danger`, `ok`, `night`, `leaf`).
Each declares its own `edge`, darker than its body, so an icon holds its outline
against a bright wallpaper and against dark taskbar glass alike — legibility
never depends on the surface behind the icon. The `paper` family overrides the
detail ink to slate, since white-on-white would vanish.

Status and lifecycle icons are differentiated by silhouette, not tint:

- Status: `info` disc · `warning` wedge · `error` octagon · `success` check
- Lifecycle: `power` ring · `sleep` crescent · `restart` cycle · `logout` door ·
  `lock` lock

Every glyph declares its silhouette class in a `shape` field, which is emitted
as `data-icon-shape` on the rendered element and asserted by
`__tests__/aeroIconPack.test.ts` — the four status shapes must be four distinct
values, and likewise the five lifecycle shapes.

## Wiring

The Frutiger Aero theme names the pack in `assetPack.icons`.
`assetPacks.applyAssetPack()` resolves it on every theme change and points the
registry at it; `Icons.tsx` subscribes and repaints. Leaving the theme resolves
the pack to null and every icon returns to its line glyph. No consumer of
`<Icon>` — 61 files — needed to change.

## Checkpoint

The icon sheet is generated from the shipped pack data (not a copy of it) and
was reviewed at 48 / 32 / 24 / 16 px over both light Start glass and dark
taskbar glass.
