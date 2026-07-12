/**
 * Quick Settings (Phase 2 · M7) — a bottom-right glass flyout of the most-used
 * system toggles. Toggled by the taskbar button via `shell:toggleQuickSettings`.
 * Reuses the Phase 1 platform APIs directly (theme engine, perf tiers, sound
 * engine) — no duplicated logic. Deeper controls open the full Settings window
 * via `shell:openSettings` (handled by the shell in M3).
 */
import { useEffect, useState } from 'react';
import { Select, Slider, Toggle } from '../ui';
import { getTheme, listThemes, loadThemeId, onThemeChanged, setTheme } from '../../theme';
import { DEFAULT_PERF_TIER, loadPerfTier, PERF_TIERS, setPerfTier, type PerfTier } from '../../theme/perf';
import { soundEngine } from '../../audio/soundEngine';

const TOGGLE_EVENT = 'shell:toggleQuickSettings';

function isReduceMotion(): boolean {
  return document.documentElement.classList.contains('reduce-motion');
}
function setReduceMotion(on: boolean): void {
  document.documentElement.classList.toggle('reduce-motion', on);
  try {
    localStorage.setItem('jp-os-reduce-motion', on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

const PERF_LABEL: Record<PerfTier, string> = {
  performance: 'Performance',
  balanced: 'Balanced',
  atmosphere: 'Max Atmosphere',
  battery: 'Battery Saver',
};

function openSettings(page: string): void {
  window.dispatchEvent(new CustomEvent('shell:openSettings', { detail: { page } }));
}

export default function QuickSettings() {
  const [open, setOpen] = useState(false);
  const [themeId, setThemeId] = useState(() => loadThemeId());
  const [perf, setPerf] = useState<PerfTier>(() => loadPerfTier());
  const [volume, setVolume] = useState(() => soundEngine.getVolume());
  const [muted, setMuted] = useState(() => soundEngine.isMuted());
  const [reduceMotion, setRM] = useState(isReduceMotion);

  useEffect(() => onThemeChanged(setThemeId), []);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener(TOGGLE_EVENT, toggle);
    return () => window.removeEventListener(TOGGLE_EVENT, toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    // Re-sync from the live sources each time it opens.
    setThemeId(loadThemeId());
    setPerf(loadPerfTier());
    setVolume(soundEngine.getVolume());
    setMuted(soundEngine.isMuted());
    setRM(isReduceMotion());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  if (!open) return null;

  // Theme options (include the active theme even if it is hidden, e.g. Aero).
  const themes = listThemes();
  const options = themes.map((t) => ({ value: t.id, label: t.label }));
  if (!themes.some((t) => t.id === themeId)) {
    const t = getTheme(themeId);
    if (t) options.unshift({ value: t.id, label: t.label });
  }

  return (
    <>
      <div className="os-panel-backdrop" onMouseDown={() => setOpen(false)} />
      <aside className="os-flyout anim-slide-up" role="dialog" aria-label="Quick settings">
        <header className="os-flyout-head">
          <span className="os-flyout-title">Quick settings</span>
          <span className="os-flyout-spacer" />
          <button
            type="button"
            className="ui-btn ui-btn--sm ui-btn--ghost ui-focusable"
            onClick={() => {
              openSettings('home');
              setOpen(false);
            }}
          >
            All settings
          </button>
        </header>

        <div className="os-flyout-body">
          <div className="os-qs-section">Appearance</div>
          <div className="os-qs-row">
            <span className="os-qs-row-label">Theme</span>
            <Select
              value={themeId}
              options={options}
              onChange={(e) => {
                const id = e.currentTarget.value;
                setThemeId(id);
                setTheme(id);
              }}
              style={{ maxWidth: 190 }}
            />
          </div>
          <div className="os-qs-row">
            <span className="os-qs-row-label">Performance</span>
            <Select
              value={perf}
              options={PERF_TIERS.map((t) => ({ value: t, label: PERF_LABEL[t] }))}
              onChange={(e) => {
                const t = (e.currentTarget.value as PerfTier) || DEFAULT_PERF_TIER;
                setPerf(t);
                setPerfTier(t);
              }}
              style={{ maxWidth: 190 }}
            />
          </div>

          <div className="os-qs-section">Sound</div>
          <div className="os-qs-row">
            <span className="os-qs-row-label">Volume</span>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={volume}
              disabled={muted}
              onChange={(e) => {
                const v = Number(e.currentTarget.value);
                setVolume(v);
                soundEngine.setVolume(v);
              }}
              style={{ maxWidth: 150 }}
            />
          </div>
          <div className="os-qs-row">
            <Toggle
              checked={muted}
              onChange={(e) => {
                const m = e.currentTarget.checked;
                setMuted(m);
                soundEngine.setMuted(m);
              }}
              label="Mute"
            />
          </div>

          <div className="os-qs-section">Accessibility</div>
          <div className="os-qs-row">
            <Toggle
              checked={reduceMotion}
              onChange={(e) => {
                const on = e.currentTarget.checked;
                setRM(on);
                setReduceMotion(on);
              }}
              label="Reduce motion"
            />
          </div>

          <div className="os-qs-grid">
            <button type="button" className="os-qs-tile ui-focusable" onClick={() => { openSettings('wallpaper'); setOpen(false); }}>
              <span className="os-qs-tile-label">Wallpaper</span>
              <span className="os-qs-tile-value">Change background</span>
            </button>
            <button type="button" className="os-qs-tile ui-focusable" onClick={() => { openSettings('display'); setOpen(false); }}>
              <span className="os-qs-tile-label">Accessibility</span>
              <span className="os-qs-tile-value">Zoom, contrast, text</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
