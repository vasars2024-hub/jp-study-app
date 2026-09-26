/**
 * System-wide shortcuts for the captions / system-audio commands.
 *
 * A LOCAL SHIM. The shared global-command registry (`main/globalCommands.ts`,
 * `registerGlobalCommand(id, handler)`) is being built on another branch; when
 * it lands, `systemAudioCapture.ts`'s single call to `bindCaptionsGlobalCommand`
 * is the one line to switch, and this file goes away. Until then it does what
 * `blanc:setGlobalShortcut` and `app:setToggleShortcut` do in `main.ts`: the
 * renderer owns the chords (Settings → Shortcuts, `global: true` rows in
 * `keyboardShortcuts.ts`) and pushes them here on boot and on every rebind;
 * this registers them with the OS and reports the ones another app owns.
 */
import { globalShortcut, ipcMain } from 'electron';
import { CAPTIONS_CHANNELS, CAPTIONS_GLOBAL_COMMANDS } from '../shared/captionsOverlay';

const handlers = new Map<string, () => void>();
/** command id → the accelerator currently registered for it. */
const registered = new Map<string, string>();

/** The first alternative of an app chord as an Electron accelerator, or an error. */
export function toGlobalAccelerator(chord: unknown): { ok: true; accelerator: string } | { ok: false; error: string } {
  if (typeof chord !== 'string' || !chord.trim()) return { ok: true, accelerator: '' };
  const accelerator = (chord.split('|')[0] ?? '').trim().replace(/\bMeta\b/g, 'Super');
  if (/Mouse/i.test(accelerator) || !/^([\w]+\+)+[\w,.;'[\]/\\`=-]+$/.test(accelerator)) {
    return { ok: false, error: 'This shortcut cannot be registered system-wide.' };
  }
  if (!/(Ctrl|Alt|Shift|Super|CmdOrCtrl)\+/i.test(accelerator)) {
    return { ok: false, error: 'Global shortcuts need at least one modifier key.' };
  }
  return { ok: true, accelerator };
}

/** Attach the action a global command runs. */
export function bindCaptionsGlobalCommand(id: string, handler: () => void): void {
  handlers.set(id, handler);
}

/** Run a command the way its shortcut would (tray menu, tests). */
export function runCaptionsGlobalCommand(id: string): boolean {
  const handler = handlers.get(id);
  if (!handler) return false;
  handler();
  return true;
}

function unregister(id: string): void {
  const accelerator = registered.get(id);
  if (!accelerator) return;
  try {
    globalShortcut.unregister(accelerator);
  } catch {
    /* already gone */
  }
  registered.delete(id);
}

/**
 * Register `chords` (command id → app chord; '' unbinds). Returns, per command,
 * why its chord could not be registered.
 */
export function applyCaptionsGlobalShortcuts(chords: Record<string, unknown>): { ok: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  for (const id of CAPTIONS_GLOBAL_COMMANDS) {
    if (!(id in chords)) continue;
    unregister(id);
    const parsed = toGlobalAccelerator(chords[id]);
    if (!parsed.ok) {
      errors[id] = parsed.error;
      continue;
    }
    if (!parsed.accelerator) continue;
    const handler = handlers.get(id);
    if (!handler) continue;
    try {
      if (globalShortcut.register(parsed.accelerator, () => handler())) {
        registered.set(id, parsed.accelerator);
      } else {
        errors[id] = `"${parsed.accelerator}" is already in use by another application.`;
      }
    } catch (err) {
      errors[id] = err instanceof Error ? err.message : 'Could not register the global shortcut.';
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

export function registerCaptionsGlobalShortcutIpc(): void {
  ipcMain.handle(CAPTIONS_CHANNELS.setGlobalShortcuts, (_event, chords: unknown) =>
    applyCaptionsGlobalShortcuts(chords && typeof chords === 'object' ? (chords as Record<string, unknown>) : {}),
  );
}
