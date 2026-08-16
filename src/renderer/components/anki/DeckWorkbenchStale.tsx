/**
 * Smart recipe 18's consumer surface: the schedule scan, in the Browser.
 *
 * The recipe's verb is "find ... and **preview** reset or reschedule options",
 * so this proposes and never writes, the way recipes 9, 15, 16 and 17 do. Every
 * outcome it offers is either a Browser query — which the search box already
 * reverses — or a preview of a spread nothing has applied.
 *
 * Two axes are reported separately and never summed. `overdue` counts days past
 * a day Anki *planned*; `dormant` counts days since a review that actually
 * happened. A deck abandoned mid-way is deep in both, and a deck rescheduled by
 * a preset change is deep in `overdue` with a clean `dormant` — one number would
 * call those the same deck.
 *
 * When the source carried no revlog, `dormant` cannot fire at all. That is said
 * out loud (`reviewHistory: 'absent'`), because a silent zero there reads as
 * "you have reviewed everything recently" and means the opposite.
 *
 * `reset` is on screen and disabled with its reason, not hidden. The journal
 * carries field/tags/card-due/card-deck/deck-name; a real reset writes type,
 * queue, reps, lapses, interval and ease and drops the card's revlog. Hiding it
 * would leave the user hunting for a feature the recipe names.
 */
import { useMemo, useState } from 'react';
import type { AnkiDraft } from '../../../shared/ankiDraft';
import {
  DEFAULT_DORMANT_DAYS,
  DEFAULT_OVERDUE_DAYS,
  DEFAULT_STALE_SPREAD_DAYS,
  MIN_STALE_THRESHOLD_DAYS,
  planStaleRemedy,
  scanStaleCards,
  type StaleVerdict,
} from '../../../shared/ankiStaleCards';
import { useT } from '../../i18n';

/** Days of the spread listed individually before the rest is summarised. */
const MAX_SPREAD_ROWS = 7;

/** The verdicts a user can act on. `new` and `active` are not defects. */
const ACTIONABLE: readonly StaleVerdict[] = ['overdue', 'dormant', 'withheld'];

function clampThreshold(raw: string, fallback: number): number {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= MIN_STALE_THRESHOLD_DAYS ? value : fallback;
}

export default function DeckWorkbenchStale({
  draft,
  onQuery,
  /** Wall clock, injectable so a test's verdicts do not move with the calendar. */
  nowMs = Date.now(),
}: {
  draft: AnkiDraft;
  /** Hand a `stale:<verdict>` query back to the search box. */
  onQuery: (query: string) => void;
  nowMs?: number;
}): JSX.Element {
  const { t } = useT();
  const [overdueText, setOverdueText] = useState(String(DEFAULT_OVERDUE_DAYS));
  const [dormantText, setDormantText] = useState(String(DEFAULT_DORMANT_DAYS));
  const [spreadText, setSpreadText] = useState(String(DEFAULT_STALE_SPREAD_DAYS));

  const overdueDays = clampThreshold(overdueText, DEFAULT_OVERDUE_DAYS);
  const dormantDays = clampThreshold(dormantText, DEFAULT_DORMANT_DAYS);
  const spreadDays = Math.max(1, clampThreshold(spreadText, DEFAULT_STALE_SPREAD_DAYS));

  // `nowMs` is a prop and not a `Date.now()` read inside the memo, so the whole
  // panel and the Browser's own `stale:` context can be told the same "today".
  const scan = useMemo(
    () => scanStaleCards({ draft, nowMs, overdueDays, dormantDays }),
    [draft, nowMs, overdueDays, dormantDays],
  );

  const preview = useMemo(() => {
    if (!scan.ok) return null;
    const result = planStaleRemedy({ scan, mode: 'reschedule', spreadDays });
    return result.ok ? result.plan : null;
  }, [scan, spreadDays]);

  // Cards per day of the window. Built from the plan's own `after` days rather
  // than from `moves.length / spreadDays`: the round-robin is even only when the
  // count divides, and a computed average would hide the remainder day.
  const perDay = useMemo(() => {
    if (!preview || !scan.ok) return [];
    const counts = new Map<number, number>();
    for (const move of preview.moves) counts.set(move.after, (counts.get(move.after) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0] - b[0]);
  }, [preview, scan]);

  if (!scan.ok) {
    return (
      <div className="wb-stale">
        <p role="alert">{t(`ankiWorkbench.stale.refusal.${scan.refusal}`)}</p>
      </div>
    );
  }

  const { tally, reviewHistory } = scan;
  const affected = tally.overdue + tally.dormant + tally.withheld;

  return (
    <div className="wb-stale">
      <p>
        {affected === 0
          ? t('ankiWorkbench.stale.clean', { cards: tally.active + tally.new })
          : t('ankiWorkbench.stale.summary', {
              cards: affected,
              overdue: overdueDays,
              dormant: dormantDays,
            })}
      </p>

      {/* Said whenever it is true, not only when the count is zero: a deck with
          real overdue cards and no revlog still has an unanswerable half. */}
      {reviewHistory === 'absent' && (
        <p className="muted" role="note">
          {t('ankiWorkbench.stale.noHistory')}
        </p>
      )}

      <div className="wb-stale-thresholds">
        <label>
          {t('ankiWorkbench.stale.overdueDays')}
          <input
            type="number"
            min={MIN_STALE_THRESHOLD_DAYS}
            value={overdueText}
            onChange={(e) => setOverdueText(e.target.value)}
          />
        </label>
        <label>
          {t('ankiWorkbench.stale.dormantDays')}
          <input
            type="number"
            min={MIN_STALE_THRESHOLD_DAYS}
            value={dormantText}
            onChange={(e) => setDormantText(e.target.value)}
            disabled={reviewHistory === 'absent'}
          />
        </label>
      </div>

      {/* One button per verdict the deck actually has, so a click can never
          produce an empty grid the user then has to interpret. */}
      <div className="wb-stale-filters">
        {ACTIONABLE.filter((verdict) => tally[verdict] > 0).map((verdict) => (
          <button
            key={verdict}
            type="button"
            className="btn"
            onClick={() => onQuery(`stale:${verdict}`)}
          >
            {t(`ankiWorkbench.browser.explain.stale.${verdict}`)} ({tally[verdict]})
          </button>
        ))}
      </div>

      {preview && preview.moves.length > 0 && (
        <div className="wb-stale-preview">
          <p>
            {t('ankiWorkbench.stale.previewTitle', {
              cards: preview.changedCards,
              days: spreadDays,
            })}
          </p>
          <label>
            {t('ankiWorkbench.stale.spreadDays')}
            <input
              type="number"
              min={1}
              value={spreadText}
              onChange={(e) => setSpreadText(e.target.value)}
            />
          </label>
          <ul className="wb-stale-spread">
            {perDay.slice(0, MAX_SPREAD_ROWS).map(([day, cards]) => (
              <li key={day}>
                {/* 1-based, so the first row reads "day 1" and not "in 0 days". */}
                {t('ankiWorkbench.stale.spreadRow', { day: day - scan.todayDay + 1, cards })}
              </li>
            ))}
            {perDay.length > MAX_SPREAD_ROWS && (
              <li className="muted">
                {t('ankiWorkbench.stale.spreadMore', { days: perDay.length - MAX_SPREAD_ROWS })}
              </li>
            )}
          </ul>
          {/* Withheld cards are counted as skipped, never as moved: a new due day
              on a suspended card is a number Anki will never read. */}
          {tally.withheld > 0 && (
            <p className="muted">{t('ankiWorkbench.stale.withheldSkipped', { cards: tally.withheld })}</p>
          )}
          <p className="muted">{t('ankiWorkbench.stale.previewOnly')}</p>
        </div>
      )}

      {/* Named and disabled, not hidden — see the file header. */}
      <button type="button" className="btn" disabled title={t('ankiWorkbench.stale.refusal.reset-unsupported')}>
        {t('ankiWorkbench.stale.reset')}
      </button>
      <p className="muted">{t('ankiWorkbench.stale.refusal.reset-unsupported')}</p>
    </div>
  );
}
