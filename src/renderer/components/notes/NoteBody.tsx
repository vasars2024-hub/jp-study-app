import type { JSX, MouseEvent, ReactNode } from 'react';
import { parseNoteMarkdown, type NoteInline } from '../../../shared/userNotes';
import './noteBody.css';
/**
 * A saved note's text, rendered safely.
 *
 * Notes arrive from the media assistant, translations, sentence analysis and
 * the browser extension — the last of which is text from arbitrary pages. So
 * the body is never parsed as HTML: a small Markdown subset
 * (`parseNoteMarkdown`: headings, lists and checkboxes, quotes, code, bold,
 * italic, links) is turned into tokens and every piece goes through React as a
 * text node, which escapes it. Only http(s)/mailto links become links, and they
 * open in the system browser. Line breaks inside a paragraph are kept by CSS
 * (`white-space: pre-wrap`).
 */

function openLink(event: MouseEvent<HTMLAnchorElement>, url: string): void {
  event.preventDefault();
  try {
    const api = (window as { api?: { openExternal?: (u: string) => unknown } }).api;
    if (api?.openExternal) void api.openExternal(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    /* nowhere to open it */
  }
}

function renderInline(tokens: NoteInline[]): ReactNode[] {
  return tokens.map((token, i) => {
    switch (token.t) {
      case 'strong':
        return <strong key={i}>{token.v}</strong>;
      case 'em':
        return <em key={i}>{token.v}</em>;
      case 'code':
        return <code key={i}>{token.v}</code>;
      case 'link':
        return (
          <a key={i} href={token.url} rel="noopener noreferrer" onClick={(e) => openLink(e, token.url)}>
            {token.label}
          </a>
        );
      default:
        return token.v;
    }
  });
}

export default function NoteBody({ text, className }: { text: string; className?: string }): JSX.Element {
  const blocks = parseNoteMarkdown(text);
  return (
    <div className={`note-body${className ? ` ${className}` : ''}`}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading': {
            const Tag = block.level === 1 ? 'h3' : block.level === 2 ? 'h4' : 'h5';
            return (
              <Tag key={i} className="note-body-heading">
                {renderInline(block.inline)}
              </Tag>
            );
          }
          case 'quote':
            return (
              <blockquote key={i} style={{ whiteSpace: 'pre-wrap' }}>
                {renderInline(block.inline)}
              </blockquote>
            );
          case 'code':
            return (
              <pre key={i} className="note-body-code">
                <code>{block.text}</code>
              </pre>
            );
          case 'list': {
            const items = block.items.map((item, k) => (
              <li key={k} className={item.checked === undefined ? undefined : 'note-body-task'}>
                {item.checked === undefined ? null : (
                  <input type="checkbox" checked={item.checked} readOnly disabled aria-hidden="true" />
                )}
                {renderInline(item.inline)}
              </li>
            ));
            return block.ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
          }
          default:
            return (
              <p key={i} style={{ whiteSpace: 'pre-wrap', margin: '0 0 0.6em' }}>
                {renderInline(block.inline)}
              </p>
            );
        }
      })}
    </div>
  );
}
