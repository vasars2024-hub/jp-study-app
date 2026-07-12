/**
 * AeroBootOverlay (Phase 2 · M15) — the Secret Mode "soft reboot". When the user
 * activates Frutiger Aero, a full-screen sky boot splash covers the screen while
 * the theme switches behind it, then fades to reveal the glass OS — so it feels
 * like booting into another operating system, not just recolouring.
 *
 * Self-contained: listens for `shell:softReboot`. Mounted by DesktopShell.
 * Honours reduced motion (shorter hold, spinner collapses via the global rule).
 */
import { useEffect, useRef, useState } from 'react';

const EVENT = 'shell:softReboot';

export default function AeroBootOverlay() {
  const [phase, setPhase] = useState<'hidden' | 'in' | 'out'>('hidden');
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const clear = () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
    const onReboot = () => {
      clear();
      setPhase('in');
      const reduce =
        document.documentElement.classList.contains('reduce-motion') ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const hold = reduce ? 350 : 1500;
      timers.current.push(window.setTimeout(() => setPhase('out'), hold));
      timers.current.push(window.setTimeout(() => setPhase('hidden'), hold + 500));
    };
    window.addEventListener(EVENT, onReboot);
    return () => {
      window.removeEventListener(EVENT, onReboot);
      clear();
    };
  }, []);

  if (phase === 'hidden') return null;

  return (
    <div
      className={`os-aero-boot${phase === 'out' ? ' out' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Starting Frutiger Aero"
    >
      <div className="os-aero-boot-inner">
        <div className="os-aero-boot-orb" aria-hidden="true" />
        <div className="os-aero-boot-title">Study OS</div>
        <div className="os-aero-boot-sub">Frutiger Aero</div>
        <div className="os-aero-boot-spinner" aria-hidden="true" />
      </div>
    </div>
  );
}
