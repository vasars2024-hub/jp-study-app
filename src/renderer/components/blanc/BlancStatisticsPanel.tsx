/**
 * Blanc statistics panel.
 *
 * One module per Blanc panel: a Blanc lazy chunk is a whole module, so panels
 * that shared a file loaded each other's content stacks (opening Clipboard used
 * to fetch the grammar data set). Pillar 0 still applies — compose the shared
 * content component in Blanc chrome, never a Study OS `*View`, and never
 * import `AppChrome`/`MenuBar`/`StatusBar` here. The Study OS class-name
 * stylesheet these blocks rely on is loaded by the shell's lazy loader
 * (`withStudyOsCompat` in BlancShell.tsx), before first render.
 */
import { useT } from '../../i18n';
import {
  StatsBooks,
  StatsCards,
  StatsChart,
  StatsShows,
  WordKnowledge,
  useStats,
} from '../stats/StatsContent';
import { formatDuration } from '../../stats';
import { StatsGames } from '../stats/StatsGames';

/**
 * Pillar 0 fix for the `stats` tab bail-out, which mounted `StatisticsView`
 * (and therefore `AppChrome`) inside `BlancViewHost`. Read-only: the one
 * mutating action, Reset, keeps the same `confirmDialog` guard Study OS uses.
 */
export function BlancStatisticsPanel() {
  const { t } = useT();
  const state = useStats();
  const s = state.summary;

  return (
    <div className="blanc-tool-detail blanc-statistics-panel">
      <fieldset>
        <legend>{t('blanc.study.stats.totals')}</legend>
        <div className="blanc-status-row">
          <span>{t('blanc.study.stats.totalTime', { duration: formatDuration(s.totalSeconds) })}</span>
          <span>{t('blanc.study.stats.charCount', { count: Math.round(s.totalChars) })}</span>
          <span>{t('blanc.study.stats.activeDays', { count: s.daysActive })}</span>
          <button type="button" onClick={state.refresh}>
            {t('blanc.study.refresh')}
          </button>
          <button type="button" disabled={!state.hasData} onClick={() => void state.resetAllStats()}>
            {t('common.reset')}
          </button>
        </div>
        {state.hasData ? (
          <StatsCards state={state} showRestDayToggle />
        ) : (
          <p className="blanc-note">
            {t('blanc.study.stats.empty')}
          </p>
        )}
      </fieldset>

      {state.hasData && (
        <fieldset>
          <legend>{t('blanc.study.stats.last14')}</legend>
          <StatsChart state={state} />
        </fieldset>
      )}

      {s.books.length > 0 && (
        <fieldset>
          <legend>{t('stats.byBook')}</legend>
          <StatsBooks state={state} />
        </fieldset>
      )}

      {s.shows.length > 0 && (
        <fieldset>
          <legend>{t('stats.byShow')}</legend>
          <StatsShows state={state} />
        </fieldset>
      )}

      <fieldset>
        <legend>{t('stats.wk.title')}</legend>
        <WordKnowledge />
      </fieldset>

      <StatsGames />
    </div>
  );
}
