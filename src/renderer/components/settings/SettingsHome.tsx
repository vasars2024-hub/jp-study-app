import Icon from '../Icons';
import { groupLabelKey, pageMeta, SETTINGS_NAV } from './settingsRegistry';
import { getRecentPages } from './settingsRecent';
import { useSettings } from './SettingsContext';
import { loadThemeId, THEMES } from '../../theme';
import type { SettingsPageId } from './types';
import { useT } from '../../i18n';

const QUICK: {
  page: SettingsPageId;
  labelKey: string;
  icon: (typeof SETTINGS_NAV)[0]['icon'];
  settingId?: string;
}[] = [
  { page: 'wallpaper', labelKey: 'settings.home.quick.wallpaper', icon: 'image' },
  { page: 'shortcuts', labelKey: 'settings.home.quick.shortcuts', icon: 'command' },
  { page: 'lockscreen', labelKey: 'Lockscreen & PIN', icon: 'lock', settingId: 'lockscreen-enable' },
  { page: 'appearance', labelKey: 'settings.home.quick.theme', icon: 'sparkle', settingId: 'theme' },
  { page: 'companions', labelKey: 'settings.home.quick.companions', icon: 'heart' },
  {
    page: 'atmosphere',
    labelKey: 'settings.home.quick.atmosphere',
    icon: 'flame',
    settingId: 'particles',
  },
  { page: 'memory', labelKey: 'settings.home.quick.memory', icon: 'folder', settingId: 'backup' },
];

export default function SettingsHome() {
  const s = useSettings();
  const { t } = useT();
  const recent = getRecentPages();
  const themeLabel = THEMES.find((th) => th.id === (s.theme || loadThemeId()))?.label ?? s.theme;
  const wallLabel =
    s.wall.kind === 'preset'
      ? s.presets.find((p) => p.id === s.wallPreset)?.label ?? s.wallPreset
      : s.wall.kind === 'video'
        ? t('settings.home.liveVideo')
        : t('settings.home.customImage');

  return (
    <div className="os-set-home">
      <header className="os-set-page-head">
        <h2 className="os-set-page-title">{t('settings.appTitle')}</h2>
        <p className="os-set-page-intro muted">{t('settings.home.intro')}</p>
      </header>

      <section className="os-set-home-status" aria-label={t('settings.home.statusAria')}>
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

      <section aria-label={t('settings.home.quickActionsAria')}>
        <h3 className="os-set-home-section-title">{t('settings.home.quickActions')}</h3>
        <div className="os-set-quick-grid">
          {QUICK.map((q) => (
            <button
              key={q.labelKey}
              type="button"
              className="os-set-quick-card"
              onClick={() => s.navigate(q.page, q.settingId)}
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
                  <button type="button" className="os-set-recent-item" onClick={() => s.navigate(id)}>
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
