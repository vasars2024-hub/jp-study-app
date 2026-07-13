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

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_THEME_ID, loadThemeId, setTheme } from './engine';
import { AERO_THEME_ID } from './frutiger-aero';
import { loadEnvironment, saveEnvironment } from '../environment/environmentStore';
import { presetPatch } from '../environment/environmentPresets';
import type { EnvironmentSettings } from '../environment/types';

// Prior living-desktop state, remembered while Aero is active so it restores on
// exit (Phase 3 · M8).
let aeroPrevEnv: EnvironmentSettings | null = null;

const SEQUENCE = 'aero';

function isTypingTarget(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null;
  if (!n || typeof n.tagName !== 'string') return false;
  return n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.isContentEditable === true;
}

export default function SecretAeroTrigger() {
  const restoreRef = useRef<string>(DEFAULT_THEME_ID);
  const bufRef = useRef<string>('');
  const [flash, setFlash] = useState<string | null>(null);

  const toggle = (): void => {
    const current = loadThemeId();
    if (current === AERO_THEME_ID) {
      const back = restoreRef.current !== AERO_THEME_ID ? restoreRef.current : DEFAULT_THEME_ID;
      setTheme(back);
      // Restore the living desktop to its pre-Aero state (Phase 3 · M8).
      if (aeroPrevEnv) {
        saveEnvironment(aeroPrevEnv);
        aeroPrevEnv = null;
      }
      setFlash('Frutiger Aero — off');
    } else {
      restoreRef.current = current;
      // Living desktop: entering Aero brings the world to life. Remember the prior
      // state; only auto-configure a gentle preset if the layer was off, so a user
      // who already tuned their atmosphere keeps it (Phase 3 · M8).
      const prevEnv = loadEnvironment();
      aeroPrevEnv = prevEnv;
      if (!prevEnv.enabled) {
        saveEnvironment({ enabled: true, ...(presetPatch('floating-islands') ?? {}) });
      }
      // Secret Mode "soft reboot": cover the screen with the Aero boot splash,
      // switch the theme behind it, then reveal the glass OS (Phase 2 · M15).
      window.dispatchEvent(new CustomEvent('shell:softReboot'));
      window.setTimeout(() => setTheme(AERO_THEME_ID), 240);
      setFlash('✨ Frutiger Aero');
    }
  };

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
    // toggle is stable enough for this lifetime; deps intentionally empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
