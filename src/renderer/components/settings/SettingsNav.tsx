import Icon from '../Icons';
import { groupLabelKey, groupOrder, SETTINGS_NAV } from './settingsRegistry';
import type { SettingsPageId } from './types';
import { useT } from '../../i18n';

export default function SettingsNav({
  page,
  onNavigate,
  advancedMode,
  onToggleAdvanced,
}: {
  page: SettingsPageId;
  onNavigate: (id: SettingsPageId) => void;
  advancedMode: boolean;
  onToggleAdvanced: () => void;
}) {
  const { t } = useT();
  const home = SETTINGS_NAV.find((p) => p.id === 'home')!;
  const groups = groupOrder();

  return (
    <nav className="os-set-nav-v2" aria-label={t('settings.nav.ariaCategories')}>
      <button
        type="button"
        className={`os-set-nav-item ${page === 'home' ? 'active' : ''}`}
        onClick={() => onNavigate('home')}
        aria-current={page === 'home' ? 'page' : undefined}
      >
        <Icon name={home.icon} size={16} />
        <span>{t(home.labelKey)}</span>
      </button>

      {groups.map((group) => {
        const pages = SETTINGS_NAV.filter(
          (p) => p.group === group && (advancedMode || !p.advanced),
        );
        if (!pages.length) return null;
        const groupLabel = t(groupLabelKey(group));
        return (
          <div key={group} className="os-set-nav-group">
            <div className="os-set-nav-group-label" id={`set-nav-${group}`}>
              {groupLabel}
            </div>
            <ul className="os-set-nav-list" aria-labelledby={`set-nav-${group}`}>
              {pages.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`os-set-nav-item ${page === p.id ? 'active' : ''}`}
                    onClick={() => onNavigate(p.id)}
                    aria-current={page === p.id ? 'page' : undefined}
                    title={p.descKey ? t(p.descKey) : undefined}
                  >
                    <Icon name={p.icon} size={16} />
                    <span>{t(p.labelKey)}</span>
                    {p.advanced && (
                      <span className="os-set-adv-dot" title={t('settings.nav.advanced')} />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <div className="os-set-nav-footer">
        <button
          type="button"
          className={`os-set-advanced-btn${advancedMode ? ' on' : ''}`}
          onClick={onToggleAdvanced}
          aria-pressed={advancedMode}
          title={
            advancedMode ? t('settings.nav.advancedOn') : t('settings.nav.advancedOff')
          }
        >
          <span className="os-set-advanced-glyph" aria-hidden>
            <Icon name="wrench" size={15} />
          </span>
          <span className="os-set-advanced-label">{t('settings.nav.advanced')}</span>
        </button>
        <p className="os-set-advanced-hint muted">
          {advancedMode
            ? t('settings.nav.advancedUnlocked')
            : t('settings.nav.advancedHint')}
        </p>
      </div>
    </nav>
  );
}
