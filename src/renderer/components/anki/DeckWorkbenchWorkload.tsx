/**
 * Smart recipe 26's consumer surface: the workload estimate.
 *
 * It reports and never writes, so unlike the Schedule panel next door there is
 * no Add-to-tray button here at all. The reason is not caution: the deck-options
 * preset is not part of the draft (`ankiSchedulingImpact.ts` says why), so the
 * workbench cannot change the thing being proposed, and a control that queued a
 * change the exporter could not carry would be exactly the inactive-control
 * defect the plan forbids. The panel says so once, in `previewOnly`.
 *
 * Whole-draft like recipes 11, 17 and 18, and for the sharper version of their
 * reason: workload is a property of the schedule. Scoping it to whichever rows
 * a text filter is showing would answer "how much of my daily reviewing is
 * visible right now", which nobody asked.
 *
 * The two numbers are deliberately not merged into one headline. The horizon is
 * observed and does not move; the steady-state load is the only thing the
 * proposal changes. A single "reviews per day" that blended them would be the
 * one lie this recipe is placed to avoid.
 */
import { useMemo, useState } from 'react';
import type { AnkiDraft } from '../../../shared/ankiDraft';
import {
  DEFAULT_FORECAST_DAYS,
  MAX_DESIRED_RETENTION,
  MIN_DESIRED_RETENTION,
  projectSchedulingImpact,
  type SchedulingImpactRefusal,
  type SchedulingProposal,
} from '../../../shared/ankiSchedulingImpact';
import { useT } from '../../i18n';

/** Days of the horizon listed individually; the rest is summarised. */
const MAX_ROWS = 7;

const REFUSAL_KEY: Record<SchedulingImpactRefusal, string> = {
  'no-scheduled-cards': 'ankiWorkbench.workload.refusal.no-scheduled-cards',
  'retention-out-of-range': 'ankiWorkbench.workload.refusal.retention-out-of-range',
  'modifier-out-of-range': 'ankiWorkbench.workload.refusal.modifier-out-of-range',
  'no-collection-origin': 'ankiWorkbench.workload.refusal.no-collection-origin',
};

/**
 * Reviews per day, to one decimal below ten and whole above it. A 3,000-card
 * deck moves in fractions of a review and a 4-card deck's `0` would be wrong.
 *
 * Returns a **number**, not a formatted string: `t()` runs a numeric var through
 * `Intl.NumberFormat(LANG_TAGS[lang])` itself (`shared/i18n/core.ts:62`), so
 * grouping and the decimal separator follow the UI language. A `toLocaleString()`
 * here would take the host locale instead, which is what the i18n gate catches.
 */
function roundLoad(value: number): number {
  return value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
}

/** One decimal, as a number, for the same reason. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** The retention inputs are percentages, because Anki's own field is one. */
function clampPercent(raw: string, fallback: number): number {
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function DeckWorkbenchWorkload({
  draft,
  nowMs,
}: {
  draft: AnkiDraft;
  /** Injected in tests so a forecast is reproducible; the app passes nothing. */
  nowMs?: number;
}): JSX.Element {
  const { t } = useT();
  const [kind, setKind] = useState<SchedulingProposal['kind']>('retention');
  const [retentionFrom, setRetentionFrom] = useState(90);
  const [retentionTo, setRetentionTo] = useState(85);
  const [modifierFrom, setModifierFrom] = useState(100);
  const [modifierTo, setModifierTo] = useState(120);

  const proposal: SchedulingProposal = useMemo(
    () =>
      kind === 'retention'
        ? { kind, from: retentionFrom / 100, to: retentionTo / 100 }
        : { kind, from: modifierFrom / 100, to: modifierTo / 100 },
    [kind, retentionFrom, retentionTo, modifierFrom, modifierTo],
  );

  const result = useMemo(
    () =>
      projectSchedulingImpact({
        draft,
        proposal,
        nowMs: nowMs ?? Date.now(),
        forecastDays: DEFAULT_FORECAST_DAYS,
      }),
    [draft, proposal, nowMs],
  );

  return (
    <div className="wb-workload">
      <div className="wb-workload-controls" role="group" aria-label={t('ankiWorkbench.workload.title')}>
        {(['retention', 'interval-modifier'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`btn${kind === value ? ' primary' : ''}`}
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
          >
            {t(`ankiWorkbench.workload.kind.${value}`)}
          </button>
        ))}
        {kind === 'retention' ? (
          <>
            <label>
              {t('ankiWorkbench.workload.retentionFrom')}
              <input
                type="number"
                step={1}
                min={MIN_DESIRED_RETENTION * 100}
                max={MAX_DESIRED_RETENTION * 100}
                value={retentionFrom}
                onChange={(event) => setRetentionFrom(clampPercent(event.currentTarget.value, 90))}
              />
            </label>
            <label>
              {t('ankiWorkbench.workload.retentionTo')}
              <input
                type="number"
                step={1}
                min={MIN_DESIRED_RETENTION * 100}
                max={MAX_DESIRED_RETENTION * 100}
                value={retentionTo}
                onChange={(event) => setRetentionTo(clampPercent(event.currentTarget.value, 85))}
              />
            </label>
          </>
        ) : (
          <>
            <label>
              {t('ankiWorkbench.workload.modifierFrom')}
              <input
                type="number"
                step={5}
                min={1}
                value={modifierFrom}
                onChange={(event) => setModifierFrom(clampPercent(event.currentTarget.value, 100))}
              />
            </label>
            <label>
              {t('ankiWorkbench.workload.modifierTo')}
              <input
                type="number"
                step={5}
                min={1}
                value={modifierTo}
                onChange={(event) => setModifierTo(clampPercent(event.currentTarget.value, 120))}
              />
            </label>
          </>
        )}
      </div>

      {!result.ok ? (
        /* Named, not an empty chart. A never-studied deck is the common case
           here, not an edge — the user's own mined deck carries 0 cards with
           any SRS state. */
        <p className="wb-workload-refusal" role="alert">
          {t(REFUSAL_KEY[result.refusal])}
        </p>
      ) : (
        <>
          <p>
            {t('ankiWorkbench.workload.summary', {
              cards: result.scheduledCards,
              current: roundLoad(result.current.reviewsPerDay),
              proposed: roundLoad(result.proposed.reviewsPerDay),
            })}
          </p>
          <p className={result.reviewsPerDayDelta > 0 ? 'wb-workload-up' : 'wb-workload-down'}>
            {t(
              result.reviewsPerDayDelta === 0
                ? 'ankiWorkbench.workload.deltaNone'
                : result.reviewsPerDayDelta > 0
                  ? 'ankiWorkbench.workload.deltaUp'
                  : 'ankiWorkbench.workload.deltaDown',
              {
                delta: roundLoad(Math.abs(result.reviewsPerDayDelta)),
                percent: Math.abs(Math.round((1 / result.intervalRatio - 1) * 100)),
                ratio: Math.round(result.intervalRatio * 100) / 100,
              },
            )}
          </p>
          <p className="muted">
            {t('ankiWorkbench.workload.intervals', {
              current: round1(result.current.meanIntervalDays),
              proposed: round1(result.proposed.meanIntervalDays),
            })}
          </p>

          {/* The whole reason the horizon is rendered apart from the comparison
              above: a proposal moves no card that is already scheduled. */}
          <p className="muted">{t('ankiWorkbench.workload.horizonUnchanged')}</p>
          <ul className="wb-workload-horizon">
            {result.horizon.slice(0, MAX_ROWS).map((day) => (
              <li key={day.day}>
                {t('ankiWorkbench.workload.horizonRow', { offset: day.offset, cards: day.cards })}
              </li>
            ))}
            {result.horizon.length > MAX_ROWS && (
              <li className="muted">
                {t('ankiWorkbench.workload.horizonMore', {
                  days: result.horizon.length - MAX_ROWS,
                  cards: result.horizon
                    .slice(MAX_ROWS)
                    .reduce((sum, day) => sum + day.cards, 0),
                })}
              </li>
            )}
          </ul>
          {result.backlogCards > 0 && (
            <p className="muted">
              {t('ankiWorkbench.workload.backlog', { cards: result.backlogCards })}
            </p>
          )}

          {/* Every excluded card, by its own reason, so the tally visibly sums
              to the draft's card count and a missing thousand cannot hide. */}
          <p className="muted">
            {t('ankiWorkbench.workload.excluded', {
              unscheduled: result.excluded.unscheduled,
              withheld: result.excluded.withheld,
              filtered: result.excluded.filtered,
              noInterval: result.excluded.noInterval,
            })}
          </p>
          <p className="muted">
            {t(
              result.provenance.decay === undefined
                ? 'ankiWorkbench.workload.provenanceModifier'
                : 'ankiWorkbench.workload.provenanceRetention',
              { decay: result.provenance.decay ?? 0 },
            )}
          </p>
          <p className="muted">{t('ankiWorkbench.workload.previewOnly')}</p>
        </>
      )}
    </div>
  );
}
