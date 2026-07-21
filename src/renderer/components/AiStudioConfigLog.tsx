import { useEffect, useRef } from 'react';
import { useT } from '../i18n';
import CollapsibleSection from './CollapsibleSection';

export type AiStudioLogLine = {
  time: string;
  field: string;
  detail: string;
};

export default function AiStudioConfigLog({
  lines,
  onClear,
}: {
  lines: readonly AiStudioLogLine[];
  onClear?: () => void;
}) {
  const { t } = useT();
  const tailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tailRef.current?.scrollIntoView({ block: 'nearest' });
  }, [lines.length]);

  return (
    <CollapsibleSection
      title={t('aiStudio.log.title')}
      summary={
        lines.length
          ? t('aiStudio.log.summary.entries', { count: lines.length })
          : t('aiStudio.log.summary.empty')
      }
      defaultOpen={lines.length > 0}
      className="mining-collapse anki-card ai-studio-log"
    >
      <div className="ai-studio-log-toolbar">
        <p className="muted collapse-lead">{t('aiStudio.log.lead')}</p>
        {lines.length > 0 && onClear && (
          <button className="btn" type="button" onClick={onClear}>
            {t('aiStudio.log.clear')}
          </button>
        )}
      </div>
      <div className="ai-studio-log-body" role="log" aria-live="polite">
        {lines.length === 0 ? (
          <p className="muted ai-studio-log-empty">{t('aiStudio.log.empty')}</p>
        ) : (
          lines.map((line, index) => (
            <div className="ai-studio-log-line" key={`${line.time}-${line.field}-${index}`}>
              <span className="ai-studio-log-time">{line.time}</span>
              <span className="ai-studio-log-field">{line.field}</span>
              <span className="ai-studio-log-detail">{line.detail}</span>
            </div>
          ))
        )}
        <div ref={tailRef} />
      </div>
    </CollapsibleSection>
  );
}

export function formatLogTime(date = new Date()): string {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function appendStudioLog(
  lines: AiStudioLogLine[],
  field: string,
  detail: string,
  max = 200,
): AiStudioLogLine[] {
  const next = [...lines, { time: formatLogTime(), field, detail }];
  return next.length > max ? next.slice(next.length - max) : next;
}
