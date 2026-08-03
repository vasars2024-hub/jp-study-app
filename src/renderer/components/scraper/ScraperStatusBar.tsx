// Bottom status strip: current state on the left, schedule facts on the right.

import Icon from '../Icons';
import { sx, sxn, sxs } from './strings';
import { useScraper } from './ScraperContext';

export default function ScraperStatusBar({
  running,
  lastScrape,
  nextScheduled,
  selected,
}: {
  running: boolean;
  /** Already-formatted, or null for "Never". */
  lastScrape: string | null;
  /** Already-formatted, or null for "Disabled". */
  nextScheduled: string | null;
  selected: number;
}) {
  const ctl = useScraper();

  return (
    <footer className="scr-statusbar">
      <button
        type="button"
        className={`scr-statusbar-state scr-statusbar-action${running ? ' is-running' : ''}`}
        title={sx('status.openActive')}
        onClick={() => ctl.navigate('new-scrape')}
      >
        <Icon name="power" size={13} />
        <span>{running ? sx('status.running') : sx('status.idle')}</span>
      </button>

      {selected > 0 && (
        <button
          type="button"
          className="scr-statusbar-field scr-statusbar-action"
          title={sx('status.openSelection')}
          onClick={() => ctl.navigate('results')}
        >
          {sxn('status.selected', selected)}
        </button>
      )}

      <span className="scr-statusbar-spacer" />

      <button
        type="button"
        className="scr-statusbar-field scr-statusbar-action"
        title={sx('status.openHistory')}
        onClick={() => ctl.navigate('history')}
      >
        {sxs('status.lastScrape', lastScrape ?? sx('status.never'))}
      </button>
      <button
        type="button"
        className="scr-statusbar-field scr-statusbar-action"
        title={sx('status.openSchedule')}
        onClick={() => ctl.navigate('scheduled')}
      >
        {sxs('status.nextScheduled', nextScheduled ?? sx('status.disabled'))}
      </button>
    </footer>
  );
}
