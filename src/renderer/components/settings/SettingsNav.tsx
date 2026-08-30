import Icon from '../Icons';
import { ContextualSurface } from '../liquid/LiquidSurface';
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

  // The category rail is navigation, so it takes the contextual role rather than a local
  // translucent copy. `ContextualSurface` is inert outside a Liquid window: the material
  // arrives only under `.fwin-liquid` in `theme/liquid-window.css`, so conventional
  // Settings keeps its exact pixels and the toggle back is pure cascade.
  //
  // The group and list wrappers below adopt the same role for the reason `.scr-rail-group`
  // and `.scr-rail-list` did: a `<ul>` of 8 navigation buttons satisfies the classifier's
  // dense-work test, so leaving them undeclared would put four "dense work" regions on the
  // rail's own material the moment it starts painting. They take the role and no material.
  //
  // `.os-set-nav-scroll` is the rail's own scroller, so the Advanced footer can sit OUTSIDE
  // it. The footer used to stay visible by being `position: sticky` over the scrolled
  // groups, which is a real collision: measured 2026-08-30 the category-4 harness read the
  // whole 179x88 footer overlapping a group at maximized and two more pairs at 960x680.
  // Same structure the Scraper rail uses (`.scr-rail-scroll`), and the footer is still
  // always visible without painting over anything.
  //
  // Below 420px of `.os-set-body` the rail collapses to icons. No `aria-label` here on
  // purpose: the bare `<span>` IS each button's accessible name, so the narrow tier in
  // `styles.css` clips it to 1x1 rather than using `display: none` the way `.scr-rail-label`
  // does. Give any new item a `descKey` so the `title` still names it in icon mode.
  return (
    <ContextualSurface as="nav" className="os-set-nav-v2" aria-label={t('settings.nav.ariaCategories')}>
      <ContextualSurface className="os-set-nav-scroll">
        <button
          type="button"
          className={`os-set-nav-item ${page === 'home' ? 'active' : ''}`}
          onClick={() => onNavigate('home')}
          aria-current={page === 'home' ? 'page' : undefined}
          title={home.descKey ? t(home.descKey) : undefined}
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
            <ContextualSurface key={group} className="os-set-nav-group">
              <div className="os-set-nav-group-label" id={`set-nav-${group}`}>
                {groupLabel}
              </div>
              <ContextualSurface
                as="ul"
                className="os-set-nav-list"
                aria-labelledby={`set-nav-${group}`}
              >
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
              </ContextualSurface>
            </ContextualSurface>
          );
        })}
      </ContextualSurface>

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
    </ContextualSurface>
  );
}
