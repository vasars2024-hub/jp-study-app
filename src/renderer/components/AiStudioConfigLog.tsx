import { useEffect, useRef } from 'react';
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
  const tailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tailRef.current?.scrollIntoView({ block: 'nearest' });
  }, [lines.length]);

  return (
    <CollapsibleSection
      title="Configuration log"
      summary={lines.length ? `${lines.length} entries` : 'No changes yet'}
      defaultOpen={lines.length > 0}
      className="mining-collapse anki-card ai-studio-log"
    >
      <div className="ai-studio-log-toolbar">
        <p className="muted collapse-lead">
          Terminal-style trace of preset, language, output, mapping, and generation inputs.
        </p>
        {lines.length > 0 && onClear && (
          <button className="btn" type="button" onClick={onClear}>
            Clear log
          </button>
        )}
      </div>
      <div className="ai-studio-log-body" role="log" aria-live="polite">
        {lines.length === 0 ? (
          <p className="muted ai-studio-log-empty">Changes to studio settings will appear here.</p>
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
