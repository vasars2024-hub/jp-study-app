import SettingsCard from '../SettingsCard';
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
import { loadAppBorderSettings, saveAppBorderSettings, onAppBorderSettingsChanged, type AppBorderStyle } from '../../../appBorderSettings';
import { loadPillarboxSettings, savePillarboxSettings, onPillarboxSettingsChanged, type PillarboxStyle } from '../../../pillarboxSettings';
import { hasDiscoveredAero, onAeroDiscoveryChanged } from '../../../aeroDiscovery';
import { useEffect, useState } from 'react';

export default function AppearancePage() {
  const s = useSettings();
  const { look, patchLook, theme, chooseTheme, seg, userCss, setUserCss, cssMsg, setCssMsg, focusSettingId } = s;
  
  const [borderSettings, setBorderSettings] = useState(() => loadAppBorderSettings());
  const [pillarboxSettings, setPillarboxSettings] = useState(() => loadPillarboxSettings());
  
  useEffect(() => {
    const unsub = onAppBorderSettingsChanged(setBorderSettings);
    return unsub;
  }, []);
  
  useEffect(() => {
    const unsub = onPillarboxSettingsChanged(setPillarboxSettings);
    return unsub;
  }, []);

  const borderStyleOptions: { id: AppBorderStyle; label: string }[] = [
    { id: 'aero-glass', label: 'Aero Glass' },
    { id: 'blurred-wall', label: 'Blurred Wallpaper' },
    { id: 'solid-accent', label: 'Solid Accent' },
    { id: 'retro-xp', label: 'Retro XP' },
    { id: 'minimal', label: 'Minimal' },
    { id: 'glass-dark', label: 'Glass Dark' },
  ];
  
  const pillarboxStyleOptions: { id: PillarboxStyle; label: string }[] = [
    { id: 'default-gradient', label: 'Default Gradient' },
    { id: 'blurred-wallpaper', label: 'Blurred Wallpaper' },
    { id: 'solid-color', label: 'Solid Color' },
    { id: 'dark-mode', label: 'Dark Mode' },
  ];
  
  const [isAeroDiscovered, setIsAeroDiscovered] = useState(hasDiscoveredAero);

  useEffect(() => onAeroDiscoveryChanged(setIsAeroDiscovered), []);

  return (
    <>
      <SettingsCard
        id="theme"
        title="Theme"
        description="Choose a color theme for the whole app."
        highlight={focusSettingId === 'theme'}
      >
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={look.autoTheme}
            onChange={(e) => patchLook({ autoTheme: e.target.checked })}
          />
          <span>Auto theme (match Windows light / dark)</span>
        </label>
        <div className="os-theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`os-theme-swatch ${!look.autoTheme && theme === t.id ? 'active' : ''}`}
              onClick={() => chooseTheme(t.id)}
              title={t.label}
              disabled={look.autoTheme}
            >
              <span
                className="os-theme-swatch-preview"
                style={{ background: t.swatch.bg, borderColor: t.swatch.border }}
              >
                <span style={{ color: t.swatch.text }}>Aa</span>
              </span>
              <span className="os-theme-swatch-label">{t.label}</span>
            </button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        id="accent"
        title="Accent colour"
        description="Primary accent used across chrome and highlights."
        highlight={focusSettingId === 'accent'}
      >
        <div className="os-accent-row">
          {ACCENT_PRESETS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`os-accent ${look.accentMode === 'preset' && look.accentPreset === a.id ? 'active' : ''}`}
              style={{ background: a.accent }}
              title={a.label}
              onClick={() => patchLook({ accentMode: 'preset', accentPreset: a.id })}
            />
          ))}
        </div>
        <div className="os-viz-row" style={{ marginTop: 10 }}>
          <span className="os-viz-label muted">Custom</span>
          <input
            type="color"
            value={look.customAccent}
            onChange={(e) => patchLook({ accentMode: 'custom', customAccent: e.target.value })}
            title="Custom accent"
          />
          <button type="button" className={seg(look.accentMode === 'custom')} onClick={() => patchLook({ accentMode: 'custom' })}>
            Use custom
          </button>
        </div>
      </SettingsCard>

      <SettingsCard
        id="typography"
        title="Typography & density"
        description="Fonts, spacing density, and corner roundness."
        highlight={focusSettingId === 'typography'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">Font</span>
          {([
            ['segoe', 'Segoe'],
            ['system', 'System'],
            ['jp-first', 'JP first'],
          ] as [FontFamilyId, string][]).map(([id, label]) => (
            <button key={id} type="button" className={seg(look.fontFamily === id)} onClick={() => patchLook({ fontFamily: id })}>
              {label}
            </button>
          ))}
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">Density</span>
          {([
            ['compact', 'Compact'],
            ['comfortable', 'Comfortable'],
            ['spacious', 'Spacious'],
          ] as [DensityId, string][]).map(([id, label]) => (
            <button key={id} type="button" className={seg(look.density === id)} onClick={() => patchLook({ density: id })}>
              {label}
            </button>
          ))}
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">Corners</span>
          {([
            ['sharp', 'Sharp'],
            ['soft', 'Soft'],
            ['round', 'Round'],
          ] as [RadiusId, string][]).map(([id, label]) => (
            <button key={id} type="button" className={seg(look.radius === id)} onClick={() => patchLook({ radius: id })}>
              {label}
            </button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        id="materials"
        title="Shape & materials"
        description="Window chrome finish and shadow depth."
        highlight={focusSettingId === 'materials'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">Chrome</span>
          {([
            ['solid', 'Solid'],
            ['frosted', 'Frosted'],
          ] as [ChromeMaterialId, string][]).map(([id, label]) => (
            <button key={id} type="button" className={seg(look.chrome === id)} onClick={() => patchLook({ chrome: id })}>
              {label}
            </button>
          ))}
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">Shadows</span>
          {([
            ['none', 'None'],
            ['soft', 'Soft'],
            ['deep', 'Deep'],
          ] as [ShadowStrengthId, string][]).map(([id, label]) => (
            <button key={id} type="button" className={seg(look.shadow === id)} onClick={() => patchLook({ shadow: id })}>
              {label}
            </button>
          ))}
        </div>
      </SettingsCard>

      {isAeroDiscovered && (
      <SettingsCard
        id="app-border"
        title="App borders"
        description="Window frame style (Secret OS / Aero theme only)."
        highlight={focusSettingId === 'app-border'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">Style</span>
          {borderStyleOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={seg(borderSettings.style === opt.id)}
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
            <span className="os-viz-label muted">Blur</span>
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
            />
            <span className="muted">{borderSettings.blurAmount}px</span>
          </div>
        )}
        <div className="os-viz-row" style={{ marginTop: 10 }}>
          <span className="os-viz-label muted">Border width</span>
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
          />
          <span className="muted">{borderSettings.borderWidth}px</span>
        </div>
      </SettingsCard>
      )}

      {isAeroDiscovered && (
      <SettingsCard
        id="pillarbox"
        title="Pillarbox style"
        description="Outer border background (Secret OS / Aero theme only)."
        highlight={focusSettingId === 'pillarbox'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">Style</span>
          {pillarboxStyleOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={seg(pillarboxSettings.style === opt.id)}
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
            <span className="os-viz-label muted">Color</span>
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
      </SettingsCard>
      )}

      <SettingsCard
        id="custom-css"
        title="Custom CSS"
        description="Inject your own styles. Dangerous constructs are blocked."
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
                className="btn small primary"
                disabled={look.customCssEnabled === false}
                onClick={() => {
                  const r = saveCustomCss(userCss);
                  setCssMsg(r.ok ? 'CSS applied.' : r.error ?? 'Failed.');
                }}
              >
                Apply CSS
              </button>
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  clearCustomCss();
                  setUserCss('');
                  setCssMsg('CSS cleared.');
                }}
              >
                Clear CSS
              </button>
              <button
                type="button"
                className="btn small"
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: 'Reset look',
                    message: 'Reset theme-related look settings and clear custom CSS?',
                    confirmLabel: 'Reset',
                    danger: true,
                  });
                  if (!ok) return;
                  resetLook();
                  setUserCss('');
                  setCssMsg('Look reset.');
                }}
              >
                Reset look
              </button>
            </div>
            {cssMsg && <p className="muted os-set-hint">{cssMsg}</p>}
          </>
        }
        advancedLabel="editor"
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
          <span>Enable custom CSS sandbox</span>
        </label>
      </SettingsCard>
    </>
  );
}
