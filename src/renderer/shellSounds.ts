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
import { playSound } from './audio/soundEngine';

let installed = false;

export function installShellSounds(): void {
  if (installed) return;
  installed = true;

  // Window / app open (Start, taskbar, palette, os:open bus).
  window.addEventListener('os:open', () => void playSound('ui', 'window-open'));

  // Menus / flyouts / search.
  window.addEventListener('shell:toggleQuickSettings', () => void playSound('ui', 'menu'));
  window.addEventListener('shell:toggleNotifications', () => void playSound('ui', 'menu'));
  window.addEventListener('palette:open', () => void playSound('ui', 'menu'));

  // Notifications (fires from the existing toast bus).
  window.addEventListener('os:toast', () => void playSound('notification', 'notify'));
}
