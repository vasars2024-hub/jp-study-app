/**
 * Blanc reading-finder panel.
 *
 * One module per Blanc panel: a Blanc lazy chunk is a whole module, so panels
 * that shared a file loaded each other's content stacks (opening Clipboard used
 * to fetch the grammar data set). Pillar 0 still applies — compose the shared
 * content component in Blanc chrome, never a Study OS `*View`, and never
 * import `AppChrome`/`MenuBar`/`StatusBar` here. The Study OS class-name
 * stylesheet these blocks rely on is loaded by the shell's lazy loader
 * (`withStudyOsCompat` in BlancShell.tsx), before first render.
 */
import type { LibraryItem } from '../../../shared/types';
import {
  ALL_LEVELS,
  ContinueReadingRow,
  ReadingFinderControls,
  ReadingSiteDetail,
  ReadingSiteGrid,
  levelRangeLabel,
  useReadingFinder,
} from '../reading/ReadingFinderContent';
import { useT } from '../../i18n';

export function BlancReadingFinderPanel({
  onOpenBook,
}: {
  onOpenBook: (item: LibraryItem) => void;
}) {
  const { t } = useT();
  const state = useReadingFinder();

  return (
    <div className="blanc-tool-detail">
      {state.continueReading.length > 0 && (
        <fieldset>
          <legend>{t('blanc.study.reading.continue')}</legend>
          <ContinueReadingRow state={state} onOpenBook={onOpenBook} />
        </fieldset>
      )}

      <fieldset>
        <legend>{t('blanc.study.reading.filters')}</legend>
        <ReadingFinderControls state={state} />
        <div className="blanc-status-row">
          <span>{t('blanc.study.reading.siteCount', { count: state.list.length })}</span>
          <span>
            {t('blanc.study.reading.level', {
              range: levelRangeLabel(t, state.levels.size ? [...state.levels] : ALL_LEVELS),
            })}
          </span>
          <button type="button" onClick={state.resetFilters}>
            {t('blanc.study.reading.resetFilters')}
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('blanc.study.reading.sites')}</legend>
        <ReadingSiteGrid state={state} />
      </fieldset>

      {state.selected && (
        <ReadingSiteDetail
          site={state.selected}
          onClose={() => state.setSelected(null)}
          onOpenBook={onOpenBook}
        />
      )}
    </div>
  );
}
