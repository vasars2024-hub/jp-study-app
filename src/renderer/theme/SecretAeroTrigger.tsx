/**
 * SecretAeroTrigger — the hidden discovery (Phase 1 · M3).
 * -----------------------------------------------------------------------------
 * Renders a near-invisible corner "button" (revealed as a faint glint on hover)
 * that toggles the secret Frutiger Aero theme on click. Typing "aero"
 * anywhere outside a text field toggles it too — an Easter egg. This is the
 * ONLY way into Aero: it is never listed in the theme picker.
 *
 * Toggling ON remembers the previously-active theme and restores it on toggle
 * OFF, so discovering Aero never loses the user's real theme choice.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import { DEFAULT_THEME_ID, loadThemeId, setTheme } from './engine';
import { AERO_THEME_ID } from './frutiger-aero';
import { requestSecretLifecycleShutdown } from '../secretLifecycle';
import { soundEngine } from '../audio/soundEngine';
import { markAeroDiscovered } from '../aeroDiscovery';
import {
  applyAeroEnvironment,
  loadAeroRestoreTheme,
  rememberAeroRestoreTheme,
} from '../aeroEnvironment';
import { seedAeroDesktopPersonality } from '../aeroDesktopPersonality';
import { armLockscreenOnSecretEntry, AERO_ENTRY_LOCKED_EVENT } from '../lockscreenSettings';

const SEQUENCE = 'aero';
const AERO_SHUTDOWN_THEME_DELAY = 820;
const STUDY_OS_REBOOT_EVENT = 'shell:studyOsReboot';
const TRIGGER_SIZE = 44;

function readTaskbarHeight(): number {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--taskbar-h').trim();
    const n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : 48;
  } catch {
    return 48;
  }
}

function isAeroMaterialsActive(): boolean {
  return document.documentElement.getAttribute('data-materials') === 'aero';
}

/** Pin the activator to the visible desktop corner (4:3 frame in Aero, above taskbar otherwise). */
function useTriggerPlacement(): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>(() => ({
    width: TRIGGER_SIZE,
    height: TRIGGER_SIZE,
    right: 0,
    bottom: readTaskbarHeight(),
  }));

  useEffect(() => {
    const update = (): void => {
      const size = TRIGGER_SIZE;
      if (isAeroMaterialsActive()) {
        const frame = document.querySelector('.os-viewport-frame') as HTMLElement | null;
        if (frame) {
          const rect = frame.getBoundingClientRect();
          setStyle({
            width: size,
            height: size,
            top: Math.max(0, rect.bottom - size),
            left: Math.max(0, rect.right - size),
            right: 'auto',
            bottom: 'auto',
          });
          return;
        }
      }
      setStyle({
        width: size,
        height: size,
        top: 'auto',
        left: 'auto',
        right: 0,
        bottom: readTaskbarHeight(),
      });
    };

    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    const stage = document.querySelector('.os-viewport-stage');
    const frame = document.querySelector('.os-viewport-frame');
    stage && ro?.observe(stage);
    frame && ro?.observe(frame);

    window.addEventListener('resize', update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-materials', 'data-taskbar-size'] });

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
      mo.disconnect();
    };
  }, []);

  return style;
}

function isTypingTarget(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null;
  if (!n || typeof n.tagName !== 'string') return false;
  return n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.isContentEditable === true;
}

export function exitSecretAero(): void {
  // Living env restore is handled by installAeroEnvironmentBridge() when the
  // theme leaves Aero — do not call restoreStudyEnvironmentAfterAero here or
  // the Study backup would be overwritten by a second snapshot.
  const back = loadAeroRestoreTheme(DEFAULT_THEME_ID);
  requestSecretLifecycleShutdown();
  window.setTimeout(() => {
    setTheme(back);
    soundEngine.stopAll();
    window.dispatchEvent(new CustomEvent(STUDY_OS_REBOOT_EVENT));
  }, AERO_SHUTDOWN_THEME_DELAY);
}

export default function SecretAeroTrigger() {
  const { t, lang } = useT();
  const bufRef = useRef<string>('');
  const [flash, setFlash] = useState<string | null>(null);
  const placement = useTriggerPlacement();

  const toggle = useCallback((): void => {
    const current = loadThemeId();
    if (current === AERO_THEME_ID) {
      exitSecretAero();
      window.setTimeout(() => {
        setFlash(t('aero.trigger.off'));
      }, AERO_SHUTDOWN_THEME_DELAY + 40);
    } else {
      rememberAeroRestoreTheme(current !== AERO_THEME_ID ? current : DEFAULT_THEME_ID);
      const firstDiscovery = markAeroDiscovered();
      applyAeroEnvironment(firstDiscovery);
      // Desktop-widget half of first-run personality (M8). Fire-and-forget: a
      // failed IPC round trip should never block entering Aero itself.
      if (firstDiscovery) {
        seedAeroDesktopPersonality().catch((err) => {
          console.error('[aeroDesktopPersonality] seed failed:', err);
        });
      }
      const needsLock = armLockscreenOnSecretEntry();
      if (needsLock) {
        setTheme(AERO_THEME_ID);
        window.dispatchEvent(new CustomEvent(AERO_ENTRY_LOCKED_EVENT));
      } else {
        window.dispatchEvent(new CustomEvent('shell:softReboot'));
        window.setTimeout(() => setTheme(AERO_THEME_ID), 240);
      }
      setFlash(t('aero.trigger.on'));
    }
  }, [t, lang]);

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

  const ui = (
    <>
      <button
        type="button"
        className="aero-secret-trigger"
        style={placement}
        tabIndex={-1}
        aria-hidden="true"
        title=""
        onClick={toggle}
      />
      {flash && (
        <div className="aero-secret-flash" role="status" aria-live="polite">
          {flash}
        </div>
      )}
    </>
  );

  // Portal to <body> so #root zoom / desktop stacking never eats the hit target.
  if (typeof document !== 'undefined') return createPortal(ui, document.body);
  return ui;
}
