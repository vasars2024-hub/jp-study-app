import type { EpubFilterPipelineBreakdown } from '../../shared/mining';

type Props = {
  breakdown: EpubFilterPipelineBreakdown;
  className?: string;
};

export default function EpubFilterPipelinePanel({ breakdown, className }: Props): JSX.Element {
  return (
    <div className={`epub-filter-pipeline${className ? ` ${className}` : ''}`}>
      <p className="muted epub-filter-pipeline-lead">
        Filters stack in order: book occurrences, then dictionary rank (or book rank window), then
        name exclusions. Max common-rank cutoff applies only in EPUB rank-window mode.
      </p>
      <ol className="epub-filter-pipeline-steps">
        <li>
          <span>Mined terms</span>
          <b>{breakdown.mined}</b>
        </li>
        {breakdown.steps.map((step) => (
          <li key={step.id}>
            <span>
              {step.label}
              {step.detail ? <em className="muted"> — {step.detail}</em> : null}
            </span>
            <b>{step.count}</b>
          </li>
        ))}
        <li className="epub-filter-pipeline-final">
          <span>Final cards</span>
          <b>{breakdown.final}</b>
        </li>
      </ol>
    </div>
  );
}
