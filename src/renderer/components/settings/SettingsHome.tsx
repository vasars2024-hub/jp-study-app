import Icon from '../Icons';
import { pageMeta, SETTINGS_NAV } from './settingsRegistry';
import { getRecentPages } from './settingsRecent';
import { useSettings } from './SettingsContext';
import { loadThemeId, THEMES } from '../../theme';
import type { SettingsPageId } from './types';

const QUICK: { page: SettingsPageId; label: string; icon: (typeof SETTINGS_NAV)[0]['icon']; settingId?: string }[] = [
  { page: 'wallpaper', label: 'Change wallpaper', icon: 'image' },
  { page: 'shortcuts', label: 'Manage shortcuts', icon: 'command' },
  { page: 'appearance', label: 'Customize theme', icon: 'sparkle', settingId: 'theme' },
  { page: 'companions', label: 'Companion settings', icon: 'heart' },
  { page: 'atmosphere', label: 'Particles & atmosphere', icon: 'flame', settingId: 'particles' },
  { page: 'memory', label: 'Memory & storage', icon: 'folder', settingId: 'backup' },
];

export default function SettingsHome() {
  const s = useSettings();
  const recent = getRecentPages();
  const themeLabel = THEMES.find((t) => t.id === (s.theme || loadThemeId()))?.label ?? s.theme;
  const wallLabel =
    s.wall.kind === 'preset'
      ? s.presets.find((p) => p.id === s.wallPreset)?.label ?? s.wallPreset
      : s.wall.kind === 'video'
        ? 'Live video'
        : 'Custom image';

  return (
    <div className="os-set-home">
      <header className="os-set-page-head">
        <h2 className="os-set-page-title">Settings</h2>
        <p className="os-set-page-intro muted">
          Personalize Study OS, manage the desktop, and find any option with search.
        </p>
      </header>

      <section className="os-set-home-status" aria-label="System status">
        <div className="os-set-status-chip">
          <span className="muted">Theme</span>
          <strong>{s.look.autoTheme ? 'Auto' : themeLabel}</strong>
        </div>
        <div className="os-set-status-chip">
          <span className="muted">Wallpaper</span>
          <strong>{wallLabel}</strong>
        </div>
        <div className="os-set-status-chip">
          <span className="muted">Living layer</span>
          <strong>{s.env.enabled ? 'On' : 'Off'}</strong>
        </div>
        <div className="os-set-status-chip">
          <span className="muted">Effects</span>
          <strong>
            {[
              s.env.enabled && s.env.particlesEnabled ? 'Particles' : null,
              s.env.enabled && s.env.companionsEnabled ? 'Companions' : null,
              s.env.enabled && s.env.dayCycleLighting ? 'Lighting' : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'None'}
          </strong>
        </div>
      </section>

      <section aria-label="Quick actions">
        <h3 className="os-set-home-section-title">Quick actions</h3>
        <div className="os-set-quick-grid">
          {QUICK.map((q) => (
            <button
              key={q.label}
              type="button"
              className="os-set-quick-card"
              onClick={() => s.navigate(q.page, q.settingId)}
            >
              <Icon name={q.icon} size={20} />
              <span>{q.label}</span>
            </button>
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section aria-label="Recently opened">
          <h3 className="os-set-home-section-title">Recently opened</h3>
          <ul className="os-set-recent-list">
            {recent.map((id) => {
              const meta = pageMeta(id);
              if (!meta) return null;
              return (
                <li key={id}>
                  <button type="button" className="os-set-recent-item" onClick={() => s.navigate(id)}>
                    <Icon name={meta.icon} size={15} />
                    <span>
                      {meta.group ? `${meta.group} · ` : ''}
                      {meta.label}
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
