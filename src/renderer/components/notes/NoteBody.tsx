/**
 * A saved note's text, rendered safely.
 *
 * Notes arrive from the media assistant, translations, sentence analysis and
 * the browser extension — the last of which is text from arbitrary pages. So
 * the body is never parsed as HTML: it is split into paragraphs on blank lines
 * and every piece goes through React as a text node, which escapes it. Line
 * breaks inside a paragraph are kept by CSS (`white-space: pre-wrap`).
 */
export default function NoteBody({ text, className }: { text: string; className?: string }): JSX.Element {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div className={`note-body${className ? ` ${className}` : ''}`}>
      {paragraphs.map((p, i) => (
        <p key={i} style={{ whiteSpace: 'pre-wrap', margin: '0 0 0.6em' }}>
          {p}
        </p>
      ))}
    </div>
  );
}
