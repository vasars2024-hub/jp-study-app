/**
 * SecretAeroTrigger — the hidden discovery (Phase 1 · M3).
 * -----------------------------------------------------------------------------
 * Renders a near-invisible corner "button" (revealed as a faint glint on hover)
 * that toggles the secret Frutiger Aero theme on double-click. Typing "aero"
 * anywhere outside a text field toggles it too — an Easter egg. This is the
 * ONLY way into Aero: it is never listed in the theme picker.
 *
 * Toggling ON remembers the previously-active theme and restores it on toggle
 * OFF, so discovering Aero never loses the user's real theme choice.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_THEME_ID, loadThemeId, setTheme } from './engine';
import { AERO_THEME_ID } from './frutiger-aero';
import { requestSecretLifecycleShutdown } from '../secretLifecycle';
import { soundEngine } from '../audio/soundEngine';
import { markAeroDiscovered } from '../aeroDiscovery';
import { applyAeroEnvironment, restoreStudyEnvironmentAfterAero } from '../aeroEnvironment';
import { armLockscreenOnSecretEntry, AERO_ENTRY_LOCKED_EVENT } from '../lockscreenSettings';

let aeroRestoreThemeId = DEFAULT_THEME_ID;

const SEQUENCE = 'aero';
const AERO_SHUTDOWN_THEME_DELAY = 820;
const STUDY_OS_REBOOT_EVENT = 'shell:studyOsReboot';

function isTypingTarget(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null;
  if (!n || typeof n.tagName !== 'string') return false;
  return n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.isContentEditable === true;
}

export function exitSecretAero(): void {
  const back = aeroRestoreThemeId !== AERO_THEME_ID ? aeroRestoreThemeId : DEFAULT_THEME_ID;
  requestSecretLifecycleShutdown();
  window.setTimeout(() => {
    setTheme(back);
    soundEngine.stopAll();
    restoreStudyEnvironmentAfterAero();
    window.dispatchEvent(new CustomEvent(STUDY_OS_REBOOT_EVENT));
  }, AERO_SHUTDOWN_THEME_DELAY);
}

export default function SecretAeroTrigger() {
  const bufRef = useRef<string>('');
  const [flash, setFlash] = useState<string | null>(null);

  const toggle = useCallback((): void => {
    const current = loadThemeId();
    if (current === AERO_THEME_ID) {
      exitSecretAero();
      window.setTimeout(() => {
        setFlash('Frutiger Aero - off');
      }, AERO_SHUTDOWN_THEME_DELAY + 40);
    } else {
      aeroRestoreThemeId = current !== AERO_THEME_ID ? current : DEFAULT_THEME_ID;
      const firstDiscovery = markAeroDiscovered();
      applyAeroEnvironment(firstDiscovery);
      const needsLock = armLockscreenOnSecretEntry();
      if (needsLock) {
        setTheme(AERO_THEME_ID);
        window.dispatchEvent(new CustomEvent(AERO_ENTRY_LOCKED_EVENT));
      } else {
        window.dispatchEvent(new CustomEvent('shell:softReboot'));
        window.setTimeout(() => setTheme(AERO_THEME_ID), 240);
      }
      setFlash('Frutiger Aero');
    }
  }, []);

  // Typed "aero" Easter egg (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) {
        bufRef.current = '';
        return;
      }
      bufRef.current = (bufRef.current + e.key.toLowerCase()).slice(-SEQUENCE.length);
      if (bufRef.current === SEQUENCE) {
        bufRef.current = '';
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  // Auto-dismiss the confirmation flash.
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 1800);
    return () => window.clearTimeout(t);
  }, [flash]);

  return (
    <>
      <button
        type="button"
        className="aero-secret-trigger"
        tabIndex={-1}
        aria-hidden="true"
        title=""
        onDoubleClick={toggle}
      />
      {flash && (
        <div className="aero-secret-flash" role="status" aria-live="polite">
          {flash}
        </div>
      )}
    </>
  );
}
