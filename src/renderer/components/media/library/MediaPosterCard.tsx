/**
 * A library card.
 *
 * The whole primary area is one hit target. It is a `div role="button"` rather
 * than a real `<button>`, which is the correct trade here: a button may not
 * contain the art block's `div`s, and — more importantly — may not contain
 * another interactive control, which the overflow trigger is. So the card takes
 * on `tabIndex` and an Enter/Space handler, and the trigger stays a real button
 * that stops its own click from also opening the item.
 *
 * Two shapes, one component: `poster` (2:3) for series, films and albums, `still`
 * (16:9) for episodes and continue-watching rows.
 */

import { useT } from '../../../i18n';
import Icon from '../../Icons';
import MediaArtwork from './MediaArtwork';
import MediaStatusPill from './MediaStatusPill';
import type { MediaSubtitleStatus } from '../../../../shared/mediaSubtitleStatus';

export type MediaCardVariant = 'poster' | 'still';

/**
 * How the card lays its own parts out. `card` is the grid's stacked poster;
 * `row` is the list view's dense horizontal row.
 *
 * This exists because list view had no layout of its own. The browser handed the
 * uncapped full-pane width to the same stacked card, and the 2:3 art turned a
 * "row" into a 578x945 poster: measured 2026-08-25 in the Video window at
 * 1080x700, 8 titles scrolled **7,560px** in a 464px pane — 0.49 titles on
 * screen at a time, against grid view's 1,060px for the same shelf. The dense
 * view was 7.1x taller than the airy one.
 */
export type MediaCardLayout = 'card' | 'row';

/**
 * Fixed row height for `layout="row"`, in px, including the 1px divider.
 * `ART_HEIGHT` + the card's block padding; the art's own ratio then decides its
 * width, so a poster row and a still row are the same height and different
 * widths rather than the other way round.
 */
export const LIST_ROW_HEIGHT = 84;

/** Grid geometry, shared with the browser so its row height math matches. */
export const CARD_METRICS: Record<
  MediaCardVariant,
  { minColWidth: number; maxColWidth: number; ratio: number; ratioCss: string }
> = {
  // 2:3 is the standard poster; 16:9 matches a video frame, so stills are never
  // letterboxed or cropped to something the source never looked like.
  //
  // `maxColWidth` is what a sparse shelf may grow a card to (`VirtualGrid`), and it
  // is bounded by the card's own height rather than by taste. A poster row is
  // `w * 1.5 + 64 + gap` tall, and the library paints a 447px grid box at the
  // default 1080x700 window: 252 measured 456 and handed a one-item shelf a 9px
  // scrollbar, 240 measures 438 and fits.
  poster: { minColWidth: 168, maxColWidth: 240, ratio: 3 / 2, ratioCss: '2 / 3' },
  still: { minColWidth: 260, maxColWidth: 390, ratio: 9 / 16, ratioCss: '16 / 9' },
};

/** Caption block below the art: two text lines plus a status line. */
const CAPTION_HEIGHT = 64;

export function cardRowHeight(variant: MediaCardVariant, gap: number) {
  return (colWidth: number): number =>
    Math.round(colWidth * CARD_METRICS[variant].ratio) + CAPTION_HEIGHT + gap;
}

/**
 * Exported so the one-title spotlight states a runtime the same way a card does.
 * Named for the card and not `formatDuration`: `stats.ts` already exports that name,
 * and two unrelated exports sharing one is what the architecture audit calls a
 * duplicate-export finding.
 */
export function formatCardDuration(seconds: number | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export interface MediaPosterCardProps {
  variant?: MediaCardVariant;
  /** `card` (default) stacks art over caption; `row` is the list view's dense row. */
  layout?: MediaCardLayout;
  /** Media id used to resolve artwork. */
  artworkId: string | null;
  title: string;
  subtitle?: string;
  /** Top-right chip: `24 / 26` for a series, a runtime for a single file. */
  badge?: string;
  durationSec?: number;
  /** 0..1. Renders the progress bar; null hides it. */
  progress?: number | null;
  status?: MediaSubtitleStatus | null;
  active?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onOpen: () => void;
  onRetryStatus?: () => void;
  /** Rendered as the overflow trigger when provided. */
  onMenu?: (anchor: HTMLElement) => void;
}

export default function MediaPosterCard({
  variant = 'poster',
  layout = 'card',
  artworkId,
  title,
  subtitle,
  badge,
  durationSec,
  progress = null,
  status = null,
  active = false,
  busy = false,
  disabled = false,
  onOpen,
  onRetryStatus,
  onMenu,
}: MediaPosterCardProps) {
  const { t } = useT();
  const chip = badge ?? formatCardDuration(durationSec) ?? undefined;
  const percent = progress !== null && Number.isFinite(progress)
    ? Math.min(100, Math.max(0, Math.round(progress * 100)))
    : null;

  const inert = disabled || busy;
  const open = (): void => {
    if (!inert) onOpen();
  };

  // The card's only nested control. `stopPropagation` is what keeps opening the
  // menu from also opening the item.
  //
  // In `card` layout it overlays the art, which is where a poster grid wants it.
  // In `row` layout the art is ~45px wide, so the same overlay would cover most
  // of the picture — it becomes the row's trailing control instead. Same button,
  // same handler, same label: moved, never removed, because a control that is
  // reachable in one view and not the other is the category 6 regression.
  const moreButton = onMenu ? (
    <button
      type="button"
      // 26x26 by design — a poster overlay must not grow. `lq-hit-placed`
      // is the `.lq-hit` expander without its `position: relative`, which
      // would fight this button's own `position: absolute`.
      className="medialib-card__more lq-hit-placed"
      aria-label={t('media.card.moreActions')}
      onClick={(e) => {
        e.stopPropagation();
        onMenu(e.currentTarget);
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Icon name="chevron" size={13} />
    </button>
  ) : null;

  return (
    <div
      className="medialib-card"
      data-layout={layout}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={title}
      data-active={active || undefined}
      data-busy={busy || undefined}
      aria-disabled={disabled || undefined}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        // Space scrolls the grid otherwise, which is worse than not activating.
        e.preventDefault();
        open();
      }}
    >
      <MediaArtwork
        id={artworkId}
        title={title}
        ratio={CARD_METRICS[variant].ratioCss}
        // The card above carries the title twice — as `aria-label` and as
        // `medialib-card__title` below the art — so the poster is a picture of
        // an item that is already named. Labelling it would announce the title
        // a second time inside its own card.
        decorative
      >
        {chip && <span className="medialib-card__badge">{chip}</span>}
        {percent !== null && percent > 0 && (
          <div
            className="medialib-card__progress"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('media.card.progress', { percent })}
          >
            <i style={{ width: `${percent}%` }} />
          </div>
        )}
        {layout === 'card' && moreButton}
      </MediaArtwork>

      <div className="medialib-card__body">
        <span className="medialib-card__title" title={title}>{title}</span>
        {subtitle && <span className="medialib-card__sub">{subtitle}</span>}
        <MediaStatusPill status={status} onRetry={onRetryStatus} />
      </div>

      {layout === 'row' && moreButton}
    </div>
  );
}
