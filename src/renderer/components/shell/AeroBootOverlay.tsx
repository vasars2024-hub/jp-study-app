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

function phaseSub(phase: SecretLifecyclePhase): string {
  switch (phase) {
    case 'preboot':
      return 'Checking desktop profile';
    case 'boot':
      return 'Forming coastline kernel';
    case 'welcome':
      return 'Desktop profile ready';
    case 'reveal':
      return 'Opening desktop';
    case 'sleeping':
      return 'Press any key or click to wake';
    case 'waking':
      return 'Restoring desktop light';
    case 'shutting-down':
      return 'Saving session and closing';
    case 'safe-fallback':
      return 'Safe fallback';
    default:
      return 'Frutiger Aero';
  }
}

function phaseKicker(phase: SecretLifecyclePhase): string {
  switch (phase) {
    case 'preboot':
      return 'Secret gate';
    case 'boot':
      return 'Aero edition';
    case 'welcome':
      return 'Welcome';
    case 'reveal':
      return 'Desktop reveal';
    case 'sleeping':
      return 'Quiet mode';
    case 'waking':
      return 'Restoring';
    case 'shutting-down':
      return 'Session close';
    case 'safe-fallback':
      return 'Fallback';
    default:
      return 'Secret OS';
  }
}

function bootStepState(phase: SecretLifecyclePhase, step: SecretLifecyclePhase): string {
  const phaseIndex = BOOT_ORDER.indexOf(phase);
  const stepIndex = BOOT_ORDER.indexOf(step);
  if (phaseIndex < 0 || stepIndex < 0) return '';
  if (stepIndex < phaseIndex) return 'done';
  if (stepIndex === phaseIndex) return 'active';
  return '';
}

function primaryControlLabel(phase: SecretLifecyclePhase): string {
  if (phase === 'welcome') return 'Enter desktop';
  if (phase === 'waking') return 'Restore now';
  return 'Skip';
}

export default function AeroBootOverlay() {
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
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
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
      aria-label={lifecycle.message}
    >
      <div className="os-aero-boot-scene" aria-hidden="true">
        <div className="os-aero-boot-sky" />
        <div className="os-aero-boot-clouds" />
        <div className="os-aero-boot-horizon" />
        <div className="os-aero-boot-water" />
        <div className="os-aero-boot-shore" />
      </div>
      <div className="os-aero-boot-aurora" aria-hidden="true" />
      <div className="os-aero-boot-inner">
        <div className="os-aero-boot-emblem" aria-hidden="true">
          <div className="os-aero-boot-rings">
            <span />
            <span />
            <span />
          </div>
          <div className="os-aero-boot-orb">
            <span className="os-aero-boot-leaf" />
          </div>
          <div className="os-aero-boot-bubbles">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="os-aero-boot-kicker">{phaseKicker(phase)}</div>
        <div className="os-aero-boot-title">Secret Study OS</div>
        <div className="os-aero-boot-edition">Aero Edition</div>
        <div className="os-aero-boot-sub">{phaseSub(phase)}</div>
        {showBootSteps && !isSystemClose && (
          <div className="os-aero-boot-steps" aria-hidden="true">
            {BOOT_ORDER.map((step) => (
              <span key={step} className={bootStepState(phase, step)} />
            ))}
          </div>
        )}
        {phase === 'welcome' && (
          <div className="os-aero-boot-welcome os-aero-boot-welcome-panel">
            <div>
              <span>Desktop profile</span>
              <strong>Personal study desktop</strong>
            </div>
            <div>
              <span>{date}</span>
              <strong>{now}</strong>
            </div>
            <div>
              <span>Motion</span>
              <strong>{lifecycle.reducedMotion ? 'Reduced' : 'Full'}</strong>
            </div>
            <div>
              <span>Sound</span>
              <strong>{lifecycle.muted ? 'Muted' : 'On'}</strong>
            </div>
          </div>
        )}
        {phase === 'sleeping' && (
          <div className="os-aero-boot-sleep-card">
            <span className="os-aero-boot-sleep-line" aria-hidden />
            <strong>Secret OS is asleep</strong>
            <span>Desktop animation, particles, and companions are paused.</span>
          </div>
        )}
        {phase === 'waking' && (
          <div className="os-aero-boot-welcome os-aero-boot-resume-panel">
            <span>Restoring session</span>
            <strong>{now}</strong>
          </div>
        )}
        {phase === 'shutting-down' && (
          <div className="os-aero-boot-sleep-card">
            <span className="os-aero-boot-sleep-line" aria-hidden />
            <strong>Closing Secret OS</strong>
            <span>Saving desktop state before returning to Study OS.</span>
          </div>
        )}
        {phase === 'safe-fallback' && (
          <div className="os-aero-boot-welcome">
            <span>Effects bypassed</span>
            <strong>Safe reveal</strong>
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
              Wake
            </button>
          ) : (
            <button
              type="button"
              data-aero-boot-control=""
              disabled={!lifecycle.canSkip}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={skipSecretLifecycle}
            >
              {primaryControlLabel(phase)}
            </button>
          )}
          <button
            type="button"
            data-aero-boot-control=""
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setSecretLifecycleMuted(!lifecycle.muted)}
          >
            {lifecycle.muted ? 'Unmute' : 'Mute'}
          </button>
          <button
            type="button"
            data-aero-boot-control=""
            disabled={lifecycle.reducedMotion}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={reduceSecretLifecycleMotion}
          >
            {lifecycle.reducedMotion ? 'Motion reduced' : 'Reduce motion'}
          </button>
        </div>
      </div>
    </div>
  );
}
