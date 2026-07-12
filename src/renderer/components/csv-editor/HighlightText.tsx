import { buildSearchPattern } from '../../../shared/csvEditorTransforms';

type Props = {
  text: string;
  query: string;
  useRegex: boolean;
};

export default function HighlightText({ text, query, useRegex }: Props) {
  if (!query.trim()) return <>{text}</>;
  const pattern = buildSearchPattern(query, useRegex);
  if (!pattern) return <>{text}</>;

  const parts: Array<{ str: string; match: boolean }> = [];
  let last = 0;
  const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = global.exec(text)) !== null) {
    if (m.index > last) parts.push({ str: text.slice(last, m.index), match: false });
    parts.push({ str: m[0], match: true });
    last = m.index + m[0].length;
    if (m[0].length === 0) {
      global.lastIndex += 1;
    }
  }
  if (last < text.length) parts.push({ str: text.slice(last), match: false });
  if (!parts.length) return <>{text}</>;

  return (
    <>
      {parts.map((p, i) =>
        p.match ? (
          <mark key={i} className="csv-editor-highlight">
            {p.str}
          </mark>
        ) : (
          <span key={i}>{p.str}</span>
        ),
      )}
    </>
  );
}
