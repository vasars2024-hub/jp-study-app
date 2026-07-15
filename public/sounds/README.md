# Sound packs

The Frutiger Aero audio framework (Phase 1 · M7) loads sounds from here.

**Convention:** `public/sounds/<packId>/<category>/<name>.<ext>`

- `<packId>` — the sound pack id (e.g. `aero`, `anime`).
- `<category>` — one of: `system`, `ui`, `environment`, `companion`, `achievement`, `notification`.
- `<name>` — logical sound name referenced by code (e.g. `click`, `confirm`, `startup`).

Example: `public/sounds/aero/ui/click.ogg`

**No audio is bundled yet.** The engine ships with a `silent` pack, so
`playSound(...)` is a safe no-op until a pack is registered
(`soundEngine.registerPack(manifest)`) and selected
(`soundEngine.setActivePack(id)`). A theme can bind a pack via
`assetPack.sounds` (wired in M10).

Keep audio files small (prefer `.ogg`/`.mp3`, short UI clips a few KB each). Like
the other large `public/` data blobs, heavy audio should stay out of git.
