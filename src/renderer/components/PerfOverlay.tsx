/**
 * Developer performance HUD — toggle with Ctrl+Shift+F (or ?perf=1).
 * Shows FPS / heap / particle budget without re-rendering the desktop shell.
 */
import { useEffect, useState } from 'react';
import { onPerfSnapshot, perfSnapshot, type PerfSnapshot } from '../perf/perfHub';
import { registerCommandHandler } from '../keyboardShortcuts';

function wantDefaultOpen(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('perf') === '1') return true;
    if (localStorage.getItem('jp-perf-overlay') === '1') return true;
  } catch {
    /* ignore */
  }
  return false;
}

export default function PerfOverlay() {
  const [open, setOpen] = useState(wantDefaultOpen);
  const [s, setS] = useState<PerfSnapshot>(() => perfSnapshot());

  useEffect(() => {
    if (!open) return;
    return onPerfSnapshot(setS);
  }, [open]);

  useEffect(() => {
    // Poll lightly so numbers update even if particles are off
    if (!open) return;
    const id = window.setInterval(() => setS(perfSnapshot()), 500);
    return () => window.clearInterval(id);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        setOpen((o) => {
          const next = !o;
          try {
            localStorage.setItem('jp-perf-overlay', next ? '1' : '0');
          } catch {
            /* ignore */
          }
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    const unsub = registerCommandHandler('perf.toggleOverlay', () => {
      setOpen((o) => {
        const next = !o;
        try {
          localStorage.setItem('jp-perf-overlay', next ? '1' : '0');
        } catch {
          /* ignore */
        }
        return next;
      });
    });
    return () => {
      window.removeEventListener('keydown', onKey);
      unsub();
    };
  }, []);

  if (!open) return null;

  const fpsColor = s.fps >= 55 ? '#6dce8a' : s.fps >= 35 ? '#e0b84a' : '#ff6b7a';

  return (
    <div className="perf-overlay" aria-live="polite">
      <div className="perf-overlay-title">Performance</div>
      <div className="perf-overlay-row">
        <span>FPS</span>
        <strong style={{ color: fpsColor }}>{s.fps}</strong>
      </div>
      <div className="perf-overlay-row">
        <span>Frame</span>
        <strong>{s.frameMs} ms</strong>
      </div>
      <div className="perf-overlay-row">
        <span>Quality</span>
        <strong>{s.quality}</strong>
      </div>
      <div className="perf-overlay-row">
        <span>Particles</span>
        <strong>
          {s.particleCount} · {Math.round(s.particleBudget * 100)}%
        </strong>
      </div>
      <div className="perf-overlay-row">
        <span>Heap</span>
        <strong>{s.memMb != null ? `${s.memMb} MB` : '—'}</strong>
      </div>
      <div className="perf-overlay-row">
        <span>Interact</span>
        <strong>{s.interacting ? 'yes' : 'no'}</strong>
      </div>
      <p className="perf-overlay-hint">Ctrl+Shift+F hide · target 60 FPS</p>
    </div>
  );
}
