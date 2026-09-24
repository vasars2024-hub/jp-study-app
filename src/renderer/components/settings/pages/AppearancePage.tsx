import SettingsCard from '../SettingsCard';
import ThemeStudioPanel from './ThemeStudioPanel';
import { confirmDialog } from '../../ui';
import { useSettings } from '../SettingsContext';
import { THEMES } from '../../../theme';
import {
  ACCENT_PRESETS,
  resetLook,
  type ChromeMaterialId,
  type DensityId,
  type FontFamilyId,
  type RadiusId,
  type ShadowStrengthId,
} from '../../../osPersonalization';
import { clearCustomCss, saveCustomCss } from '../../../customCss';
import CssPlayground from '../CssPlayground';
import AppearancePreviewCard from '../AppearancePreviewCard';
import { loadBlancMode, onBlancModeChanged, setBlancModeEnabled, type BlancModeSettings } from '../../../blancMode';
import { setUiLang, useT } from '../../../i18n';
import { LANG_LABELS, LANG_TAGS, UI_LANGS } from '../../../../shared/i18n/core';
import { loadAppBorderSettings, saveAppBorderSettings, onAppBorderSettingsChanged, type AppBorderStyle } from '../../../appBorderSettings';
import { loadPillarboxSettings, savePillarboxSettings, onPillarboxSettingsChanged, type PillarboxStyle } from '../../../pillarboxSettings';
import { exitSecretAero } from '../../../theme/SecretAeroTrigger';
import { AERO_THEME_ID } from '../../../theme/frutiger-aero';
import { WIRED_ARCHIVE_THEME_ID } from '../../../theme/wired-archive';
import { requestWiredArchiveShutdown } from '../../../wiredArchiveLifecycle';
import { useEffect, useMemo, useState } from 'react';

const BORDER_STYLE_KEY: Record<AppBorderStyle, string> = {
  'aero-glass': 'settings.appearance.border.aeroGlass',
  'blurred-wall': 'settings.appearance.border.blurredWall',
  'solid-accent': 'settings.appearance.border.solidAccent',
  'retro-xp': 'settings.appearance.border.retroXp',
  minimal: 'settings.appearance.border.minimal',
  'glass-dark': 'settings.appearance.border.glassDark',
};

const PILLARBOX_STYLE_KEY: Record<PillarboxStyle, string> = {
  'default-gradient': 'settings.appearance.pillarbox.defaultGradient',
  'blurred-wallpaper': 'settings.appearance.pillarbox.blurredWallpaper',
  'solid-color': 'settings.appearance.pillarbox.solidColor',
  'dark-mode': 'settings.appearance.pillarbox.darkMode',
};

export default function AppearancePage() {
  const s = useSettings();
  const { look, patchLook, theme, chooseTheme, seg, userCss, setUserCss, cssMsg, setCssMsg, focusSettingId } = s;
  const { t, lang } = useT();

  const [borderSettings, setBorderSettings] = useState(() => loadAppBorderSettings());
  const [pillarboxSettings, setPillarboxSettings] = useState(() => loadPillarboxSettings());
  const [blancMode, setBlancMode] = useState<BlancModeSettings>(() => loadBlancMode());
  const [blancMsg, setBlancMsg] = useState('');

  useEffect(() => {
    const unsub = onAppBorderSettingsChanged(setBorderSettings);
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onPillarboxSettingsChanged(setPillarboxSettings);
    return unsub;
  }, []);

  useEffect(() => onBlancModeChanged(setBlancMode), []);

  const borderStyleOptions = useMemo(
    () =>
      (Object.keys(BORDER_STYLE_KEY) as AppBorderStyle[]).map((id) => ({
        id,
        label: t(BORDER_STYLE_KEY[id]),
      })),
    [lang],
  );

  const pillarboxStyleOptions = useMemo(
    () =>
      (Object.keys(PILLARBOX_STYLE_KEY) as PillarboxStyle[]).map((id) => ({
        id,
        label: t(PILLARBOX_STYLE_KEY[id]),
      })),
    [lang],
  );

  /**
   * v1.0 audit §2.1 — App borders and Pillarbox are shown only while Aero is the
   * ACTIVE theme, not merely once it has ever been unlocked.
   *
   * Both cards are inert outside Aero and always were: every `[data-app-border]`
   * and `[data-pillarbox]` rule in `theme/aero-shell.css` is prefixed
   * `:root[data-materials='aero']`, so on any other theme the controls write
   * localStorage, stamp an attribute, and change nothing on screen.
   *
   * `theme === AERO_THEME_ID` is exactly the condition the stylesheets test:
   * `theme/engine.ts:128` stamps `data-materials` from the active theme's
   * `materialSet`, and `materialSet: 'aero'` is declared by one theme only
   * (`theme/frutiger-aero.ts:24`). Reading the context's `theme` rather than the
   * DOM attribute also keeps this reactive — it re-renders on a theme switch.
   */
  const aeroActive = theme === AERO_THEME_ID;

  const [playgroundOpen, setPlaygroundOpen] = useState(false);

  const themeLabel = (id: string, fallback: string) => {
    const key = `settings.appearance.theme.${id}`;
    const out = t(key);
    return out === key ? fallback : out;
  };

  const accentLabel = (id: string, fallback: string) => {
    const key = `settings.appearance.accent.${id}`;
    const out = t(key);
    return out === key ? fallback : out;
  };

  return (
    <>
      {/* v1.0 audit §2.4. Sits above the live controls deliberately: the point of a
          draft is to be reached before you start changing the real thing. */}
      <AppearancePreviewCard
        look={look}
        theme={theme}
        seg={seg}
        highlight={focusSettingId === 'appearance-preview'}
        onApply={(draft, themeId) => {
          patchLook(draft);
          if (themeId !== theme) chooseTheme(themeId);
        }}
      />

      <SettingsCard
        id="ui-language"
        title={t('settings.language.title')}
        description={t('settings.language.desc')}
        highlight={focusSettingId === 'ui-language'}
      >
        <div className="sp-seg" role="group" aria-label={t('settings.language.title')}>
          {UI_LANGS.map((id) => (
            <button
              key={id}
              type="button"
              lang={LANG_TAGS[id]}
              className={`sp-seg-btn ${lang === id ? 'active' : ''}`}
              aria-pressed={lang === id}
              onClick={() => setUiLang(id)}
            >
              {LANG_LABELS[id]}
            </button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        id="blanc-mode"
        title={t('special.blancMode')}
        description={t('settings.appearance.blanc.description')}
        highlight={focusSettingId === 'blanc-mode'}
      >
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={blancMode.enabled}
            onChange={(e) => {
              const next = e.target.checked;
              setBlancMsg(t(next ? 'settings.appearance.blanc.opening' : 'settings.appearance.blanc.closing'));
              void setBlancModeEnabled(next)
                .then(setBlancMode)
                .catch((error) => {
                  setBlancMsg(error instanceof Error ? error.message : t('settings.appearance.blanc.openError'));
                });
            }}
          />
          <span>{t('special.useBlancMode')}</span>
        </label>
        <p className="muted os-set-hint">{t('settings.appearance.blanc.hint')}</p>
        {blancMsg && <p className="muted os-set-hint">{blancMsg}</p>}
      </SettingsCard>

      <SettingsCard
        id="theme"
        title={t('search.theme')}
        description={t('search.theme.desc')}
        highlight={focusSettingId === 'theme'}
      >
        {(theme === AERO_THEME_ID || theme === WIRED_ARCHIVE_THEME_ID) && (
          <div className="os-viz-row" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <span className="os-viz-label muted">
              {theme === AERO_THEME_ID ? t('special.leave.activeAero') : t('special.leave.activeWired')}
            </span>
            <button
              type="button"
              className="btn small"
              onClick={() => {
                if (theme === AERO_THEME_ID) exitSecretAero();
                else requestWiredArchiveShutdown();
              }}
            >
              {theme === AERO_THEME_ID ? t('special.leave.aero') : t('special.leave.wired')}
            </button>
          </div>
        )}
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={look.autoTheme}
            onChange={(e) => patchLook({ autoTheme: e.target.checked })}
          />
          <span>{t('settings.appearance.autoTheme')}</span>
        </label>
        <div className="os-theme-grid">
          {THEMES.map((th) => (
            <button
              key={th.id}
              type="button"
              className={`os-theme-swatch ${!look.autoTheme && theme === th.id ? 'active' : ''}`}
              onClick={() => chooseTheme(th.id)}
              title={themeLabel(th.id, th.label)}
              disabled={look.autoTheme}
            >
              <span
                className="os-theme-swatch-preview"
                style={{ background: th.swatch.bg, borderColor: th.swatch.border }}
              >
                <span style={{ color: th.swatch.text }}>Aa</span>
              </span>
              <span className="os-theme-swatch-label">{themeLabel(th.id, th.label)}</span>
            </button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        id="accent"
        title={t('search.accent')}
        description={t('search.accent.desc')}
        highlight={focusSettingId === 'accent'}
      >
        <div className="os-accent-row">
          {ACCENT_PRESETS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`os-accent ${look.accentMode === 'preset' && look.accentPreset === a.id ? 'active' : ''}`}
              style={{ background: a.accent }}
              title={accentLabel(a.id, a.label)}
              onClick={() => patchLook({ accentMode: 'preset', accentPreset: a.id })}
            />
          ))}
        </div>
        <div className="os-viz-row" style={{ marginTop: 10 }}>
          <span className="os-viz-label muted">{t('settings.appearance.accent.custom')}</span>
          <input
            type="color"
            value={look.customAccent}
            onChange={(e) => patchLook({ accentMode: 'custom', customAccent: e.target.value })}
            title={t('settings.appearance.accent.customTitle')}
          />
          <button type="button" {...seg(look.accentMode === 'custom')} onClick={() => patchLook({ accentMode: 'custom' })}>
            {t('settings.appearance.accent.useCustom')}
          </button>
        </div>
      </SettingsCard>

      <SettingsCard
        id="typography"
        title={t('search.typography')}
        description={t('search.typography.desc')}
        highlight={focusSettingId === 'typography'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.appearance.label.font')}</span>
          {([
            ['segoe', 'settings.appearance.font.segoe'],
            ['system', 'settings.appearance.font.system'],
            ['jp-first', 'settings.appearance.font.jpFirst'],
          ] as [FontFamilyId, string][]).map(([id, labelKey]) => (
            <button key={id} type="button" {...seg(look.fontFamily === id)} onClick={() => patchLook({ fontFamily: id })}>
              {t(labelKey)}
            </button>
          ))}
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.appearance.label.density')}</span>
          {([
            ['compact', 'settings.appearance.density.compact'],
            ['comfortable', 'settings.appearance.density.comfortable'],
            ['spacious', 'settings.appearance.density.spacious'],
          ] as [DensityId, string][]).map(([id, labelKey]) => (
            <button key={id} type="button" {...seg(look.density === id)} onClick={() => patchLook({ density: id })}>
              {t(labelKey)}
            </button>
          ))}
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.appearance.label.corners')}</span>
          {([
            ['sharp', 'settings.appearance.corners.sharp'],
            ['soft', 'settings.appearance.corners.soft'],
            ['round', 'settings.appearance.corners.round'],
          ] as [RadiusId, string][]).map(([id, labelKey]) => (
            <button key={id} type="button" {...seg(look.radius === id)} onClick={() => patchLook({ radius: id })}>
              {t(labelKey)}
            </button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        id="materials"
        title={t('search.materials')}
        description={t('search.materials.desc')}
        highlight={focusSettingId === 'materials'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.appearance.label.chrome')}</span>
          {([
            ['solid', 'settings.appearance.chrome.solid'],
            ['frosted', 'settings.appearance.chrome.frosted'],
          ] as [ChromeMaterialId, string][]).map(([id, labelKey]) => (
            <button key={id} type="button" {...seg(look.chrome === id)} onClick={() => patchLook({ chrome: id })}>
              {t(labelKey)}
            </button>
          ))}
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.appearance.label.shadows')}</span>
          {([
            ['none', 'settings.appearance.shadows.none'],
            ['soft', 'settings.appearance.shadows.soft'],
            ['deep', 'settings.appearance.shadows.deep'],
          ] as [ShadowStrengthId, string][]).map(([id, labelKey]) => (
            <button key={id} type="button" {...seg(look.shadow === id)} onClick={() => patchLook({ shadow: id })}>
              {t(labelKey)}
            </button>
          ))}
        </div>
      </SettingsCard>

      {aeroActive && (
      <SettingsCard
        id="app-border"
        title={t('settings.appearance.border.title')}
        description={t('settings.appearance.border.desc')}
        highlight={focusSettingId === 'app-border'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.appearance.label.style')}</span>
          {borderStyleOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              {...seg(borderSettings.style === opt.id)}
              onClick={() => {
                const updated = saveAppBorderSettings({ ...borderSettings, style: opt.id });
                setBorderSettings(updated);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {borderSettings.style === 'blurred-wall' && (
          <div className="os-viz-row" style={{ marginTop: 10 }}>
            <span className="os-viz-label muted">{t('settings.appearance.label.blur')}</span>
            <input
              type="range"
              min={0}
              max={40}
              value={borderSettings.blurAmount}
              onChange={(e) => {
                const updated = saveAppBorderSettings({ ...borderSettings, blurAmount: Number(e.target.value) });
                setBorderSettings(updated);
              }}
              style={{ flex: 1 }}
              aria-label={t('a11y.slider.borderBlur')}
            />
            <span className="muted">{borderSettings.blurAmount}px</span>
          </div>
        )}
        <div className="os-viz-row" style={{ marginTop: 10 }}>
          <span className="os-viz-label muted">{t('settings.appearance.label.borderWidth')}</span>
          <input
            type="range"
            min={1}
            max={4}
            step={1}
            value={borderSettings.borderWidth}
            onChange={(e) => {
              const updated = saveAppBorderSettings({ ...borderSettings, borderWidth: Number(e.target.value) });
              setBorderSettings(updated);
            }}
            style={{ flex: 1 }}
            aria-label={t('settings.appearance.label.borderWidth')}
          />
          <span className="muted">{borderSettings.borderWidth}px</span>
        </div>
      </SettingsCard>
      )}

      {aeroActive && (
      <SettingsCard
        id="pillarbox"
        title={t('settings.appearance.pillarbox.title')}
        description={t('settings.appearance.pillarbox.desc')}
        highlight={focusSettingId === 'pillarbox'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.appearance.label.style')}</span>
          {pillarboxStyleOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              {...seg(pillarboxSettings.style === opt.id)}
              onClick={() => {
                const updated = savePillarboxSettings({ ...pillarboxSettings, style: opt.id });
                setPillarboxSettings(updated);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {pillarboxSettings.style === 'solid-color' && (
          <div className="os-viz-row" style={{ marginTop: 10 }}>
            <span className="os-viz-label muted">{t('settings.appearance.label.color')}</span>
            <input
              type="color"
              value={pillarboxSettings.solidColor}
              onChange={(e) => {
                const updated = savePillarboxSettings({ ...pillarboxSettings, solidColor: e.target.value });
                setPillarboxSettings(updated);
              }}
              style={{ width: 48, height: 32, padding: 0, border: '1px solid var(--border)', borderRadius: 4 }}
            />
            <input
              type="text"
              value={pillarboxSettings.solidColor}
              onChange={(e) => {
                const updated = savePillarboxSettings({ ...pillarboxSettings, solidColor: e.target.value });
                setPillarboxSettings(updated);
              }}
              style={{ width: 100, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--panel)', color: 'var(--text)' }}
            />
          </div>
        )}
        <div className="os-viz-row" style={{ marginTop: 10 }}>
          <span className="os-viz-label muted">{t('settings.appearance.pillarbox.nativeFill')}</span>
          {[false, true].map((on) => (
            <button
              key={String(on)}
              type="button"
              {...seg(pillarboxSettings.nativeFill === on)}
              onClick={() => {
                const updated = savePillarboxSettings({ ...pillarboxSettings, nativeFill: on });
                setPillarboxSettings(updated);
              }}
            >
              {t(on ? 'common.on' : 'common.off')}
            </button>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 6 }}>{t('settings.appearance.pillarbox.nativeFill.desc')}</p>
      </SettingsCard>
      )}

      <SettingsCard
        id="custom-css"
        title={t('search.customCss')}
        description={t('search.customCss.desc')}
        highlight={focusSettingId === 'custom-css'}
        advanced={
          <>
            <textarea
              className="os-user-css"
              rows={8}
              spellCheck={false}
              placeholder={'.os-start {\n  /* your rules */\n}'}
              value={userCss}
              disabled={look.customCssEnabled === false}
              onChange={(e) => setUserCss(e.target.value)}
            />
            <div className="os-set-btns">
              <button
                type="button"
                className="btn small"
                disabled={look.customCssEnabled === false}
                onClick={() => setPlaygroundOpen(true)}
              >
                {t('settings.playground.open')}
              </button>
              <button
                type="button"
                className="btn small primary"
                disabled={look.customCssEnabled === false}
                onClick={() => {
                  const r = saveCustomCss(userCss);
                  setCssMsg(
                    !r.ok
                      ? r.error ?? t('settings.appearance.css.failed')
                      // A silent "CSS applied." was the whole complaint in v1.0 audit §2.2:
                      // root variable overrides used to lose to the inline personalization
                      // styles and say nothing. They now win, and the message says so.
                      : r.promoted
                        ? t('settings.appearance.css.appliedPromoted', { count: r.promoted })
                        : t('settings.appearance.css.applied'),
                  );
                }}
              >
                {t('settings.appearance.css.apply')}
              </button>
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  clearCustomCss();
                  setUserCss('');
                  setCssMsg(t('settings.appearance.css.cleared'));
                }}
              >
                {t('settings.appearance.css.clear')}
              </button>
              <button
                type="button"
                className="btn small"
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: t('settings.appearance.css.resetTitle'),
                    message: t('settings.appearance.css.resetMessage'),
                    confirmLabel: t('common.reset'),
                    danger: true,
                  });
                  if (!ok) return;
                  resetLook();
                  setUserCss('');
                  setCssMsg(t('settings.appearance.css.lookReset'));
                }}
              >
                {t('settings.appearance.css.reset')}
              </button>
            </div>
            {cssMsg && <p className="muted os-set-hint">{cssMsg}</p>}
            {/* The lockout guard, stated up front rather than discovered by being
                blocked. This is the app's one custom-CSS editor; Theme Studio's
                per-theme stylesheet was moved in here. */}
            <p className="muted os-set-hint">{t('theme.lockoutNote')}</p>
          </>
        }
        advancedLabel={t('settings.appearance.css.editor')}
      >
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={look.customCssEnabled !== false}
            onChange={(e) => {
              patchLook({ customCssEnabled: e.target.checked });
              if (!e.target.checked) document.getElementById('jp-user-css')?.remove();
              else void saveCustomCss(userCss);
            }}
          />
          <span>{t('settings.appearance.css.enable')}</span>
        </label>
      </SettingsCard>

      {/* v1.0 audit §2.3. The playground owns a draft; persistence stays here, so
          closing it without applying leaves the sandbox exactly as it was. */}
      <CssPlayground
        open={playgroundOpen}
        initialCss={userCss}
        onClose={() => setPlaygroundOpen(false)}
        onApply={(css) => {
          setUserCss(css);
          const r = saveCustomCss(css);
          setCssMsg(
            !r.ok
              ? r.error ?? t('settings.appearance.css.failed')
              : r.promoted
                ? t('settings.appearance.css.appliedPromoted', { count: r.promoted })
                : t('settings.appearance.css.applied'),
          );
        }}
      />

      {/* MASTER_PLAN §20 — theme profiles, the request interpreter and the token
          editor. A theme's accent, density, corners and shadows are written into the
          cards above rather than overriding them, so they always show the real value. */}
      <ThemeStudioPanel />
    </>
  );
}
