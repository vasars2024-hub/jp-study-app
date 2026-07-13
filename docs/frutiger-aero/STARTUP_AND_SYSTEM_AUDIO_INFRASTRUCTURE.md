# Startup & System-Audio Infrastructure (Phase 4 · M4)

How entering Secret Mode boots the Frutiger Aero OS, and how semantic sounds are
routed. Phase 4 refines the existing infrastructure only — it authors no
production sound pack (that is Phase 5). Companion to
`PHASE_4_IMPLEMENTATION_PLAN.md`.

## The startup sequence

Entering Aero (double-click the bottom-right corner, or type "aero" outside a
text field) dispatches `shell:softReboot`. `components/shell/AeroBootOverlay.tsx`
(mounted once by DesktopShell) runs the sequence:

1. Study OS dims — the sky splash covers the screen (`aero-boot-in`).
2. The theme switches **behind** the splash (existing SecretAeroTrigger flow).
3. The original Study OS emblem (orb + "Study OS") appears.
4. A soft **aurora** layer forms (`.os-aero-boot-aurora`, luminous green/aqua
   bands).
5. A **startup sound event** (`shell:startup`) fires as the emblem settles.
6. A brief **Welcome** state (`.os-aero-boot.welcome`) — the emblem lifts and
   brightens, the subtitle reads "Welcome".
7. The splash fades out (`aero-boot-out`); the Classic 4:3 desktop resolves.
8. Taskbar and icons settle (they were already mounted behind the splash).
9. Environment layers fade in (existing Phase 3 `EnvironmentStack`).
10. Ambient audio begins gently (existing Phase 3 `ambientAudio`, silent until a
    pack is registered).

Timing (non-reduced): sound at ~500 ms, welcome at ~850 ms, resolve at ~1600 ms.

### Reduced sensory / skip / fallback

- **Reduced motion** (OS setting or in-app `html.reduce-motion`): the whole
  sequence compresses (~350 ms), and the spinner/aurora motion collapses via the
  global `a11y.css` rule. The startup event still fires (~120 ms) so audio wiring
  is exercised, but nothing visibly moves.
- **Skip**: any `pointerdown` or `keydown` during the sequence jumps straight to
  the fade-out. Exiting Aero remains instant (handled by SecretAeroTrigger).
- **Fallback**: with the default silent pack every `playSound` is a no-op, so a
  missing sound pack never errors.

## Sound routing

Semantic events are routed to `audio/soundEngine` in one place — `shellSounds.ts`
(`installShellSounds`, called once from `main.tsx`). No component talks to the
audio engine directly; they dispatch a `window` event and shellSounds maps it to
a `(category, name)` pair.

| Event | Category · name | Source |
|---|---|---|
| `os:open` | ui · window-open | Start/taskbar/palette open bus |
| `shell:toggleQuickSettings` | ui · menu | Quick Settings |
| `shell:toggleNotifications` | ui · menu | Notification Center |
| `palette:open` | ui · menu | Command palette |
| `os:toast` | notification · notify | toast bus |
| **`shell:startup`** | **system · startup** | **AeroBootOverlay (M4)** |
| **`shell:dialogOpen`** | **ui · dialog** | **dialogService (M4)** |

Categories come from `audio/soundPack.ts` (`system` = startup/shutdown, `ui`,
`environment`, `companion`, `achievement`, `notification`). The engine respects
the `soundsEnabled` / muted / volume prefs and the performance tier (Battery
Saver suppresses ambient categories). Volume and mute are owned by the engine
and surfaced in Quick Settings (Phase 2).

## Boundaries

- **No authored assets.** M4 wires events only; silence, placeholders, or
  user/licensed test assets may be dropped at
  `public/sounds/<packId>/<category>/<name>.<ext>`. The finished original pack
  (and never a note-for-note copy of Microsoft sounds) is Phase 5.
- **Window close/minimize sounds** are intentionally not wired yet: those events
  would be emitted from `DesktopShell.tsx`, which currently carries concurrent
  (non-Phase-4) work. They land once that work commits, alongside the deferred
  M3 shell hunks.
