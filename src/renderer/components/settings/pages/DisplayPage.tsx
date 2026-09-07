import { useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import MonitorsPage from './MonitorsPage';
import { confirmDialog } from '../../ui';
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

import { useT } from '../../../i18n';
import type { WindowChromeMode } from '../../../windowChrome';

function seg(active: boolean): string {
  return `btn small ${active ? 'primary' : ''}`;
}

export default function DisplayPage() {
  const { t } = useT();
  const { zoom, setZoomValue, bumpZoomBy, focusSettingId } = useSettings();
  const [d, setD] = useState<DisplayPrefs>(loadDisplayPrefs);

  useEffect(() => onDisplayPrefsChanged(setD), []);

  const patch = (p: Partial<DisplayPrefs>) => setD(saveDisplayPrefs(p));

  const chromeOptions: { id: WindowChromeMode; labelKey: string }[] = [
    { id: 'standard', labelKey: 'settings.display.chrome.standard' },
    { id: 'borderless', labelKey: 'settings.display.chrome.borderless' },
    { id: 'frameless', labelKey: 'settings.display.chrome.frameless' },
  ];

  return (
    <>
      {/*
       * v1.0 audit 5.2 — Monitors and Display were two System pages with
       * near-identical names, separated in the rail by File drops and API keys,
       * so neither name told you which one held what you wanted. They are one
       * page now, ordered the way Windows' own System > Display orders it:
       * the physical screens first, then how this app renders onto them.
       *
       * MonitorsPage stays its own module and is composed here rather than
       * inlined — `settingsSearchReachability` derives a page's reachable cards
       * by following DisplayPage's local imports, so this import is what keeps
       * the four `monitors-*` registry entries routable.
       */}
      <MonitorsPage />

      <SettingsCard
        id="window-chrome"
        title={t('settings.display.chrome.title')}
        description={t('settings.display.chrome.desc')}
        highlight={focusSettingId === 'window-chrome' || focusSettingId === 'borderless'}
      >
        <div className="os-viz-row" style={{ flexWrap: 'wrap' }}>
          {chromeOptions.map(({ id, labelKey }) => (
            <button
              key={id}
              type="button"
              className={seg(d.windowChromeMode === id)}
              onClick={() => patch({ windowChromeMode: id })}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <p className="muted os-set-hint">{t('settings.display.chrome.hint')}</p>
        {d.windowChromeMode === 'frameless' && (
          <p className="muted os-set-hint">{t('settings.display.chrome.framelessHint')}</p>
        )}
      </SettingsCard>

      <SettingsCard
        id="zoom"
        title={t('search.zoom')}
        description={t('search.zoom.desc')}
        highlight={focusSettingId === 'zoom'}
      >
        <div className="os-zoom-row">
          <button
            type="button"
            className="btn small"
            aria-label={t('settings.a11y.zoom.decrease')}
            onClick={() => bumpZoomBy(-0.1)}
            disabled={zoom <= ZOOM_MIN}
          >
            −
          </button>
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoomValue(Number(e.target.value))}
            aria-label={t('settings.a11y.zoom.aria')}
          />
          <button
            type="button"
            className="btn small"
            aria-label={t('settings.a11y.zoom.increase')}
            onClick={() => bumpZoomBy(0.1)}
            disabled={zoom >= ZOOM_MAX}
          >
            +
          </button>
          <span className="muted os-zoom-val">{Math.round(zoom * 100)}%</span>
        </div>
        <button
          type="button"
          className="btn small"
          disabled={Math.abs(zoom - ZOOM_DEFAULT) < 0.01}
          onClick={() => setZoomValue(ZOOM_DEFAULT)}
        >
          {t('settings.display.zoom.reset')}
        </button>
      </SettingsCard>

      <SettingsCard
        id="base-font"
        title={t('search.baseFont')}
        description={t('search.baseFont.desc')}
        highlight={focusSettingId === 'base-font'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.display.label.size')}</span>
          <input
            type="range"
            min={12}
            max={20}
            step={1}
            value={d.baseFontPx}
            onChange={(e) => patch({ baseFontPx: Number(e.target.value) })}
            aria-label={t('a11y.slider.baseFontSize')}
          />
          <span className="muted">{d.baseFontPx}px</span>
        </div>
        <label className="os-toggle">
          <input type="checkbox" checked={d.boldText} onChange={(e) => patch({ boldText: e.target.checked })} />
          <span>{t('settings.display.boldText')}</span>
        </label>
      </SettingsCard>

      <SettingsCard
        id="contrast"
        title={t('search.contrast')}
        description={t('search.contrast.desc')}
        highlight={focusSettingId === 'contrast'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.display.label.contrast')}</span>
          {(
            [
              ['normal', 'settings.display.contrast.normal'],
              ['medium', 'settings.display.contrast.medium'],
              ['high', 'settings.display.contrast.high'],
            ] as [ContrastId, string][]
          ).map(([id, labelKey]) => (
            <button key={id} type="button" className={seg(d.contrast === id)} onClick={() => patch({ contrast: id })}>
              {t(labelKey)}
            </button>
          ))}
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.display.label.letterSpacing')}</span>
          {(
            [
              ['tight', 'settings.display.spacing.tight'],
              ['normal', 'settings.display.spacing.normal'],
              ['loose', 'settings.display.spacing.loose'],
            ] as [LetterSpacingId, string][]
          ).map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              className={seg(d.letterSpacing === id)}
              onClick={() => patch({ letterSpacing: id })}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={d.underlineLinks}
            onChange={(e) => patch({ underlineLinks: e.target.checked })}
          />
          <span>{t('settings.display.underlineLinks')}</span>
        </label>
      </SettingsCard>

      <SettingsCard
        id="night-light"
        title={t('search.nightLight')}
        description={t('search.nightLight.desc')}
        highlight={focusSettingId === 'night-light'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.display.label.warmth')}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={d.nightLight}
            onChange={(e) => patch({ nightLight: Number(e.target.value) })}
            aria-label={t('a11y.slider.nightLightWarmth')}
          />
          <span className="muted">{Math.round(d.nightLight * 100)}%</span>
        </div>
      </SettingsCard>

      <SettingsCard
        id="brightness-sat"
        title={t('search.brightnessSat')}
        description={t('search.brightnessSat.desc')}
        highlight={focusSettingId === 'brightness-sat'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.display.label.brightness')}</span>
          <input
            type="range"
            min={0.65}
            max={1.2}
            step={0.01}
            value={d.brightness}
            onChange={(e) => patch({ brightness: Number(e.target.value) })}
            aria-label={t('settings.display.label.brightness')}
          />
          <span className="muted">{Math.round(d.brightness * 100)}%</span>
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.display.label.saturation')}</span>
          <input
            type="range"
            min={0}
            max={1.6}
            step={0.05}
            value={d.saturation}
            onChange={(e) => patch({ saturation: Number(e.target.value) })}
            aria-label={t('settings.display.label.saturation')}
          />
          <span className="muted">{Math.round(d.saturation * 100)}%</span>
        </div>
        <button
          type="button"
          className="btn small"
          onClick={() => patch({ brightness: 1, saturation: 1, nightLight: 0, colorFilter: 'none' })}
        >
          {t('settings.display.resetFilters')}
        </button>
      </SettingsCard>

      <SettingsCard
        id="color-filter"
        title={t('search.colorFilter')}
        description={t('search.colorFilter.desc')}
        highlight={focusSettingId === 'color-filter'}
      >
        <div className="os-viz-row" style={{ flexWrap: 'wrap' }}>
          {(
            [
              ['none', 'settings.display.filter.none'],
              ['warm', 'settings.display.filter.warm'],
              ['cool', 'settings.display.filter.cool'],
              ['grayscale', 'settings.display.filter.grayscale'],
              ['high-contrast', 'settings.display.filter.highContrast'],
            ] as [ColorFilterId, string][]
          ).map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              className={seg(d.colorFilter === id)}
              onClick={() => patch({ colorFilter: id })}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        id="transparency"
        title={t('search.transparency')}
        description={t('search.transparency.desc')}
        highlight={focusSettingId === 'transparency'}
      >
        <div className="os-viz-row">
          {(
            [
              ['full', 'settings.display.transparency.full'],
              ['reduced', 'settings.display.transparency.reduced'],
              ['off', 'settings.display.transparency.off'],
            ] as [TransparencyId, string][]
          ).map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              className={seg(d.transparency === id)}
              onClick={() => patch({ transparency: id })}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        id="focus-ring"
        title={t('search.focusRing')}
        description={t('search.focusRing.desc')}
        highlight={focusSettingId === 'focus-ring'}
      >
        <div className="os-viz-row">
          {(
            [
              ['off', 'settings.display.focus.off'],
              ['normal', 'settings.display.focus.normal'],
              ['strong', 'settings.display.focus.strong'],
            ] as [FocusRingId, string][]
          ).map(([id, labelKey]) => (
            <button key={id} type="button" className={seg(d.focusRing === id)} onClick={() => patch({ focusRing: id })}>
              {t(labelKey)}
            </button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        id="scrollbars"
        title={t('search.scrollbars')}
        description={t('search.scrollbars.desc')}
        highlight={focusSettingId === 'scrollbars'}
      >
        <div className="os-viz-row">
          {(
            [
              ['auto', 'settings.display.scrollbar.auto'],
              ['always', 'settings.display.scrollbar.always'],
              ['hidden', 'settings.display.scrollbar.hidden'],
            ] as [ScrollbarModeId, string][]
          ).map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              className={seg(d.scrollbarMode === id)}
              onClick={() => patch({ scrollbarMode: id })}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={d.smoothScroll}
            onChange={(e) => patch({ smoothScroll: e.target.checked })}
          />
          <span>{t('settings.display.smoothScroll')}</span>
        </label>
      </SettingsCard>

      <SettingsCard
        id="pointer"
        title={t('search.pointer')}
        description={t('search.pointer.desc')}
        highlight={focusSettingId === 'pointer'}
      >
        <div className="os-viz-row">
          {(
            [
              ['normal', 'settings.display.pointer.normal'],
              ['large', 'settings.display.pointer.large'],
            ] as [PointerSizeId, string][]
          ).map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              className={seg(d.pointerSize === id)}
              onClick={() => patch({ pointerSize: id })}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        id="animation-level"
        title={t('search.animationLevel')}
        description={t('search.animationLevel.desc')}
        highlight={focusSettingId === 'animation-level' || focusSettingId === 'reduce-motion'}
      >
        <div className="os-viz-row">
          {(
            [
              ['full', 'settings.display.motion.full'],
              ['reduced', 'settings.display.motion.reduced'],
              ['none', 'settings.display.motion.none'],
            ] as [AnimationLevelId, string][]
          ).map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              className={seg(d.animationLevel === id)}
              onClick={() => patch({ animationLevel: id })}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={d.reduceFlashes}
            onChange={(e) => patch({ reduceFlashes: e.target.checked })}
          />
          <span>{t('settings.display.reduceFlashes')}</span>
        </label>
        <p className="muted os-set-hint">{t('settings.display.motionHint')}</p>
      </SettingsCard>

      <SettingsCard
        id="display-reset"
        title={t('settings.display.reset.title')}
        description={t('settings.display.reset.desc')}
      >
        <button
          type="button"
          className="btn"
          onClick={async () => {
            const ok = await confirmDialog({
              title: t('settings.display.reset.dialogTitle'),
              message: t('settings.display.reset.dialogMessage'),
              confirmLabel: t('common.reset'),
              danger: true,
            });
            if (ok) {
              setD(resetDisplayPrefs());
              setZoomValue(ZOOM_DEFAULT);
            }
          }}
        >
          {t('settings.display.reset.button')}
        </button>
      </SettingsCard>
    </>
  );
}
