import { useRef, useState } from 'react';
import Icon from '../Icons';
import { groupLabelKey, pageMeta, SETTINGS_NAV } from './settingsRegistry';
import { getRecentPages } from './settingsRecent';
import { useSettings } from './SettingsContext';
import { loadThemeId } from '../../theme';
import { getTheme } from '../../theme/engine';
import type { SettingsPageId } from './types';
import { useT } from '../../i18n';
import { LANG_LABELS, LANG_TAGS } from '../../../shared/i18n/core';
import { useAeroMaterials } from '../ui';
import { ContextualSurface } from '../liquid/LiquidSurface';
import { requestWiredArchiveEntry } from '../../wiredArchiveLifecycle';

const QUICK: {
  page: SettingsPageId;
  labelKey: string;
  icon: (typeof SETTINGS_NAV)[0]['icon'];
  settingId?: string;
}[] = [
  { page: 'appearance', labelKey: 'settings.home.quick.theme', icon: 'sparkle', settingId: 'theme' },
  { page: 'appearance', labelKey: 'settings.home.quick.language', icon: 'globe', settingId: 'ui-language' },
  { page: 'study', labelKey: 'settings.home.quick.extension', icon: 'globe', settingId: 'extension-bridge' },
  { page: 'special', labelKey: 'settings.home.quick.blancMode', icon: 'wrench', settingId: 'blanc-mode' },
  { page: 'wallpaper', labelKey: 'settings.home.quick.wallpaper', icon: 'image' },
  { page: 'companions', labelKey: 'settings.home.quick.companions', icon: 'heart' },
  {
    page: 'atmosphere',
    labelKey: 'settings.home.quick.atmosphere',
    icon: 'flame',
    settingId: 'particles',
  },
  { page: 'shortcuts', labelKey: 'settings.home.quick.shortcuts', icon: 'command' },
  { page: 'lockscreen', labelKey: 'settings.home.quick.lockscreen', icon: 'lock', settingId: 'lockscreen-enable' },
  // Nine of these ten name the ACTION and the rail names the DESTINATION — "Change
  // wallpaper" beside Wallpaper, "Manage shortcuts" beside Shortcuts. This one was the
  // exception: `settings.home.quick.memory` is byte-for-byte `settings.nav.memory`, so the
  // Home tile and the rail entry read as the same control in two competing systems while
  // going to different places (the rail opens the page, this deep-links `backup` on it).
  // `search.backup` is that setting's own title in all four catalogs, so the tile, the
  // settings-search result and the destination now agree instead of colliding.
  { page: 'memory', labelKey: 'search.backup', icon: 'folder', settingId: 'backup' },
];

export default function SettingsHome() {
  const s = useSettings();
  const { t, lang } = useT();
  const aero = useAeroMaterials();
  const [diagArmed, setDiagArmed] = useState(false);
  const [diagCode, setDiagCode] = useState('');
  const [diagMessage, setDiagMessage] = useState<{ key: string; count?: number }>({ key: 'settings.home.diag.sealed' });
  const diagClickRef = useRef({ count: 0, last: 0 });
  const recent = getRecentPages();
  // Same lookup as Settings > Appearance: the translated name first, then the engine's own
  // label. `THEMES` omits hidden themes, so Aero and Wired used to show their raw ids here.
  const currentThemeId = s.theme || loadThemeId();
  const themeKey = `settings.appearance.theme.${currentThemeId}`;
  const translatedTheme = t(themeKey);
  const themeLabel = translatedTheme !== themeKey
    ? translatedTheme
    : getTheme(currentThemeId)?.label ?? currentThemeId;
  const wallLabel =
    s.wall.kind === 'preset'
      ? s.presets.find((p) => p.id === s.wallPreset)?.label ?? s.wallPreset
      : s.wall.kind === 'video'
        ? t('settings.home.liveVideo')
        : t('settings.home.customImage');

  return (
    <div className="os-set-home">
      <ContextualSurface as="header" className="os-set-page-head">
        <h2 className="os-set-page-title">{t('settings.appTitle')}</h2>
        <p className="os-set-page-intro muted">{t('settings.home.intro')}</p>
      </ContextualSurface>

      <section className="os-set-home-status" aria-label={t('settings.home.statusAria')}>
        <div className="os-set-status-chip">
          <span className="muted">{t('settings.home.language')}</span>
          <strong lang={LANG_TAGS[lang]}>{LANG_LABELS[lang]}</strong>
        </div>
        <div className="os-set-status-chip">
          <span className="muted">{t('settings.home.theme')}</span>
          <strong>{s.look.autoTheme ? t('settings.home.auto') : themeLabel}</strong>
        </div>
        <div className="os-set-status-chip">
          <span className="muted">{t('settings.home.wallpaper')}</span>
          <strong>{wallLabel}</strong>
        </div>
        <div className="os-set-status-chip">
          <span className="muted">{t('settings.home.livingLayer')}</span>
          <strong>{s.env.enabled ? t('common.on') : t('common.off')}</strong>
        </div>
        <div className="os-set-status-chip">
          <span className="muted">{t('settings.home.effects')}</span>
          <strong>
            {[
              s.env.enabled && s.env.particlesEnabled ? t('settings.home.particles') : null,
              s.env.enabled && s.env.companionsEnabled ? t('settings.nav.companions') : null,
              s.env.enabled && s.env.dayCycleLighting ? t('settings.home.lighting') : null,
            ]
              .filter(Boolean)
              .join(' · ') || t('settings.home.none')}
          </strong>
        </div>
      </section>

      {aero && (
        <section className={`wired-access-card${diagArmed ? ' is-armed' : ''}`} aria-label={t('settings.home.diag.aria')}>
          <button
            type="button"
            className="wired-access-tile"
            onClick={() => {
              const now = Date.now();
              const prev = diagClickRef.current;
              const count = now - prev.last < 1200 ? prev.count + 1 : 1;
              diagClickRef.current = { count, last: now };
              if (count >= 3) {
                setDiagArmed(true);
                setDiagMessage({ key: 'settings.home.diag.open' });
              } else {
                setDiagMessage({ key: 'settings.home.diag.pulse', count });
              }
            }}
          >
            <Icon name="monitor" size={18} />
            <span>
              <strong>{t('settings.home.diag.title')}</strong>
              <small>{t(diagMessage.key, { count: diagMessage.count ?? 0 })}</small>
            </span>
          </button>
          {diagArmed && (
            <form
              className="wired-access-command"
              onSubmit={(event) => {
                event.preventDefault();
                if (diagCode.trim().toUpperCase() === 'WIRED') {
                  setDiagMessage({ key: 'settings.home.diag.accepted' });
                  requestWiredArchiveEntry();
                } else {
                  setDiagMessage({ key: 'settings.home.diag.rejected' });
                  setDiagCode('');
                }
              }}
            >
              <label htmlFor="wired-access-command">{t('settings.home.diag.command')}</label>
              <div>
                <span aria-hidden="true">&gt;</span>
                <input
                  id="wired-access-command"
                  value={diagCode}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setDiagCode(event.currentTarget.value)}
                  placeholder={t('settings.home.diag.enterCode')}
                />
                <button type="submit">{t('settings.home.diag.run')}</button>
              </div>
            </form>
          )}
        </section>
      )}

      <section aria-label={t('settings.home.quickActionsAria')}>
        <h3 className="os-set-home-section-title">{t('settings.home.quickActions')}</h3>
        <div className="os-set-quick-grid">
          {QUICK.map((q) => (
            <button
              key={q.labelKey}
              type="button"
              className="os-set-quick-card"
              // D96: two of these target advanced pages — Blanc Mode (`special`)
              // and Particles & atmosphere (`atmosphere`) — and without `guided`
              // SettingsApp's bounce-home guard sent every default-mode user
              // straight back to the page they clicked from. A quick action is
              // an explicit user route, which is exactly what the flag is for.
              onClick={() => s.navigate(q.page, q.settingId, { guided: true })}
            >
              <Icon name={q.icon} size={20} />
              <span>{t(q.labelKey)}</span>
            </button>
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section aria-label={t('settings.home.recentAria')}>
          <h3 className="os-set-home-section-title">{t('settings.home.recentlyOpened')}</h3>
          <ul className="os-set-recent-list">
            {recent.map((id) => {
              const meta = pageMeta(id);
              if (!meta) return null;
              return (
                <li key={id}>
                  {/* Same as the quick actions above: this list is BUILT from where
                      the user has been, so it can and does contain advanced pages —
                      offering a one-click return and then refusing it is worse than
                      not listing it. */}
                  <button
                    type="button"
                    className="os-set-recent-item"
                    onClick={() => s.navigate(id, undefined, { guided: true })}
                  >
                    <Icon name={meta.icon} size={15} />
                    <span>
                      {meta.group ? `${t(groupLabelKey(meta.group))} · ` : ''}
                      {t(meta.labelKey)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
