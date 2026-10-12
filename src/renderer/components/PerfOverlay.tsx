/**
 * Developer performance HUD — toggle with the `perf.toggleOverlay` command
 * (Ctrl+Alt+F by default; rebindable) or ?perf=1.
 * Shows FPS / heap / particle budget without re-rendering the desktop shell.
 */
import { useEffect, useState } from 'react';
import { onPerfSnapshot, perfSnapshot, type PerfSnapshot } from '../perf/perfHub';
import { registerCommandHandler } from '../keyboardShortcuts';
import { useT } from '../i18n';
import { keysOrUnset } from '../shortcutHints';

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
  const { t } = useT();
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
    // kbd5: this used to listen for a hard-coded Ctrl+Shift+F as well, which is
    // the reader's "save selection as flashcard" — one keypress did both. The
    // rebindable `perf.toggleOverlay` command is the only route now.
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
      unsub();
    };
  }, []);

  if (!open) return null;

  const fpsColor = s.fps >= 55 ? '#6dce8a' : s.fps >= 35 ? '#e0b84a' : '#ff6b7a';

  return (
    <div className="perf-overlay" aria-live="polite">
      <div className="perf-overlay-title">{t('perf.label.title')}</div>
      <div className="perf-overlay-row">
        <span>FPS</span>
        <strong style={{ color: fpsColor }}>{s.fps}</strong>
      </div>
      <div className="perf-overlay-row">
        <span>{t('perf.label.frame')}</span>
        <strong>{s.frameMs} ms</strong>
      </div>
      <div className="perf-overlay-row">
        <span>{t('perf.label.quality')}</span>
        <strong>{s.quality}</strong>
      </div>
      <div className="perf-overlay-row">
        <span>{t('perf.label.particles')}</span>
        <strong>
          {s.particleCount} · {Math.round(s.particleBudget * 100)}%
        </strong>
      </div>
      <div className="perf-overlay-row">
        <span>{t('perf.label.heap')}</span>
        <strong>{s.memMb != null ? `${s.memMb} MB` : '—'}</strong>
      </div>
      <div className="perf-overlay-row">
        <span>{t('perf.label.interact')}</span>
        <strong>{s.interacting ? t('perf.label.yes') : t('perf.label.no')}</strong>
      </div>
      <p className="perf-overlay-hint">{t('perf.hint', { keys: keysOrUnset('perf.toggleOverlay') })}</p>
    </div>
  );
}
