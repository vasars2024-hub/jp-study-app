// Filter / Sort / Group / Columns, plus the search box — the row above the
// table in the reference design.

import { useEffect, useRef, useState } from 'react';
import Icon from '../../Icons';
import { Button } from '../../ui';
import { SCRAPER_COLUMNS, GROUP_OPTIONS, type GroupKey } from './columns';
import type { ScraperColumnId, ScraperSortDir } from '../../../../shared/scraperShell';
import { sx } from '../strings';

function Popover({
  label,
  icon,
  children,
  active,
}: {
  label: string;
  icon: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  active?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="scr-pop-host" ref={ref}>
      <button
        type="button"
        className={`scr-tool-btn${active ? ' is-on' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
        <span>{label}</span>
        <Icon name="chevron" size={10} />
      </button>
      {open && <div className="scr-pop">{children(() => setOpen(false))}</div>}
    </div>
  );
}

export interface ResultFilters {
  onlyMissingSubs: boolean;
  onlyFailed: boolean;
  resolution: string;
}

export const EMPTY_FILTERS: ResultFilters = {
  onlyMissingSubs: false,
  onlyFailed: false,
  resolution: '',
};

export default function ResultToolbar({
  query,
  onQuery,
  filters,
  onFilters,
  sortColumn,
  sortDir,
  onSort,
  groupBy,
  onGroupBy,
  visibleColumns,
  onVisibleColumns,
}: {
  query: string;
  onQuery: (value: string) => void;
  filters: ResultFilters;
  onFilters: (next: ResultFilters) => void;
  sortColumn: ScraperColumnId;
  sortDir: ScraperSortDir;
  onSort: (id: ScraperColumnId, dir: ScraperSortDir) => void;
  groupBy: GroupKey;
  onGroupBy: (key: GroupKey) => void;
  visibleColumns: ScraperColumnId[];
  onVisibleColumns: (ids: ScraperColumnId[]) => void;
}) {
  const filterCount =
    (filters.onlyMissingSubs ? 1 : 0) + (filters.onlyFailed ? 1 : 0) + (filters.resolution ? 1 : 0);
  const sortLabel = SCRAPER_COLUMNS.find((c) => c.id === sortColumn)?.label || 'Episode';

  return (
    <div className="scr-toolbar">
      <Popover
        label={filterCount ? `${sx('result.filter')} (${filterCount})` : sx('result.filter')}
        icon={<Icon name="scan" size={13} />}
        active={filterCount > 0}
      >
        {() => (
          <div className="scr-pop-body">
            <label className="scr-pop-check">
              <input
                type="checkbox"
                checked={filters.onlyMissingSubs}
                onChange={(e) => onFilters({ ...filters, onlyMissingSubs: e.target.checked })}
              />
              {sx('result.filterMissingSubs')}
            </label>
            <label className="scr-pop-check">
              <input
                type="checkbox"
                checked={filters.onlyFailed}
                onChange={(e) => onFilters({ ...filters, onlyFailed: e.target.checked })}
              />
              {sx('result.filterFailed')}
            </label>
            <div className="scr-pop-group">
              <span className="scr-pop-label">{sx('result.filterResolution')}</span>
              {['', '1080p', '720p', '480p'].map((value) => (
                <button
                  key={value || 'any'}
                  type="button"
                  className={`scr-chip${filters.resolution === value ? ' is-on' : ''}`}
                  onClick={() => onFilters({ ...filters, resolution: value })}
                >
                  {value || sx('result.any')}
                </button>
              ))}
            </div>
            <Button size="sm" variant="ghost" onClick={() => onFilters(EMPTY_FILTERS)}>
              {sx('result.clearFilters')}
            </Button>
          </div>
        )}
      </Popover>

      <Popover label={`${sx('result.sort')}: ${sortLabel}`} icon={<Icon name="chart-bar" size={13} />}>
        {(close) => (
          <div className="scr-pop-body">
            {SCRAPER_COLUMNS.filter((c) => c.sortable).map((column) => (
              <button
                key={column.id}
                type="button"
                className={`scr-pop-item${column.id === sortColumn ? ' is-on' : ''}`}
                onClick={() => {
                  onSort(column.id, column.id === sortColumn && sortDir === 'asc' ? 'desc' : 'asc');
                  close();
                }}
              >
                {column.label}
                {column.id === sortColumn && (
                  <span className="scr-pop-hint">{sortDir === 'asc' ? '↑' : '↓'}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </Popover>

      <Popover
        label={groupBy ? `${sx('result.group')}: ${GROUP_OPTIONS.find((g) => g.value === groupBy)?.label}` : sx('result.group')}
        icon={<Icon name="app" size={13} />}
        active={Boolean(groupBy)}
      >
        {(close) => (
          <div className="scr-pop-body">
            {GROUP_OPTIONS.map((option) => (
              <button
                key={option.value || 'none'}
                type="button"
                className={`scr-pop-item${option.value === groupBy ? ' is-on' : ''}`}
                onClick={() => {
                  onGroupBy(option.value);
                  close();
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </Popover>

      <Popover label={sx('result.columns')} icon={<Icon name="widgets" size={13} />}>
        {() => (
          <div className="scr-pop-body">
            {SCRAPER_COLUMNS.filter((c) => !c.locked).map((column) => {
              const on = visibleColumns.includes(column.id);
              return (
                <label key={column.id} className="scr-pop-check">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      onVisibleColumns(
                        on
                          ? visibleColumns.filter((id) => id !== column.id)
                          : [...visibleColumns, column.id],
                      )
                    }
                  />
                  {column.label}
                </label>
              );
            })}
            <p className="scr-pop-note">{sx('result.columnsLocked')}</p>
          </div>
        )}
      </Popover>

      <div className="scr-toolbar-spacer" />

      <div className="scr-toolbar-search">
        <span className="scr-search-icon" aria-hidden>
          <Icon name="search" size={13} />
        </span>
        <input
          type="search"
          className="scr-search-input"
          value={query}
          placeholder={sx('result.searchPlaceholder')}
          aria-label={sx('result.search')}
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>
    </div>
  );
}
