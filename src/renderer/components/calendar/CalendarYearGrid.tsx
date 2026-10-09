/**
 * The Calendar's year mode: twelve month blocks, every day shaded by how much was studied
 * (`shared/calendarDayDetail.ts` `yearHeatmap`, the same score the Statistics heatmap uses).
 *
 * Like the month grid it is ONE tab stop — 365 focusable squares would put a year of
 * keystrokes between the grid and everything after it — with a moving active day:
 * Left/Right move a day, Up/Down a week, PageUp/PageDown a month, Home/End the ends of the
 * month. Selecting a day fills the day panel beside it; Enter (or a double click) opens that
 * day in the month view.
 */
import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useT } from '../../i18n';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { yearHeatmap } from '../../../shared/calendarDayDetail';
import { addLocalDays, gameAnswersByDay, localDayKey } from '../../../shared/studyActivityHeatmap';
import { getStudyDaysByKey, onStatsChanged } from '../../stats';
import { loadReviewLog, onReviewLogChanged } from '../../reviewLog';
import type { WeekStartDay } from '../../calendar';

export interface YearGridState {
  cursor: Date;
  today: Date;
  weekStart: WeekStartDay;
  selectedDay?: string;
  setSelectedDay?: (key: string) => void;
  openDay?: (key: string) => void;
}

function dateOf(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function useGameAnswers(): Record<string, number> {
  const [games, setGames] = useState<Record<string, number>>({});
  useEffect(() => {
    let alive = true;
    const refresh = (): void => {
      void loadReviewLog()
        .then((rows) => {
          if (alive) setGames(gameAnswersByDay(rows));
        })
        .catch(() => undefined);
    };
    refresh();
    const off = onReviewLogChanged(refresh);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return games;
}

export function CalendarYearGrid({ state }: { state: YearGridState }) {
  const { t, lang } = useT();
  const year = state.cursor.getFullYear();
  const [statsVersion, setStatsVersion] = useState(0);
  useEffect(() => onStatsChanged(() => setStatsVersion((v) => v + 1)), []);
  const games = useGameAnswers();
  const months = useMemo(
    () => yearHeatmap(year, getStudyDaysByKey(), games, state.weekStart),
    // `statsVersion` is the stats store's change signal.
    [year, games, state.weekStart, statsVersion],
  );
  const locale = LANG_TAGS[lang];
  const todayKey = localDayKey(state.today);
  const fallback = state.cursor.getFullYear() === year ? localDayKey(state.cursor) : `${year}-01-01`;
  const active = state.selectedDay && state.selectedDay.startsWith(`${year}-`) ? state.selectedDay : fallback;

  // Keep the day panel on a day of the year on screen.
  useEffect(() => {
    if (state.selectedDay !== active) state.setSelectedDay?.(active);
  }, [active]);

  const select = (key: string): void => {
    if (!key.startsWith(`${year}-`)) return;
    state.setSelectedDay?.(key);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const day = dateOf(active);
    let next: Date | null = null;
    switch (e.key) {
      case 'ArrowLeft': next = addLocalDays(day, -1); break;
      case 'ArrowRight': next = addLocalDays(day, 1); break;
      case 'ArrowUp': next = addLocalDays(day, -7); break;
      case 'ArrowDown': next = addLocalDays(day, 7); break;
      case 'PageUp': next = new Date(day.getFullYear(), day.getMonth() - 1, Math.min(day.getDate(), 28)); break;
      case 'PageDown': next = new Date(day.getFullYear(), day.getMonth() + 1, Math.min(day.getDate(), 28)); break;
      case 'Home': next = new Date(day.getFullYear(), day.getMonth(), 1); break;
      case 'End': next = new Date(day.getFullYear(), day.getMonth() + 1, 0); break;
      case 'Enter':
      case ' ':
        state.openDay?.(active);
        break;
      default:
        return;
    }
    e.preventDefault();
    if (next) {
      // Clamp to the year on screen rather than leaving it silently.
      const key = localDayKey(next);
      select(next.getFullYear() < year ? `${year}-01-01` : next.getFullYear() > year ? `${year}-12-31` : key);
    }
  };

  const cellId = (key: string) => `cal-year-cell-${key}`;
  const weekdayHeader = useMemo(() => {
    const first = new Date(2024, 0, 7 + state.weekStart); // 2024-01-07 is a Sunday
    return Array.from({ length: 7 }, (_, i) => addLocalDays(first, i));
  }, [state.weekStart]);

  return (
    <div
      className="cal-year-grid"
      role="grid"
      tabIndex={0}
      aria-label={t('cal2.year.label', { year: String(year) })}
      aria-activedescendant={cellId(active)}
      onKeyDown={onKeyDown}
    >
      {months.map((month) => {
        const cells: Array<{ key: string; blank: boolean; level: number; label: string; date?: string }> = [];
        for (let i = 0; i < month.leadingBlanks; i += 1) cells.push({ key: `b-${month.month}-${i}`, blank: true, level: 0, label: '' });
        for (const day of month.days) {
          const dayDate = dateOf(day.date);
          const studied = day.minutes > 0 || day.reviews > 0 || day.games > 0 || day.mined > 0;
          const label = `${dayDate.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, ${
            studied
              ? t('cal2.year.cellSummary', { minutes: day.minutes, reviews: day.reviews, games: day.games, mined: day.mined })
              : t('cal2.year.cellEmpty')
          }`;
          cells.push({ key: day.date, blank: false, level: day.level, label, date: day.date });
        }
        const rows: typeof cells[] = [];
        for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
        const monthName = new Date(year, month.month, 1).toLocaleDateString(locale, { month: 'long' });
        return (
          <div key={month.month} className="cal-year-month" role="rowgroup" aria-label={monthName}>
            <div className="cal-year-month-name" aria-hidden="true">{monthName}</div>
            <div className="cal-year-dow" aria-hidden="true">
              {weekdayHeader.map((d, i) => (
                <span key={i}>{d.toLocaleDateString(locale, { weekday: 'narrow' })}</span>
              ))}
            </div>
            {rows.map((row, r) => (
              <div key={r} role="row" className="cal-year-row">
                {row.map((cell) =>
                  cell.blank ? (
                    <span key={cell.key} role="gridcell" aria-hidden="true" className="cal-year-cell is-blank" />
                  ) : (
                    <span
                      key={cell.key}
                      id={cellId(cell.key)}
                      role="gridcell"
                      aria-selected={cell.key === active}
                      aria-label={cell.label}
                      title={cell.label}
                      data-level={cell.level}
                      className={`cal-year-cell${cell.key === active ? ' is-active' : ''}${cell.key === todayKey ? ' today' : ''}`}
                      onClick={() => select(cell.key)}
                      onDoubleClick={() => state.openDay?.(cell.key)}
                    />
                  ),
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
