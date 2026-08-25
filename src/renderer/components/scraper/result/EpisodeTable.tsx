// The episode table: a sticky header over a virtualized body.
//
// The repo has no virtualized table component, so this is VirtualList under a
// header row that shares one CSS grid track list — which is what keeps the two
// aligned while scrolling. 1,197 rows is enough that rendering them all would
// stutter the window drag, which CLAUDE.md calls out specifically.

import { useMemo } from 'react';
import VirtualList from '../../VirtualList';
import Icon from '../../Icons';
import { scraperArtwork } from '../artwork';
import { Pill, SubtitleBadge } from './Pill';
import { gridTemplate, type ScraperColumn } from './columns';
import { formatBytes } from '../../../../shared/assetRegistry';
import { formatDuration } from '../../../stats';
import type { EpisodeRow } from '../../../../shared/scraperResults';
import type { ScraperColumnId, ScraperSortDir } from '../../../../shared/scraperShell';

const ROW_HEIGHT = { compact: 40, cozy: 54 };

function cellContent(
  column: ScraperColumn,
  row: EpisodeRow,
  languagePriority: string[],
  selected: boolean,
  onToggle: (id: string) => void,
  onOpen?: (row: EpisodeRow) => void,
) {
  switch (column.id) {
    case 'select':
      return (
        <input
          type="checkbox"
          checked={selected}
          aria-label={`Select ${row.titleEn}`}
          onChange={() => onToggle(row.id)}
        />
      );
    case 'index':
      return <span className="scr-t-num">{row.number}</span>;
    case 'title':
      return (
        <span className="scr-t-title">
          <span className="scr-t-thumb" aria-hidden>
            <img src={row.thumbnailUrl || scraperArtwork(row.number - 1)} alt="" loading="lazy" />
          </span>
          <span className="scr-t-titles">
            <span className="scr-t-en">{row.titleEn}</span>
            <span className="scr-t-ja">{row.titleJa}</span>
          </span>
        </span>
      );
    case 'type':
      return <Pill>{row.kind}</Pill>;
    case 'language':
      return <Pill tone="accent">{row.audio}</Pill>;
    case 'subtitles':
      return <SubtitleBadge subtitles={row.subtitles} languagePriority={languagePriority} />;
    case 'resolution':
      return <Pill tone="outline">{row.resolution}</Pill>;
    case 'source':
      return <span className="scr-t-plain">{row.sourceLabel}</span>;
    case 'size':
      return <span className="scr-t-num">{formatBytes(row.sizeBytes)}</span>;
    case 'duration':
      return <span className="scr-t-num">{formatDuration(row.durationSec)}</span>;
    case 'season':
      return <span className="scr-t-num">{row.season}</span>;
    case 'airDate':
      return <span className="scr-t-plain">{row.airDate ?? '—'}</span>;
    case 'status':
      return (
        <Pill
          tone={row.status === 'ok' ? 'good' : row.status === 'warning' ? 'warn' : 'bad'}
          title={row.statusNote || undefined}
        >
          {row.status}
        </Pill>
      );
    case 'link':
      return (
        <button
          type="button"
          className="scr-t-play"
          aria-label={`Open ${row.titleEn}`}
          onClick={() => onOpen?.(row)}
        >
          <Icon name="player" size={13} />
        </button>
      );
    default:
      return null;
  }
}

export default function EpisodeTable({
  rows,
  columns,
  density,
  selected,
  onToggle,
  sortColumn,
  sortDir,
  onSort,
  languagePriority,
  emptyMessage,
  onOpen,
}: {
  rows: EpisodeRow[];
  columns: ScraperColumn[];
  density: 'compact' | 'cozy';
  selected: Set<string>;
  onToggle: (id: string) => void;
  sortColumn: ScraperColumnId;
  sortDir: ScraperSortDir;
  onSort: (id: ScraperColumnId) => void;
  languagePriority: string[];
  emptyMessage: string;
  onOpen?: (row: EpisodeRow) => void;
}) {
  const template = useMemo(() => gridTemplate(columns), [columns]);

  // `rows.length + 1`, and the header is row 1: `aria-rowcount` counts every row
  // the table has, header included, and it was short by one. It is also the only
  // place the real size can come from — the body is windowed, so what is in the
  // DOM is a couple of dozen rows out of however many there are.
  return (
    <div className="scr-table" role="table" aria-rowcount={rows.length + 1}>
      <div className="scr-thead" role="row" aria-rowindex={1} style={{ gridTemplateColumns: template }}>
        {columns.map((column) => {
          const active = column.id === sortColumn;
          return (
            <div
              key={column.id}
              role="columnheader"
              className={`scr-th scr-th--${column.align ?? 'start'}`}
              aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
            >
              {column.sortable ? (
                <button type="button" className="scr-th-btn" onClick={() => onSort(column.id)}>
                  {column.label}
                  {active && (
                    <span className={`scr-th-caret${sortDir === 'desc' ? ' is-desc' : ''}`} aria-hidden>
                      <Icon name="chevron" size={10} />
                    </span>
                  )}
                </button>
              ) : (
                column.label
              )}
            </div>
          );
        })}
      </div>

      <div className="scr-tbody">
        <VirtualList
          items={rows}
          itemHeight={ROW_HEIGHT[density]}
          getKey={(row) => row.id}
          gridRole="rowgroup"
          emptyState={<p className="scr-table-empty">{emptyMessage}</p>}
          renderItem={(row, index) => {
            const isSelected = selected.has(row.id);
            return (
              <div
                role="row"
                aria-rowindex={index + 2}
                className={`scr-row${isSelected ? ' is-selected' : ''}${
                  row.status === 'failed' ? ' is-failed' : ''
                }`}
                style={{ gridTemplateColumns: template }}
              >
                {columns.map((column) => (
                  <div
                    key={column.id}
                    role="gridcell"
                    className={`scr-td scr-td--${column.align ?? 'start'}`}
                  >
                    {cellContent(column, row, languagePriority, isSelected, onToggle, onOpen)}
                  </div>
                ))}
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}
