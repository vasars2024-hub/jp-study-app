/**
 * AeroBootOverlay (Phase 2 · M15, extended Phase 4 · M4) — the Secret Mode
 * "soft reboot". When the user activates Frutiger Aero, a full-screen sky boot
 * splash covers the screen while the theme switches behind it, then fades to
 * reveal the glass OS — so it feels like booting into another operating system.
 *
 * Phase 4 · M4 sequences it into the intended startup flow: emblem + aurora
 * form → a `shell:startup` semantic sound event fires (routed by shellSounds →
 * soundEngine; silent until a pack is registered) → a brief "Welcome" state →
 * the desktop resolves. Skippable by click or key. Honours reduced motion
 * (shorter, no spinner/aurora motion via the global rule).
 *
 * Mounted by DesktopShell and driven by the Phase 5 lifecycle state module.
 */
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { LANG_TAGS } from '../../../shared/i18n/core';
import AeroBootGlobe from './AeroBootGlobe';
import {
  getSecretLifecycleState,
  reduceSecretLifecycleMotion,
  requestSecretLifecycleWake,
  setSecretLifecycleMuted,
  skipSecretLifecycle,
  subscribeSecretLifecycle,
  type SecretLifecyclePhase,
} from '../../secretLifecycle';

const HIDDEN = new Set<SecretLifecyclePhase>(['inactive', 'active']);
const BOOT_ORDER: SecretLifecyclePhase[] = ['preboot', 'boot', 'welcome', 'reveal'];

function phaseSubKey(phase: SecretLifecyclePhase): string {
  switch (phase) {
    case 'preboot':
      return 'aero.boot.sub.preboot';
    case 'boot':
      return 'aero.boot.sub.boot';
    case 'welcome':
      return 'aero.boot.sub.welcome';
    case 'reveal':
      return 'aero.boot.sub.reveal';
    case 'sleeping':
      return 'aero.boot.sub.sleeping';
    case 'waking':
      return 'aero.boot.sub.waking';
    case 'shutting-down':
      return 'aero.boot.sub.shuttingDown';
    case 'safe-fallback':
      return 'aero.boot.sub.safeFallback';
    default:
      return 'aero.boot.sub.default';
  }
}

function phaseKickerKey(phase: SecretLifecyclePhase): string {
  switch (phase) {
    case 'preboot':
      return 'aero.boot.kicker.preboot';
    case 'boot':
      return 'aero.boot.kicker.boot';
    case 'welcome':
      return 'aero.boot.kicker.welcome';
    case 'reveal':
      return 'aero.boot.kicker.reveal';
    case 'sleeping':
      return 'aero.boot.kicker.sleeping';
    case 'waking':
      return 'aero.boot.kicker.waking';
    case 'shutting-down':
      return 'aero.boot.kicker.shuttingDown';
    case 'safe-fallback':
      return 'aero.boot.kicker.safeFallback';
    default:
      return 'aero.boot.kicker.default';
  }
}

function primaryControlKey(phase: SecretLifecyclePhase): string {
  if (phase === 'welcome') return 'aero.boot.enterDesktop';
  if (phase === 'waking') return 'aero.boot.restoreNow';
  return 'aero.boot.skip';
}

export default function AeroBootOverlay() {
  const { t, lang } = useT();
  const [lifecycle, setLifecycle] = useState(getSecretLifecycleState);

  useEffect(() => subscribeSecretLifecycle(setLifecycle), []);

  // Skip the remainder of the sequence on any interaction.
  useEffect(() => {
    if (HIDDEN.has(lifecycle.phase) || !lifecycle.canSkip) return;
    const skip = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-aero-boot-control]')) return;
      skipSecretLifecycle();
    };
    window.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip);
    return () => {
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
    };
  }, [lifecycle.canSkip, lifecycle.phase]);

  useEffect(() => {
    if (lifecycle.phase !== 'sleeping') return;
    const wake = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-aero-boot-control]')) return;
      requestSecretLifecycleWake();
    };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    return () => {
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
  }, [lifecycle.phase]);

  if (HIDDEN.has(lifecycle.phase)) return null;

  const phase = lifecycle.phase;
  const exiting = phase === 'reveal' || phase === 'waking';
  const isSystemClose = phase === 'shutting-down' || phase === 'sleeping';
  const showBootSteps = BOOT_ORDER.includes(phase);
  const now = new Date().toLocaleTimeString(LANG_TAGS[lang], { hour: '2-digit', minute: '2-digit' });
  const date = new Date().toLocaleDateString(LANG_TAGS[lang], { weekday: 'short', month: 'short', day: 'numeric' });
  const classes = [
    'os-aero-boot',
    `phase-${phase}`,
    exiting ? 'out' : '',
    phase === 'welcome' ? 'welcome' : '',
    lifecycle.reducedMotion ? 'reduced' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      role="status"
      aria-live="polite"
      aria-label={t(lifecycle.messageKey)}
    >
      <div className="os-aero-boot-scene" aria-hidden="true">
        <div className="os-aero-boot-sky" />
        <div className="os-aero-boot-clouds" />
        <div className="os-aero-boot-horizon" />
        <div className="os-aero-boot-water" />
        <div className="os-aero-boot-shore" />
      </div>
      <div className="os-aero-boot-aurora" aria-hidden="true" />
      {phase === 'reveal' && <div className="os-aero-boot-bloom" aria-hidden="true" />}
      <div className="os-aero-boot-inner">
        <div className="os-aero-boot-emblem" aria-hidden="true">
          <div className="os-aero-boot-rings">
            <span />
            <span />
            <span />
          </div>
          <div className="os-aero-boot-orb">
            <AeroBootGlobe reducedMotion={lifecycle.reducedMotion} />
          </div>
          <div className="os-aero-boot-webmark">{t('aero.boot.webmark')}</div>
          <div className="os-aero-boot-bubbles">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="os-aero-boot-kicker">{t(phaseKickerKey(phase))}</div>
        <div className="os-aero-boot-title">{t('aero.boot.title')}</div>
        <div className="os-aero-boot-edition">{t('aero.boot.edition')}</div>
        <div className="os-aero-boot-sub">{t(phaseSubKey(phase))}</div>
        {showBootSteps && !isSystemClose && (
          /* Vista-style boot strip: three glossy green segments gliding through
             a dark trough. Indeterminate on purpose — the phases are not equal
             lengths, so a filling bar would lie about progress. */
          <div className="os-aero-boot-progress" aria-hidden="true">
            <span className="os-aero-boot-progress-run">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
        {phase === 'welcome' && (
          <div className="os-aero-boot-welcome os-aero-boot-welcome-panel">
            <div>
              <span>{t('aero.boot.profileLabel')}</span>
              <strong>{t('aero.boot.profileValue')}</strong>
            </div>
            <div>
              <span>{date}</span>
              <strong>{now}</strong>
            </div>
            <div>
              <span>{t('aero.boot.motionLabel')}</span>
              <strong>{lifecycle.reducedMotion ? t('aero.boot.motionReducedShort') : t('aero.boot.motionFull')}</strong>
            </div>
            <div>
              <span>{t('aero.boot.soundLabel')}</span>
              <strong>{lifecycle.muted ? t('aero.boot.soundMuted') : t('aero.boot.soundOn')}</strong>
            </div>
          </div>
        )}
        {phase === 'sleeping' && (
          <div className="os-aero-boot-sleep-card">
            <span className="os-aero-boot-sleep-line" aria-hidden />
            <strong>{t('aero.boot.sleepTitle')}</strong>
            <span>{t('aero.boot.sleepBody')}</span>
          </div>
        )}
        {phase === 'waking' && (
          <div className="os-aero-boot-welcome os-aero-boot-resume-panel">
            <span>{t('aero.boot.resumeLabel')}</span>
            <strong>{now}</strong>
          </div>
        )}
        {phase === 'shutting-down' && (
          <div className="os-aero-boot-sleep-card">
            <span className="os-aero-boot-sleep-line" aria-hidden />
            <strong>{t('aero.boot.shutdownTitle')}</strong>
            <span>{t('aero.boot.shutdownBody')}</span>
          </div>
        )}
        {phase === 'safe-fallback' && (
          <div className="os-aero-boot-welcome">
            <span>{t('aero.boot.fallbackLabel')}</span>
            <strong>{t('aero.boot.fallbackValue')}</strong>
          </div>
        )}
        <div className="os-aero-boot-controls">
          {phase === 'sleeping' ? (
            <button
              type="button"
              data-aero-boot-control=""
              onPointerDown={(e) => e.stopPropagation()}
              onClick={requestSecretLifecycleWake}
            >
              {t('aero.boot.wake')}
            </button>
          ) : (
            <button
              type="button"
              data-aero-boot-control=""
              disabled={!lifecycle.canSkip}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={skipSecretLifecycle}
            >
              {t(primaryControlKey(phase))}
            </button>
          )}
          <button
            type="button"
            data-aero-boot-control=""
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setSecretLifecycleMuted(!lifecycle.muted)}
          >
            {lifecycle.muted ? t('aero.boot.unmute') : t('aero.boot.mute')}
          </button>
          <button
            type="button"
            data-aero-boot-control=""
            disabled={lifecycle.reducedMotion}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={reduceSecretLifecycleMotion}
          >
            {lifecycle.reducedMotion ? t('aero.boot.motionReduced') : t('aero.boot.reduceMotion')}
          </button>
        </div>
      </div>
    </div>
  );
}
