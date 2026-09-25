import type { MiningEnrichHealth, MiningEnrichProgress } from '../../shared/mining';
import { useT } from '../i18n';
import { formatNumber } from '../stats';

type Props = {
  progress: MiningEnrichProgress | null;
  /** Defaults to true when omitted (simple mining pass). */
  active?: boolean;
  compact?: boolean;
};

function phasePercent(progress: MiningEnrichProgress): number {
  if (progress.total <= 0) return 0;
  return Math.min(100, Math.round((progress.done / progress.total) * 100));
}

function healthSegments(health: MiningEnrichHealth): {
  dictPct: number;
  okPct: number;
  failPct: number;
  pendingPct: number;
} {
  const total = health.dictFields + health.translated + health.failed + health.pending;
  if (total <= 0) {
    return { dictPct: 0, okPct: 0, failPct: 0, pendingPct: 100 };
  }
  return {
    dictPct: (health.dictFields / total) * 100,
    okPct: (health.translated / total) * 100,
    failPct: (health.failed / total) * 100,
    pendingPct: (health.pending / total) * 100,
  };
}

export default function MiningProgressPanel({ progress, active = true, compact }: Props) {
  const { t } = useT();
  if (!active || !progress) return null;

  const PHASE_KEYS: Record<MiningEnrichProgress['phase'], string> = {
    tokenize: 'mining.progress.phase.tokenize',
    gloss: 'mining.progress.phase.gloss',
    translation: 'mining.progress.phase.translation',
    export: 'mining.progress.phase.export',
  };
  const pct = phasePercent(progress);
  const phaseLabel = t(PHASE_KEYS[progress.phase] ?? 'mining.progress.phase.export');
  const health = progress.health;
  const segments = health ? healthSegments(health) : null;

  return (
    <div className={`mining-progress-panel${compact ? ' compact' : ''}`}>
      <div className="mining-progress-head">
        <span className="mining-progress-phase">{phaseLabel}</span>
        <span className="mining-progress-pct">{pct}%</span>
      </div>
      <div className="mining-progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="mining-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {progress.message && <p className="mining-progress-message">{progress.message}</p>}
      {segments && progress.phase === 'translation' && (
        <div className="mining-health">
          <div className="mining-health-track" aria-hidden>
            {segments.dictPct > 0 && (
              <span className="mining-health-seg dict" style={{ width: `${segments.dictPct}%` }} />
            )}
            {segments.okPct > 0 && (
              <span className="mining-health-seg ok" style={{ width: `${segments.okPct}%` }} />
            )}
            {segments.failPct > 0 && (
              <span className="mining-health-seg fail" style={{ width: `${segments.failPct}%` }} />
            )}
            {segments.pendingPct > 0 && (
              <span className="mining-health-seg pending" style={{ width: `${segments.pendingPct}%` }} />
            )}
          </div>
          <div className="mining-health-legend">
            {health!.dictFields > 0 && (
              <span>
                <i className="mining-health-dot dict" />{' '}
                {t('mining.progress.legend.dictionary', { count: health!.dictFields })}
              </span>
            )}
            <span>
              <i className="mining-health-dot ok" />{' '}
              {t('mining.progress.legend.translated', { count: health!.translated })}
            </span>
            {health!.failed > 0 && (
              <span>
                <i className="mining-health-dot fail" />{' '}
                {t('mining.progress.legend.failed', { count: health!.failed })}
              </span>
            )}
            {health!.pending > 0 && (
              <span>
                <i className="mining-health-dot pending" />{' '}
                {t('mining.progress.legend.queued', { count: health!.pending })}
              </span>
            )}
          </div>
        </div>
      )}
      {progress.total > 0 && (
        <p className="muted mining-progress-count">
          {formatNumber(progress.done)} / {formatNumber(progress.total)}
        </p>
      )}
    </div>
  );
}
