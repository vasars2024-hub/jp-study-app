// Left rail: grouped navigation plus the live STATUS block at the bottom.

import Icon from '../Icons';
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
    <nav
      className={`scr-rail${ctl.railCollapsed ? ' is-collapsed' : ''}`}
      aria-label={sx('nav.ariaCategories')}
    >
      <div className="scr-rail-scroll">
        {groups.map((group) => {
          const pages = SCRAPER_NAV.filter(
            (p) => p.group === group && (ctl.advancedMode || !p.advanced),
          );
          if (!pages.length) return null;
          const headingId = `scr-rail-${group.toLowerCase()}`;
          return (
            <div key={group} className="scr-rail-group">
              <div className="scr-rail-group-label" id={headingId}>
                {sx(scraperGroupLabelKey(group))}
              </div>
              <ul className="scr-rail-list" aria-labelledby={headingId}>
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
              </ul>
            </div>
          );
        })}
      </div>

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
    </nav>
  );
}
