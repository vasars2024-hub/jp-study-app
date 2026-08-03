/**
 * Phase 6 slice 7 — "Continue watching" on the desktop.
 *
 * The migration's study loop has been complete but *sealed*: every way into it goes through
 * the media workspace's full-screen launcher, and once there you still have to find the file
 * again. This widget is the loop's entry point, sitting on the Study OS desktop next to the
 * streak and the reading progress — one click resumes exactly where you stopped, and a second
 * control takes you to the cards that file has already produced.
 *
 * It therefore raises **both** of the workspace's cross-surface events:
 *
 *   - `MEDIA_WORKSPACE_OPEN_EVENT` with an explicit `startAtSec` — the mechanism proven live
 *     in `proof/startatsec-20260730`. Passing the position explicitly rather than relying on
 *     the player's stored resume is deliberate: an explicit destination outranks the resume,
 *     so this path does not depend on the reopen-while-active resume behaviour that is still
 *     recorded as measured-but-unexplained.
 *   - `STUDY_REVIEW_FOCUS_EVENT` — the same handoff a readiness row makes, so the count this
 *     widget prints lands on exactly the cards it was counting.
 *
 * ## Three things it deliberately does not do
 *
 * 1. **It never asks Anki.** A desktop widget refreshes on a timer, and an interval snapshot
 *    over a real collection is far too expensive to run on one — but the deciding reason is
 *    slice 6's: with Anki unreachable every Anki-derived number becomes a confident zero.
 *    The card count here is mining provenance, which is local, free and true regardless.
 *    Maturity and "needs a look" stay in the Review panel, where Anki can be asked properly.
 * 2. **It never renders a control that cannot work.** With the sidecar flag off,
 *    `MediaWorkspaceHost` returns `null`, so nothing in the app is listening for either event
 *    and a row would be a button that silently does nothing. That state gets its own message
 *    instead.
 * 3. **It never shows a progress bar it did not measure.** The bar appears only for files
 *    Study OS has probed a duration for; everything else states the timestamp it actually has.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MEDIA_WORKSPACE_OPEN_EVENT,
  STUDY_REVIEW_FOCUS_EVENT,
} from '../../shared/mediaWorkspace';
import type { SeanimeStatus } from '../../shared/seanime';
import {
  continueWatchingResumeSec,
  formatContinueWatchingPosition,
  type ContinueWatchingEntry,
} from '../../shared/seanimeContinueWatching';
import type { MediaItem } from '../../shared/types';
import { readContinueWatching } from '../continueWatchingStore';
import { useT } from '../i18n';
import Icon from '../components/Icons';
import type { WidgetProps } from './types';

/** Matches the other live widgets' cadence (`useStatsSummary` in `study.tsx`). */
const REFRESH_MS = 30_000;
/**
 * A row's **tallest** form — the one carrying a progress bar — measured in the harness at
 * the real default frame, plus the flex gap between rows. Estimating this low is not a
 * cosmetic error: `.wgt-cw-list` clips rather than scrolls, so an over-count silently cuts
 * the last row in half. The first cut of this widget used 46 and clipped 51px at the
 * default size and 32px at the minimum.
 */
const ROW_PX = 55;
const ROW_GAP_PX = 6;
/** The "N more not shown" line plus the column gap above it. Reserved only when it shows. */
const MORE_LINE_PX = 21;
/**
 * `WidgetFrame` passes `widget.h - 30` (the title bar) but not `.widget-body`'s own
 * `10px 12px` padding, so the height this component receives is 20px more than it can
 * actually draw in.
 */
const BODY_PADDING_PX = 20;
/** A hard ceiling regardless of frame height — past this the widget is a view, not a widget. */
const MAX_ROWS = 8;

export function ContinueWatchingWidget({ size }: WidgetProps) {
  const { t } = useT();
  const [entries, setEntries] = useState<ContinueWatchingEntry[] | null>(null);
  const [sidecar, setSidecar] = useState<SeanimeStatus['kind'] | null>(null);

  const refresh = useCallback(() => {
    // Show the localStorage-only answer immediately, then enrich it with the media
    // library. Waiting on IPC would make a slow main process look like an empty history.
    setEntries(readContinueWatching());
    if (typeof window.api?.listMedia !== 'function') return;
    void window.api.listMedia()
      .then((items: MediaItem[]) => setEntries(readContinueWatching(items)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    // Guarded exactly like `MediaWorkspaceHost`: under Vite HMR the renderer can reload
    // while an older main process is still live, and an unguarded invoke becomes an
    // unhandled rejection in the app's error boundary.
    if (typeof window.api?.seanimeStatus !== 'function') {
      setSidecar('disabled');
      return;
    }
    void window.api.seanimeStatus()
      .then((status) => setSidecar(status.kind))
      .catch(() => setSidecar('disabled'));
    return window.api.onSeanimeStatus((status) => setSidecar(status.kind));
  }, []);

  const resume = useCallback((entry: ContinueWatchingEntry) => {
    window.dispatchEvent(new CustomEvent(MEDIA_WORKSPACE_OPEN_EVENT, {
      detail: {
        localFilePath: entry.localFilePath,
        startAtSec: continueWatchingResumeSec(entry),
      },
    }));
  }, []);

  const review = useCallback((entry: ContinueWatchingEntry) => {
    window.dispatchEvent(new CustomEvent(STUDY_REVIEW_FOCUS_EVENT, {
      detail: { pathKey: entry.pathKey, title: entry.title },
    }));
  }, []);

  // n rows occupy `n * ROW_PX + (n - 1) * ROW_GAP_PX`, hence the added gap on both sides.
  const fit = (available: number): number => Math.max(1, Math.min(
    MAX_ROWS,
    Math.floor((available + ROW_GAP_PX) / (ROW_PX + ROW_GAP_PX)),
  ));
  const usable = size.h - BODY_PADDING_PX;
  const total = entries?.length ?? 0;
  // Two passes, because the truncation line only exists if there is truncation, and it
  // takes height from the very list that decides whether there is any. Reserving it
  // unconditionally would lose a row on every frame that fits exactly.
  const firstPass = fit(usable);
  const rows = total > firstPass ? fit(usable - MORE_LINE_PX) : firstPass;
  const shown = useMemo(() => entries?.slice(0, rows) ?? [], [entries, rows]);
  const hidden = total - shown.length;

  // Order matters: the flag being off explains an empty list, so it is answered first.
  if (sidecar === 'disabled') {
    return (
      <div className="wgt wgt-cw">
        <p className="wgt-empty">{t('widgets.continueWatching.serverOff')}</p>
      </div>
    );
  }
  if (entries === null || sidecar === null) {
    return (
      <div className="wgt wgt-cw">
        <p className="wgt-empty">{t('common.loading')}</p>
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="wgt wgt-cw">
        <p className="wgt-empty">
          {t('widgets.continueWatching.empty')}
          <br />
          <span className="wgt-cw-hint">{t('widgets.continueWatching.emptyHint')}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="wgt wgt-cw">
      <ul className="wgt-cw-list">
        {shown.map((entry) => (
          <Row key={entry.pathKey} entry={entry} onResume={resume} onReview={review} />
        ))}
      </ul>
      {/* A silent truncation reads as "that is all of them". */}
      {hidden > 0 ? (
        <p className="wgt-cw-more">{t('widgets.continueWatching.more', { count: hidden })}</p>
      ) : null}
    </div>
  );
}

function Row({
  entry,
  onResume,
  onReview,
}: {
  entry: ContinueWatchingEntry;
  onResume: (entry: ContinueWatchingEntry) => void;
  onReview: (entry: ContinueWatchingEntry) => void;
}) {
  const { t } = useT();
  const position = formatContinueWatchingPosition(entry.positionSec);
  // Computed inline rather than memoised: it is two string concatenations, and a memo here
  // would need `lang` in its deps to survive a language switch (CLAUDE.md i18n rule 6) for
  // no measurable gain.
  const meta = entry.cards > 0
    ? `${position} · ${t('widgets.continueWatching.cards', { count: entry.cards })}`
    : position;

  return (
    <li className="wgt-cw-item">
      <button
        type="button"
        className="wgt-cw-row"
        // The full path is the disambiguator when two episodes share a display title.
        title={entry.localFilePath}
        aria-label={t('widgets.continueWatching.resumeNamed', {
          title: entry.title,
          time: position,
        })}
        onClick={() => onResume(entry)}
      >
        <span className="wgt-cw-play" aria-hidden="true">
          <Icon name="player" size={11} />
        </span>
        <span className="wgt-cw-main">
          {/* Study content: shown verbatim, never translated. */}
          <span className="wgt-cw-title">{entry.title}</span>
          <span className="wgt-cw-meta">{meta}</span>
          {/* Only where a duration was actually measured — see the module note. */}
          {entry.percent != null ? (
            <span className="wgt-cw-bar" aria-hidden="true">
              <span
                className="wgt-cw-bar-fill"
                style={{ width: `${Math.round(entry.percent * 100)}%` }}
              />
            </span>
          ) : null}
        </span>
      </button>
      {entry.cards > 0 ? (
        <button
          type="button"
          className="wgt-cw-cards"
          // Named by title: "Review cards" repeated down a list gives a screen reader
          // nothing to choose between.
          aria-label={t('widgets.continueWatching.reviewNamed', { title: entry.title })}
          onClick={() => onReview(entry)}
        >
          <Icon name="flashcards" size={12} />
        </button>
      ) : null}
    </li>
  );
}
