/**
 * One assistant answer, rendered as the model meant it.
 *
 * Shared by the Study OS Agent workspace and Blanc's central agent panel on
 * purpose: both show the same message from the same store, and a formatting
 * capability that landed in only one of them would be exactly the mode gap the
 * integration rule names. The two surfaces differ only in the class prefix they
 * pass, so each keeps its own material.
 *
 * A **user** message is never routed through here. What the user typed is what
 * the user sees, asterisks included.
 */

import React from 'react';
import {
  hasAgentMarkdown,
  parseAgentMarkdown,
  type AgentMarkdownSpan,
} from '../../../shared/agentMarkdown';

interface AgentMessageTextProps {
  text: string;
  /** `agent-message-text` in Study OS, `blanc-agent-message-text` in Blanc. */
  className: string;
  /** False for user/tool text, which is shown verbatim. */
  markdown?: boolean;
}

function renderSpans(spans: AgentMarkdownSpan[]): React.ReactNode[] {
  return spans.map((span, index) => {
    const key = `${span.kind}-${index}`;
    if (span.kind === 'bold') return <strong key={key}>{span.text}</strong>;
    if (span.kind === 'italic') return <em key={key}>{span.text}</em>;
    if (span.kind === 'code') return <code key={key}>{span.text}</code>;
    return <React.Fragment key={key}>{span.text}</React.Fragment>;
  });
}

export function AgentMessageText({
  text,
  className,
  markdown = true,
}: AgentMessageTextProps): React.ReactElement | null {
  if (!text) return null;
  // A plain answer keeps the exact single paragraph it has always had, so this
  // cannot change the layout of a message that had nothing to format.
  if (!markdown || !hasAgentMarkdown(text)) return <p className={className}>{text}</p>;

  const blocks = parseAgentMarkdown(text);
  return (
    <div className={`${className} ${className}-rich`}>
      {blocks.map((block, index) => {
        const key = `${block.kind}-${index}`;
        if (block.kind === 'code') {
          return (
            <pre key={key} className={`${className}-code`} data-language={block.language || undefined}>
              <code>{block.text}</code>
            </pre>
          );
        }
        if (block.kind === 'heading') {
          // Always an h4 element with the level as data, not h1–h6: these sit
          // inside a message list and must not inject a document outline that
          // competes with the surface's own headings for a screen reader.
          return (
            <h4 key={key} className={`${className}-heading`} data-level={block.level}>
              {renderSpans(block.spans)}
            </h4>
          );
        }
        if (block.kind === 'list') {
          const items = block.items.map((spans, itemIndex) => (
            <li key={itemIndex}>{renderSpans(spans)}</li>
          ));
          return block.ordered ? (
            <ol key={key} className={`${className}-list`}>{items}</ol>
          ) : (
            <ul key={key} className={`${className}-list`}>{items}</ul>
          );
        }
        return (
          <p key={key} className={`${className}-para`}>
            {renderSpans(block.spans)}
          </p>
        );
      })}
    </div>
  );
}
