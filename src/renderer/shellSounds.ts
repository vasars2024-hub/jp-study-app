/**
 * Shell sound routing (Phase 2 · M11) — connects shell events to the Phase 1
 * audio framework. NO sounds are bundled, so with the default silent pack every
 * call is a safe no-op; this is pure event wiring. Register a sound pack
 * (soundEngine.registerPack + setActivePack, or via a theme's assetPack.sounds)
 * to make them audible.
 *
 * Additional per-window events (close/minimize) can be emitted from the shell
 * later; this routes the globally-dispatched shell events that already exist.
 */
import { playSound, soundEngine } from './audio/soundEngine';
import type { SoundCategory } from './audio/soundPack';
import type { NotificationKind } from './notificationStore';
import { COMPANION_EVENT, type CompanionEventDetail } from './environment/companionEvents';

let installed = false;
const lastPlayed = new Map<string, number>();

function notificationCue(kind?: NotificationKind): { category: SoundCategory; name: string; volume?: number } {
  if (kind === 'error') return { category: 'notification', name: 'error', volume: 0.9 };
  if (kind === 'warning') return { category: 'notification', name: 'warning', volume: 0.84 };
  if (kind === 'info') return { category: 'notification', name: 'info', volume: 0.74 };
  return { category: 'notification', name: 'notify', volume: 0.78 };
}

function playRouted(category: SoundCategory, name: string, volume = 1, throttleMs = 120): void {
  const key = `${category}:${name}`;
  const now = Date.now();
  if (now - (lastPlayed.get(key) ?? 0) < throttleMs) return;
  lastPlayed.set(key, now);
  if (category === 'system' || category === 'notification' || category === 'achievement') {
    soundEngine.duck('environment', 0.38, 650);
  }
  void playSound(category, name, { volume });
}

export function installShellSounds(): void {
  if (installed) return;
  installed = true;

  // Window / app open (Start, taskbar, palette, os:open bus).
  window.addEventListener('os:open', () => playRouted('ui', 'window-open', 0.7, 90));
  window.addEventListener('shell:windowClose', () => playRouted('ui', 'window-close', 0.58, 80));
  window.addEventListener('shell:windowMinimize', () => playRouted('ui', 'minimize', 0.5, 80));

  // Menus / flyouts / search.
  window.addEventListener('shell:toggleQuickSettings', () => playRouted('ui', 'menu', 0.52, 120));
  window.addEventListener('shell:toggleNotifications', () => playRouted('ui', 'menu', 0.52, 120));
  window.addEventListener('palette:open', () => playRouted('ui', 'menu', 0.52, 120));

  // Notifications (captured by notificationStore; DND suppresses this event).
  window.addEventListener('shell:notification', (event) => {
    const kind = (event as CustomEvent<{ kind?: NotificationKind }>).detail?.kind;
    const cue = notificationCue(kind);
    playRouted(cue.category, cue.name, cue.volume ?? 0.78, kind === 'error' ? 450 : 1200);
  });

  // Secret-Mode startup chime (Phase 4 · M4) — dispatched by AeroBootOverlay as
  // the emblem settles. `system` category = startup/shutdown.
  window.addEventListener('shell:startup', () => playRouted('system', 'startup', 0.9, 1800));
  window.addEventListener('shell:shutdown', () => playRouted('system', 'shutdown', 0.86, 900));
  window.addEventListener('shell:secretRestart', () => playRouted('system', 'restart', 0.68, 900));
  window.addEventListener('shell:secretSleep', () => playRouted('system', 'sleep', 0.68, 900));
  window.addEventListener('shell:secretWake', () => playRouted('system', 'wake', 0.68, 600));

  // Dialogs open (Phase 4 · M4) — dispatched by the promise-based dialogService.
  window.addEventListener('shell:dialogOpen', () => playRouted('ui', 'dialog', 0.62, 160));
  window.addEventListener('shell:dialogResolve', (event) => {
    const ok = (event as CustomEvent<{ ok?: boolean }>).detail?.ok === true;
    playRouted('ui', ok ? 'confirm' : 'cancel', ok ? 0.66 : 0.48, 120);
  });
  window.addEventListener(COMPANION_EVENT, (event) => {
    const kind = (event as CustomEvent<CompanionEventDetail>).detail?.kind;
    if (kind === 'achievement' || kind === 'streak') {
      playRouted('achievement', 'milestone', 0.74, 3000);
    } else if (kind === 'calendar' || kind === 'environment') {
      playRouted('companion', 'chirp', 0.28, 2400);
    }
  });
}
