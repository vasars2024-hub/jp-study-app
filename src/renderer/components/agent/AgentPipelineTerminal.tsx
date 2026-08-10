import { useEffect, useRef } from 'react';
import {
  pipelineCommandLabel,
  pipelineHasDiscrepancy,
  type AgentPipelineLine,
  type AgentPipelineVerdict,
} from '../../../shared/agentPipelineTrace';
import { useT } from '../../i18n';
import CollapsibleSection from '../CollapsibleSection';

const VERDICT_KEY: Record<AgentPipelineVerdict, string> = {
  verified: 'agent.pipeline.verdict.verified',
  partial: 'agent.pipeline.verdict.partial',
  missing: 'agent.pipeline.verdict.missing',
  unverifiable: 'agent.pipeline.verdict.unverifiable',
};

/**
 * The Agent's pipeline, rendered as a terminal.
 *
 * Two things are shown per step and they are deliberately not merged: what the
 * Agent CLAIMED (the command and its arguments, left of the arrow) and what was
 * actually found in the user's data afterwards (right of the arrow). A step that
 * reports success while writing nothing therefore reads as a discrepancy instead
 * of as a green line, which is the entire reason this view exists.
 *
 * It is a read-out, not a control surface: nothing here can re-run or alter a
 * step. Every action the Agent can take remains available by hand in its own
 * panel, so this view never becomes the only route to something.
 */
export function AgentPipelineTerminal({
  lines,
  onClear,
}: {
  lines: readonly AgentPipelineLine[];
  onClear?: () => void;
}) {
  const { t } = useT();
  const tailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tailRef.current?.scrollIntoView({ block: 'nearest' });
  }, [lines.length]);

  const flagged = pipelineHasDiscrepancy(lines);

  return (
    <CollapsibleSection
      title={t('agent.pipeline.title')}
      summary={
        lines.length
          ? t('agent.pipeline.summary.steps', { count: lines.length })
          : t('agent.pipeline.summary.empty')
      }
      defaultOpen={lines.length > 0}
      className="mining-collapse anki-card agent-pipeline"
    >
      <div className="ai-studio-log-toolbar">
        <p className="muted collapse-lead">{t('agent.pipeline.lead')}</p>
        {lines.length > 0 && onClear && (
          <button className="btn" type="button" onClick={onClear}>
            {t('agent.pipeline.clear')}
          </button>
        )}
      </div>

      {flagged && (
        <div className="banner mining-warning agent-pipeline-alert">
          {t('agent.pipeline.discrepancy')}
        </div>
      )}

      <div className="ai-studio-log-body agent-pipeline-body" role="log" aria-live="polite">
        {lines.length === 0 ? (
          <p className="muted ai-studio-log-empty">{t('agent.pipeline.empty')}</p>
        ) : (
          lines.map((line) => (
            <div
              className={`agent-pipeline-line is-${line.status} verdict-${line.verdict}`}
              key={`${line.seq}-${line.operation}`}
            >
              <div className="agent-pipeline-command">
                <span className="agent-pipeline-seq">{line.seq}</span>
                <span className="agent-pipeline-op">{pipelineCommandLabel(line.operation)}</span>
                {line.argumentSummary && (
                  <span className="agent-pipeline-args">{line.argumentSummary}</span>
                )}
              </div>
              <div className="agent-pipeline-result">
                <span aria-hidden="true" className="agent-pipeline-arrow">
                  →
                </span>
                {line.status === 'failed' ? (
                  <span className="agent-pipeline-error">
                    {line.error || t('agent.pipeline.failed')}
                  </span>
                ) : (
                  <>
                    {line.claimedIds.length > 0 && (
                      <span className="agent-pipeline-count">
                        {t('agent.pipeline.found', {
                          found: line.foundIds.length,
                          claimed: line.claimedIds.length,
                          entityType: line.entityType ?? '',
                        })}
                      </span>
                    )}
                    <span className={`agent-pipeline-verdict is-${line.verdict}`}>
                      {t(VERDICT_KEY[line.verdict])}
                    </span>
                    {line.destination && (
                      <span className="agent-pipeline-destination">
                        {t('agent.pipeline.destination', { place: line.destination })}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={tailRef} />
      </div>
    </CollapsibleSection>
  );
}
