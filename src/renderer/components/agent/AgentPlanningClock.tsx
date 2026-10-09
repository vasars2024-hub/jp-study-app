/**
 * How long a plan has been running, while it runs.
 *
 * A local plan can take 10-30 s, most of it loading the model on the first request after an
 * idle unload, and the composer used to say only "Planning…" for all of it. This counts the
 * seconds and, when the offline model has to load first, says that is the slow part.
 */
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';

export function AgentPlanningClock({ startedAt, modelLoading }: { startedAt: number; modelLoading: boolean }) {
  const { t } = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [startedAt]);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return (
    <p className="agent-plan-notice agent-planning-clock" aria-live="off">
      {t('agent2.plan.elapsed', { seconds })}
      {modelLoading ? ` ${t('agent2.plan.modelLoading')}` : ''}
    </p>
  );
}
