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
 * Self-contained: listens for `shell:softReboot`. Mounted by DesktopShell.
 */
import { useEffect, useRef, useState } from 'react';

const EVENT = 'shell:softReboot';
const STARTUP_SOUND_EVENT = 'shell:startup';

export default function AeroBootOverlay() {
  const [phase, setPhase] = useState<'hidden' | 'in' | 'welcome' | 'out'>('hidden');
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const clear = () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
    const finish = () => {
      clear();
      setPhase('out');
      timers.current.push(window.setTimeout(() => setPhase('hidden'), 500));
    };
    const onReboot = () => {
      clear();
      setPhase('in');
      const reduce =
        document.documentElement.classList.contains('reduce-motion') ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Startup sound fires as the emblem settles (routed through soundEngine;
      // the soft-reboot itself was a user gesture, so audio may start).
      const soundAt = reduce ? 120 : 500;
      timers.current.push(
        window.setTimeout(() => window.dispatchEvent(new CustomEvent(STARTUP_SOUND_EVENT)), soundAt),
      );
      // Welcome state, then resolve to the desktop.
      const welcomeAt = reduce ? 220 : 850;
      const hold = reduce ? 350 : 1600;
      timers.current.push(window.setTimeout(() => setPhase('welcome'), welcomeAt));
      timers.current.push(window.setTimeout(finish, hold));
    };
    window.addEventListener(EVENT, onReboot);
    return () => {
      window.removeEventListener(EVENT, onReboot);
      clear();
    };
  }, []);

  // Skip the remainder of the sequence on any interaction.
  useEffect(() => {
    if (phase === 'hidden' || phase === 'out') return;
    const skip = () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
      setPhase('out');
      timers.current.push(window.setTimeout(() => setPhase('hidden'), 500));
    };
    window.addEventListener('pointerdown', skip, true);
    window.addEventListener('keydown', skip, true);
    return () => {
      window.removeEventListener('pointerdown', skip, true);
      window.removeEventListener('keydown', skip, true);
    };
  }, [phase]);

  if (phase === 'hidden') return null;

  return (
    <div
      className={`os-aero-boot${phase === 'out' ? ' out' : ''}${phase === 'welcome' ? ' welcome' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={phase === 'welcome' ? 'Welcome to Frutiger Aero' : 'Starting Frutiger Aero'}
    >
      <div className="os-aero-boot-aurora" aria-hidden="true" />
      <div className="os-aero-boot-inner">
        <div className="os-aero-boot-orb" aria-hidden="true" />
        <div className="os-aero-boot-title">Study OS</div>
        <div className="os-aero-boot-sub">{phase === 'welcome' ? 'Welcome' : 'Frutiger Aero'}</div>
        <div className="os-aero-boot-spinner" aria-hidden="true" />
      </div>
    </div>
  );
}
