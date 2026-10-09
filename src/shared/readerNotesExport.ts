/**
 * A book's bookmarks and highlights as Markdown — the export a reader takes to
 * Obsidian, a note app or a study log (ttu and Readwise-style).
 *
 * Pure: headings and the "chapter" lookup come from the caller, so the UI
 * words are translated there and the book's own text (title, bookmark labels,
 * highlighted passages, chapter names) is never touched.
 */

export interface ExportBookmark {
  label: string;
  percent: number;
  createdAt: number;
}

export interface ExportHighlight {
  text: string;
  color: string;
  part?: number;
  createdAt: number;
}

export interface ReaderNotesInput {
  title: string;
  bookmarks: readonly ExportBookmark[];
  highlights: readonly ExportHighlight[];
  /** Chapter name for a reader part, or '' when unknown. */
  chapterOf?: (part: number) => string;
  headings: { bookmarks: string; highlights: string };
}

/** Text safe to put on one Markdown line: no line breaks, no leading block markers. */
function inline(text: string): string {
  return text.replace(/\s+/g, ' ').trim().replace(/^([#>*+-]|\d+\.)\s/, '\\$1 ');
}

/** Markdown, or '' when there is nothing to export. */
export function readerNotesMarkdown(input: ReaderNotesInput): string {
  const bookmarks = [...input.bookmarks].sort((a, b) => a.percent - b.percent);
  const highlights = [...input.highlights].sort(
    (a, b) => (a.part ?? 0) - (b.part ?? 0) || a.createdAt - b.createdAt,
  );
  if (!bookmarks.length && !highlights.length) return '';
  const lines: string[] = [`# ${inline(input.title) || '—'}`];
  if (bookmarks.length) {
    lines.push('', `## ${input.headings.bookmarks}`, '');
    for (const mark of bookmarks) {
      lines.push(`- ${Math.round(Math.min(1, Math.max(0, mark.percent)) * 100)}% — ${inline(mark.label)}`);
    }
  }
  if (highlights.length) {
    lines.push('', `## ${input.headings.highlights}`);
    let lastChapter: string | null = null;
    for (const mark of highlights) {
      const chapter = typeof mark.part === 'number' ? input.chapterOf?.(mark.part)?.trim() ?? '' : '';
      if (chapter && chapter !== lastChapter) {
        lines.push('', `### ${inline(chapter)}`);
        lastChapter = chapter;
      }
      lines.push('', `> ${inline(mark.text)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
