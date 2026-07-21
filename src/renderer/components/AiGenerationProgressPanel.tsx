import type { AiGenerationProgress } from '../../shared/mining';
import { useT } from '../i18n';

const PHASE_KEYS: Record<AiGenerationProgress['phase'], string> = {
  invent: 'aiStudio.progress.invent',
  enrich: 'aiStudio.progress.enrich',
  done: 'aiStudio.progress.done',
};

function phasePercent(progress: AiGenerationProgress): number {
  if (progress.total <= 0) return progress.phase === 'done' ? 100 : 0;
  return Math.min(100, Math.round((progress.done / progress.total) * 100));
}

function isIndeterminate(progress: AiGenerationProgress): boolean {
  return progress.phase === 'invent' && progress.done === 0 && progress.total > 0;
}

export default function AiGenerationProgressPanel({
  progress,
  active,
}: {
  progress: AiGenerationProgress | null;
  active: boolean;
}) {
  const { t } = useT();
  if (!active || !progress) return null;

  const pct = phasePercent(progress);
  const indeterminate = isIndeterminate(progress);
  const phaseLabel = t(PHASE_KEYS[progress.phase] ?? 'aiStudio.progress.enrich');

  return (
    <div className="mining-progress-panel ai-gen-progress">
      <div className="mining-progress-head">
        <span className="mining-progress-phase">{phaseLabel}</span>
        <span className="mining-progress-pct">{indeterminate && pct === 0 ? '…' : `${pct}%`}</span>
      </div>
      <div
        className={`mining-progress-track${indeterminate ? ' indeterminate' : ''}`}
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="mining-progress-fill"
          style={indeterminate ? undefined : { width: `${pct}%` }}
        />
      </div>
      {progress.message && <p className="mining-progress-message">{progress.message}</p>}
      {progress.total > 0 && (
        <p className="muted mining-progress-count">
          {progress.done.toLocaleString()} / {progress.total.toLocaleString()}
        </p>
      )}
    </div>
  );
}
