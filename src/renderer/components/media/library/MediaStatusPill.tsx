/** One-line subtitle/transcription status. No emoji — a coloured dot and text. */
import { useT } from '../../../i18n';
import type { MediaSubtitleStatus } from '../../../../shared/mediaSubtitleStatus';

export interface MediaStatusPillProps {
  status: MediaSubtitleStatus | null;
  /** Rendered as the Retry affordance when the status is actionable. */
  onRetry?: () => void;
  className?: string;
}

export default function MediaStatusPill({ status, onRetry, className = '' }: MediaStatusPillProps) {
  const { t } = useT();
  if (!status) return null;

  const tone = status.tone === 'busy' ? 'busy' : status.tone;

  return (
    <span className={`medialib-pill ${className}`.trim()} data-tone={tone}>
      <span>{t(status.labelKey, status.vars)}</span>
      {status.retryable && onRetry && (
        <button
          type="button"
          className="medialib-pill__retry"
          onClick={(e) => {
            // The pill lives inside a clickable card; without this, Retry would
            // also open the item in the player.
            e.stopPropagation();
            onRetry();
          }}
        >
          {t('media.subStatus.retry')}
        </button>
      )}
    </span>
  );
}
