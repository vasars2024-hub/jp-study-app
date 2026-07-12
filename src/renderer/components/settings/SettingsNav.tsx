import Icon from '../Icons';
import { groupOrder, SETTINGS_NAV } from './settingsRegistry';
import type { SettingsPageId } from './types';

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
  const home = SETTINGS_NAV.find((p) => p.id === 'home')!;
  const groups = groupOrder();

  return (
    <nav className="os-set-nav-v2" aria-label="Settings categories">
      <button
        type="button"
        className={`os-set-nav-item ${page === 'home' ? 'active' : ''}`}
        onClick={() => onNavigate('home')}
        aria-current={page === 'home' ? 'page' : undefined}
      >
        <Icon name={home.icon} size={16} />
        <span>{home.label}</span>
      </button>

      {groups.map((group) => {
        const pages = SETTINGS_NAV.filter(
          (p) => p.group === group && (advancedMode || !p.advanced),
        );
        if (!pages.length) return null;
        return (
          <div key={group} className="os-set-nav-group">
            <div className="os-set-nav-group-label" id={`set-nav-${group}`}>
              {group}
            </div>
            <ul className="os-set-nav-list" aria-labelledby={`set-nav-${group}`}>
              {pages.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`os-set-nav-item ${page === p.id ? 'active' : ''}`}
                    onClick={() => onNavigate(p.id)}
                    aria-current={page === p.id ? 'page' : undefined}
                    title={p.description}
                  >
                    <Icon name={p.icon} size={16} />
                    <span>{p.label}</span>
                    {p.advanced && <span className="os-set-adv-dot" title="Advanced" />}
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
            advancedMode
              ? 'Advanced mode on — showing extra settings'
              : 'Advanced mode off — extra settings hidden (still active in background)'
          }
        >
          <span className="os-set-advanced-glyph" aria-hidden>
            <Icon name="wrench" size={15} />
          </span>
          <span className="os-set-advanced-label">
            {advancedMode ? 'Advanced' : 'Advanced'}
          </span>
        </button>
        <p className="os-set-advanced-hint muted">
          {advancedMode ? 'Extra pages unlocked' : 'Tap to unlock expert options'}
        </p>
      </div>
    </nav>
  );
}
