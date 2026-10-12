/**
 * Release notes, rendered: the safe Markdown subset `shared/releaseMarkdown.ts`
 * parses, mapped to React elements. No `dangerouslySetInnerHTML` anywhere — any
 * HTML in the notes reaches the screen as the text it is.
 *
 * A link is a real `<a href>` (so it reads as a link and shows its address), but
 * activating it goes through main (`appUpdateOpenLink`), which re-checks that it
 * is this project's GitHub page before `shell.openExternal`; the renderer never
 * navigates. Other addresses were already turned into text by the parser.
 */
import { Fragment, useMemo, type JSX, type MouseEvent, type ReactNode } from 'react';
import { useT } from '../../../i18n';
import { parseReleaseMarkdown, type MdBlock, type MdInline, type MdList } from '../../../../shared/releaseMarkdown';

const NOTES_STYLE = { maxHeight: 260, overflow: 'auto', userSelect: 'text' } as const;
const CODE_STYLE = { fontFamily: 'var(--font-mono, monospace)' } as const;
const PRE_STYLE = { fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'pre-wrap', margin: '4px 0' } as const;
// The accent WHEN IT IS TEXT (styles.css `--accent-text`): readable in every theme.
const LINK_STYLE = { color: 'var(--accent-text, inherit)', textDecoration: 'underline', textUnderlineOffset: 2 } as const;
const QUOTE_STYLE = { margin: '4px 0', paddingInlineStart: 10, borderInlineStart: '3px solid var(--border, currentColor)' } as const;

function openLink(event: MouseEvent<HTMLAnchorElement>, href: string): void {
  event.preventDefault();
  void window.api?.appUpdateOpenLink?.(href);
}

function Inline({ nodes, linkLabel }: { nodes: MdInline[]; linkLabel: (label: string) => string }): JSX.Element {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.t) {
          case 'text':
            return <Fragment key={i}>{node.v}</Fragment>;
          case 'br':
            return <br key={i} />;
          case 'code':
            return <code key={i} style={CODE_STYLE}>{node.v}</code>;
          case 'strong':
            return <strong key={i}><Inline nodes={node.c} linkLabel={linkLabel} /></strong>;
          case 'em':
            return <em key={i}><Inline nodes={node.c} linkLabel={linkLabel} /></em>;
          case 'link':
            return (
              <a
                key={i}
                href={node.href}
                className="upd3-notes-link"
                style={LINK_STYLE}
                title={linkLabel(node.href)}
                rel="noreferrer noopener"
                onClick={(event) => openLink(event, node.href)}
              >
                <Inline nodes={node.c} linkLabel={linkLabel} />
              </a>
            );
          default:
            return null;
        }
      })}
    </>
  );
}

function List({ list, linkLabel }: { list: MdList; linkLabel: (label: string) => string }): JSX.Element {
  const items = list.items.map((item, i) => (
    <li key={i}>
      <Inline nodes={item.c} linkLabel={linkLabel} />
      {item.sub ? <List list={item.sub} linkLabel={linkLabel} /> : null}
    </li>
  ));
  return list.ordered ? <ol start={list.start}>{items}</ol> : <ul>{items}</ul>;
}

function Block({ block, linkLabel }: { block: MdBlock; linkLabel: (label: string) => string }): ReactNode {
  switch (block.t) {
    case 'heading': {
      // Inside a settings card (h3) and the notes section (h4): h5, then h6.
      const content = <Inline nodes={block.c} linkLabel={linkLabel} />;
      return block.level <= 2 ? <h5 className="upd3-notes-h">{content}</h5> : <h6 className="upd3-notes-h">{content}</h6>;
    }
    case 'paragraph':
      return <p><Inline nodes={block.c} linkLabel={linkLabel} /></p>;
    case 'list':
      return <List list={block} linkLabel={linkLabel} />;
    case 'code':
      return <pre style={PRE_STYLE}><code>{block.v}</code></pre>;
    case 'quote':
      return <blockquote style={QUOTE_STYLE}><Inline nodes={block.c} linkLabel={linkLabel} /></blockquote>;
    case 'rule':
      return <hr />;
    default:
      return null;
  }
}

export default function ReleaseNotesMarkdown({ source, emptyText }: { source: string; emptyText: string }) {
  const { t, lang } = useT();
  const blocks = useMemo(() => parseReleaseMarkdown(source), [source]);
  // `lang`, not `t`: t's identity is stable across a language switch. (No eslint-disable:
  // react-hooks/exhaustive-deps is not a configured rule in this repo.)
  const linkLabel = useMemo(() => (label: string) => t('upd3.notes.linkLabel', { label }), [lang]);
  return (
    <div className="upd2-notes-body upd3-notes-md" style={NOTES_STYLE}>
      {blocks.length ? blocks.map((block, i) => <Fragment key={i}>{Block({ block, linkLabel })}</Fragment>) : <p>{emptyText}</p>}
    </div>
  );
}
