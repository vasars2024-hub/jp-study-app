/**
 * Statistics, in the Files app — gate 8's second surface.
 *
 * **It composes `StatsContent`'s exported blocks rather than re-reading the
 * stores.** That is not a convenience: gate 8's own words are "the same numbers
 * the old Settings page produced, captured before removal and compared after",
 * and a second reader is the only way to produce a different number. `useStats`,
 * `StatsCards`, `StatsChart`, `StatsBooks`, `StatsShows` and `WordKnowledge` are
 * the same functions `StatisticsView` (Study OS) and `BlancStatisticsPanel`
 * (Blanc) call, so this is the third host of one implementation, exactly the
 * shape that module was extracted into.
 *
 * The comparison anchor is `src/.coordination/files-app/gate8-before.json`.
 * `recentDays` (14) is the STABLE key there; `totalSeconds`, `totalChars` and
 * `totalWatchSeconds` are live counters that move whenever the user reads or
 * watches anything, so they are compared for shape — same source, same units,
 * non-null — never for equality.
 */
import { useT } from '../../../i18n';
import {
  StatsBooks,
  StatsCards,
  StatsChart,
  StatsShows,
  WordKnowledge,
  useStats,
} from '../../stats/StatsContent';
import { FilesPanelCard } from './FilesPanelCard';
import '../../stats/statsLiquid.css';

export interface FilesStatisticsPanelProps {
  /** Card anchor a search hit named, when it named one. */
  focusCardId?: string | null;
}

export function FilesStatisticsPanel({ focusCardId = null }: FilesStatisticsPanelProps) {
  const { t } = useT();
  const state = useStats();
  const { summary, hasData, refresh, resetAllStats } = state;

  return (
    <div className="fa-panel fa-panel-statistics">
      <FilesPanelCard
        id="statistics-overview"
        title={t('filesApp.system.statistics.title')}
        description={t('filesApp.system.statistics.desc')}
        focused={focusCardId === 'statistics-overview'}
        trailing={
          <div className="fa-panel-actions">
            <button type="button" className="btn small" onClick={refresh}>
              {t('filesApp.action.refresh')}
            </button>
            <button
              type="button"
              className="btn small danger"
              disabled={!hasData}
              onClick={() => void resetAllStats()}
            >
              {t('stats.reset')}
            </button>
          </div>
        }
      >
        {hasData ? (
          <StatsCards state={state} showRestDayToggle />
        ) : (
          // An empty store is stated, never dressed as a zeroed dashboard.
          <p className="fa-panel-note">{t('stats.empty.desc')}</p>
        )}
      </FilesPanelCard>

      <FilesPanelCard
        id="statistics-recent"
        title={t('stats.last14Days')}
        focused={focusCardId === 'statistics-recent'}
      >
        {hasData ? (
          <StatsChart state={state} />
        ) : (
          <p className="fa-panel-note">{t('stats.empty.desc')}</p>
        )}
      </FilesPanelCard>

      <FilesPanelCard
        id="statistics-knowledge"
        title={t('filesApp.system.knownWords.title')}
        description={t('filesApp.system.knownWords.desc')}
        focused={focusCardId === 'statistics-knowledge'}
      >
        <WordKnowledge />
      </FilesPanelCard>

      {summary.books.length > 0 ? (
        <FilesPanelCard
          id="statistics-books"
          title={t('stats.byBook')}
          focused={focusCardId === 'statistics-books'}
        >
          <StatsBooks state={state} />
        </FilesPanelCard>
      ) : null}

      {summary.shows.length > 0 ? (
        <FilesPanelCard
          id="statistics-shows"
          title={t('stats.byShow')}
          focused={focusCardId === 'statistics-shows'}
        >
          <StatsShows state={state} />
        </FilesPanelCard>
      ) : null}
    </div>
  );
}

export default FilesStatisticsPanel;
