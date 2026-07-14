# Phase 5 Audio Pack Provenance

## Secret Aero System Pack

- Pack id: `secret-aero-proof`
- Implementation: `src/renderer/audio/aeroProofPack.ts`
- Asset form: generated WAV data URLs registered at runtime
- Creator/source: original procedural synthesis generated in this repository
- External samples: none
- External melodies or copied system sounds: none
- Purpose: Phase 5 M4/M5 source-generated Secret OS system sound pack. Final
  mastered loose assets remain optional future work; if introduced, they need
  their own packaged-file provenance entries.

## Included Cues

- `system.startup`
- `system.shutdown`
- `system.restart`
- `system.sleep`
- `system.wake`
- `notification.notify`
- `notification.info`
- `notification.warning`
- `notification.error`
- `ui.info`
- `ui.warning`
- `ui.error`
- `ui.confirm`
- `ui.cancel`
- `ui.dialog`
- `ui.menu`
- `ui.window-open`
- `ui.window-close`
- `ui.minimize`
- `achievement.milestone`
- `companion.chirp`
- `environment.ambient`
- `environment.forest`
- `environment.ocean`
- `environment.sky`
- `environment.city`
- `environment.space`
- `environment.snow`

The environmental bed names currently share one low-cost generated ambient cue
so the ambient-audio framework is exercised without adding large bundled assets.
