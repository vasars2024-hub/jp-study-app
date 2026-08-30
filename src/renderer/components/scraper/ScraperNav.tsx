// Left rail: grouped navigation plus the live STATUS block at the bottom.

import Icon from '../Icons';
import { ContextualSurface } from '../liquid/LiquidSurface';
import StatusDot from './StatusDot';
import { SCRAPER_NAV, scraperGroupLabelKey, scraperGroupOrder } from './scraperPages';
import { useScraper } from './ScraperContext';
import { sx, sxn } from './strings';

export interface ScraperSystemStats {
  memoryMb: number;
  cpuPercent: number;
  activeJobs: number;
}

export default function ScraperNav({ stats }: { stats: ScraperSystemStats }) {
  const ctl = useScraper();
  const groups = scraperGroupOrder();
  const busy = stats.activeJobs > 0;

  return (
    <ContextualSurface
      as="nav"
      className={`scr-rail${ctl.railCollapsed ? ' is-collapsed' : ''}`}
      aria-label={sx('nav.ariaCategories')}
    >
      {/* The rail's interior is navigation all the way down, so the role is declared at
          every level that holds the page list. Marking only the innermost `<ul>` moved
          the misclassification up one wrapper rather than removing it: measured, the
          two `.scr-rail-group` divs then read as dense work on the rail's material for
          the same reason the lists had — a container with three or more `<li>`
          descendants and no landmark tag. None of the three paints; see the shared
          exception in `theme/liquid-window.css`. */}
      <ContextualSurface className="scr-rail-scroll">
        {groups.map((group) => {
          const pages = SCRAPER_NAV.filter(
            (p) => p.group === group && (ctl.advancedMode || !p.advanced),
          );
          if (!pages.length) return null;
          const headingId = `scr-rail-${group.toLowerCase()}`;
          return (
            <ContextualSurface key={group} className="scr-rail-group">
              <div className="scr-rail-group-label" id={headingId}>
                {sx(scraperGroupLabelKey(group))}
              </div>
              {/* The rail's own page list. It declares the contextual role because it
                  IS navigation: a role classifier that only reads the tag sees a
                  17-item list and calls it dense work, which would then demand an
                  opaque plate over the rail's material. Same exception, and the same
                  reason, as `.reader-seek-wrap` in `theme/liquid-window.css` — the
                  role is adopted for what it means and the geometry stays the
                  region's own. */}
              <ContextualSurface as="ul" className="scr-rail-list" aria-labelledby={headingId}>
                {pages.map((p) => {
                  const active = ctl.page === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={`scr-rail-item${active ? ' is-active' : ''}`}
                        onClick={() => ctl.navigate(p.id)}
                        aria-current={active ? 'page' : undefined}
                        title={ctl.railCollapsed ? sx(p.labelKey) : sx(p.descKey)}
                      >
                        <Icon name={p.icon} size={16} />
                        <span className="scr-rail-label">{sx(p.labelKey)}</span>
                        <StatusDot id={`page.${p.id}`} className="scr-rail-dot" />
                      </button>
                    </li>
                  );
                })}
              </ContextualSurface>
            </ContextualSurface>
          );
        })}
      </ContextualSurface>

      <div className="scr-rail-status">
        <div className="scr-rail-group-label">{sx('nav.status')}</div>
        <div className="scr-rail-state">
          <span className={`scr-state-dot${busy ? ' is-busy' : ''}`} aria-hidden />
          <span>{busy ? sx('nav.statusRunning') : sx('nav.statusIdle')}</span>
        </div>
        <p className="scr-rail-tasks">
          {busy ? sxn('nav.activeTasks', stats.activeJobs) : sx('nav.noActiveTasks')}
        </p>
        <hr className="scr-rail-rule" />
        <p className="scr-rail-metric">{sxn('nav.memory', stats.memoryMb)}</p>
        <p className="scr-rail-metric">{sxn('nav.cpu', stats.cpuPercent)}</p>
      </div>
    </ContextualSurface>
  );
}
