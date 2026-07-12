import type { MiningEnrichHealth, MiningEnrichProgress } from '../../shared/mining';

type Props = {
  progress: MiningEnrichProgress | null;
  active: boolean;
  compact?: boolean;
};

const PHASE_LABELS: Record<MiningEnrichProgress['phase'], string> = {
  tokenize: 'Tokenize',
  gloss: 'Dictionary',
  translation: 'Translate',
  export: 'Export',
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

export default function MiningProgressPanel({ progress, active, compact }: Props) {
  if (!active || !progress) return null;

  const pct = phasePercent(progress);
  const phaseLabel = PHASE_LABELS[progress.phase] ?? progress.phase;
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
                <i className="mining-health-dot dict" /> Dictionary {health!.dictFields.toLocaleString()}
              </span>
            )}
            <span>
              <i className="mining-health-dot ok" /> Translated {health!.translated.toLocaleString()}
            </span>
            {health!.failed > 0 && (
              <span>
                <i className="mining-health-dot fail" /> Failed {health!.failed.toLocaleString()}
              </span>
            )}
            {health!.pending > 0 && (
              <span>
                <i className="mining-health-dot pending" /> Queued {health!.pending.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      )}
      {progress.total > 0 && (
        <p className="muted mining-progress-count">
          {progress.done.toLocaleString()} / {progress.total.toLocaleString()}
        </p>
      )}
    </div>
  );
}
