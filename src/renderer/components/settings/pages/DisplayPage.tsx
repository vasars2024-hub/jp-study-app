import { useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import { ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN } from '../../../appZoom';
import {
  loadDisplayPrefs,
  onDisplayPrefsChanged,
  resetDisplayPrefs,
  saveDisplayPrefs,
  type AnimationLevelId,
  type ColorFilterId,
  type ContrastId,
  type DisplayPrefs,
  type FocusRingId,
  type LetterSpacingId,
  type PointerSizeId,
  type ScrollbarModeId,
  type TransparencyId,
} from '../../../displayPrefs';

function seg(active: boolean): string {
  return `btn small ${active ? 'primary' : ''}`;
}

export default function DisplayPage() {
  const { zoom, setZoomValue, bumpZoomBy, focusSettingId } = useSettings();
  const [d, setD] = useState<DisplayPrefs>(loadDisplayPrefs);

  useEffect(() => onDisplayPrefsChanged(setD), []);

  const patch = (p: Partial<DisplayPrefs>) => setD(saveDisplayPrefs(p));

  return (
    <>
      <SettingsCard
        id="zoom"
        title="App zoom"
        description="Scale the entire interface. Independent of base text size below."
        highlight={focusSettingId === 'zoom'}
      >
        <div className="os-zoom-row">
          <button type="button" className="btn small" onClick={() => bumpZoomBy(-0.1)} disabled={zoom <= ZOOM_MIN}>
            −
          </button>
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoomValue(Number(e.target.value))}
          />
          <button type="button" className="btn small" onClick={() => bumpZoomBy(0.1)} disabled={zoom >= ZOOM_MAX}>
            ＋
          </button>
          <span className="muted os-zoom-val">{Math.round(zoom * 100)}%</span>
        </div>
        <button
          type="button"
          className="btn small"
          disabled={Math.abs(zoom - ZOOM_DEFAULT) < 0.01}
          onClick={() => setZoomValue(ZOOM_DEFAULT)}
        >
          Reset zoom to 100%
        </button>
      </SettingsCard>

      <SettingsCard
        id="base-font"
        title="Base text size"
        description="Root font size before zoom. Useful if zoom makes icons too large but text is still small."
        highlight={focusSettingId === 'base-font'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">Size</span>
          <input
            type="range"
            min={12}
            max={20}
            step={1}
            value={d.baseFontPx}
            onChange={(e) => patch({ baseFontPx: Number(e.target.value) })}
          />
          <span className="muted">{d.baseFontPx}px</span>
        </div>
        <label className="os-toggle">
          <input type="checkbox" checked={d.boldText} onChange={(e) => patch({ boldText: e.target.checked })} />
          <span>Bold UI text</span>
        </label>
      </SettingsCard>

      <SettingsCard
        id="contrast"
        title="Contrast & spacing"
        description="Improve readability without changing theme colors."
        highlight={focusSettingId === 'contrast'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">Contrast</span>
          {([
            ['normal', 'Normal'],
            ['medium', 'Medium'],
            ['high', 'High'],
          ] as [ContrastId, string][]).map(([id, label]) => (
            <button key={id} type="button" className={seg(d.contrast === id)} onClick={() => patch({ contrast: id })}>
              {label}
            </button>
          ))}
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">Letter spacing</span>
          {([
            ['tight', 'Tight'],
            ['normal', 'Normal'],
            ['loose', 'Loose'],
          ] as [LetterSpacingId, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={seg(d.letterSpacing === id)}
              onClick={() => patch({ letterSpacing: id })}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={d.underlineLinks}
            onChange={(e) => patch({ underlineLinks: e.target.checked })}
          />
          <span>Underline links</span>
        </label>
      </SettingsCard>

      <SettingsCard
        id="night-light"
        title="Night light"
        description="Warm the screen for evening reading (CSS filter, not GPU night light)."
        highlight={focusSettingId === 'night-light'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">Warmth</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={d.nightLight}
            onChange={(e) => patch({ nightLight: Number(e.target.value) })}
          />
          <span className="muted">{Math.round(d.nightLight * 100)}%</span>
        </div>
      </SettingsCard>

      <SettingsCard
        id="brightness-sat"
        title="Brightness & saturation"
        description="Adjust overall screen look. Extreme values can hurt contrast."
        highlight={focusSettingId === 'brightness-sat'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">Brightness</span>
          <input
            type="range"
            min={0.65}
            max={1.2}
            step={0.01}
            value={d.brightness}
            onChange={(e) => patch({ brightness: Number(e.target.value) })}
          />
          <span className="muted">{Math.round(d.brightness * 100)}%</span>
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">Saturation</span>
          <input
            type="range"
            min={0}
            max={1.6}
            step={0.05}
            value={d.saturation}
            onChange={(e) => patch({ saturation: Number(e.target.value) })}
          />
          <span className="muted">{Math.round(d.saturation * 100)}%</span>
        </div>
        <button
          type="button"
          className="btn small"
          onClick={() => patch({ brightness: 1, saturation: 1, nightLight: 0, colorFilter: 'none' })}
        >
          Reset color filters
        </button>
      </SettingsCard>

      <SettingsCard
        id="color-filter"
        title="Color filter"
        description="Quick accessibility tints on top of your theme."
        highlight={focusSettingId === 'color-filter'}
      >
        <div className="os-viz-row" style={{ flexWrap: 'wrap' }}>
          {([
            ['none', 'None'],
            ['warm', 'Warm'],
            ['cool', 'Cool'],
            ['grayscale', 'Grayscale'],
            ['high-contrast', 'High contrast'],
          ] as [ColorFilterId, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={seg(d.colorFilter === id)}
              onClick={() => patch({ colorFilter: id })}
            >
              {label}
            </button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        id="transparency"
        title="Transparency effects"
        description="Frosted glass and backdrop blur. Off can improve performance and clarity."
        highlight={focusSettingId === 'transparency'}
      >
        <div className="os-viz-row">
          {([
            ['full', 'Full'],
            ['reduced', 'Reduced'],
            ['off', 'Off'],
          ] as [TransparencyId, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={seg(d.transparency === id)}
              onClick={() => patch({ transparency: id })}
            >
              {label}
            </button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        id="focus-ring"
        title="Focus indicator"
        description="Keyboard focus outline strength for accessibility."
        highlight={focusSettingId === 'focus-ring'}
      >
        <div className="os-viz-row">
          {([
            ['off', 'Off'],
            ['normal', 'Normal'],
            ['strong', 'Strong'],
          ] as [FocusRingId, string][]).map(([id, label]) => (
            <button key={id} type="button" className={seg(d.focusRing === id)} onClick={() => patch({ focusRing: id })}>
              {label}
            </button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        id="scrollbars"
        title="Scrollbars"
        description="How scrollbars appear. Theme accent still colors visible thumbs."
        highlight={focusSettingId === 'scrollbars'}
      >
        <div className="os-viz-row">
          {([
            ['auto', 'Auto-hide'],
            ['always', 'Always'],
            ['hidden', 'Hidden'],
          ] as [ScrollbarModeId, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={seg(d.scrollbarMode === id)}
              onClick={() => patch({ scrollbarMode: id })}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={d.smoothScroll}
            onChange={(e) => patch({ smoothScroll: e.target.checked })}
          />
          <span>Smooth scrolling</span>
        </label>
      </SettingsCard>

      <SettingsCard
        id="pointer"
        title="Pointer & targets"
        description="Larger click targets for touch and accessibility."
        highlight={focusSettingId === 'pointer'}
      >
        <div className="os-viz-row">
          {([
            ['normal', 'Normal'],
            ['large', 'Large'],
          ] as [PointerSizeId, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={seg(d.pointerSize === id)}
              onClick={() => patch({ pointerSize: id })}
            >
              {label}
            </button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        id="animation-level"
        title="Motion"
        description="How much UI motion and atmosphere animation to allow."
        highlight={focusSettingId === 'animation-level' || focusSettingId === 'reduce-motion'}
      >
        <div className="os-viz-row">
          {([
            ['full', 'Full'],
            ['reduced', 'Reduced'],
            ['none', 'None'],
          ] as [AnimationLevelId, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={seg(d.animationLevel === id)}
              onClick={() => patch({ animationLevel: id })}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={d.reduceFlashes}
            onChange={(e) => patch({ reduceFlashes: e.target.checked })}
          />
          <span>Reduce flashes & sparkles</span>
        </label>
        <p className="muted os-set-hint">
          Reduced/None also enables the legacy reduce-motion flag used by wallpapers and particles.
        </p>
      </SettingsCard>

      <SettingsCard
        id="display-reset"
        title="Reset display"
        description="Restore all display preferences on this page (does not change theme or accent)."
      >
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (window.confirm('Reset all display settings to defaults?')) {
              setD(resetDisplayPrefs());
              setZoomValue(ZOOM_DEFAULT);
            }
          }}
        >
          Reset display settings
        </button>
      </SettingsCard>
    </>
  );
}
