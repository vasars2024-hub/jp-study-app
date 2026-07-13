# Ambient Audio (Phase 3 · M4)

Sources: `environment/ambientAudio.ts`, `audio/soundEngine.ts` (`playLoop`).
Connects the environment layer to the existing Phase-1 audio framework — no parallel
audio system.

## How it works

- `soundEngine.playLoop(category, name, {volume})` → `LoopHandle` (stop / setVolume /
  fadeTo). Loops a bed on the given category gain, inheriting master volume, mute,
  ducking, and Battery-Saver perf-gating. Returns a **silent no-op handle** when
  disabled/muted/perf-gated or the sound is missing.
- `ambientAudio.ts` keeps **one** ambient bed playing at a time and **crossfades** on
  change. The bed name is derived from the active wallpaper category via the
  framework bridge (`bedForCategory`): forest / ocean / sky / city / space / snow /
  ambient — all in the `'environment'` sound category.
- Gated by `env.enabled`, `env.ambientAudio.enabled`, `performanceTier`, and
  `data-perf` battery. Race-safe (sync token). `installAmbientAudio()` is booted next
  to `bootEnvironment` (non-companion-host).

## No bundled audio

Nothing ships with sound. With the default **silent** sound pack every call is a
no-op. It becomes audible once a pack registers `'environment'` bed names → URLs
(`soundEngine.registerPack` + `setActivePack`, or via a theme's `assetPack.sounds`).
Settings: **Atmosphere → Ambient audio** (enable + volume) shows a "silent until a
pack" hint.

## Volume chain

per-bed gain (env volume) × `'environment'` category gain (ducking) × master gain
(Quick Settings volume). Ducking the environment for a chime uses `soundEngine.duck`.
