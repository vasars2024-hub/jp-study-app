/**
 * Turning an AI analysis into something the notebook can keep.
 *
 * A snapshot is the sentence *plus its annotations*, flattened to text — the
 * point being that six months later the notebook entry still explains itself
 * without a second cloud call. That makes the format the durable artifact here,
 * so it lives in one pure function rather than being assembled inline by each
 * caller (the Lens, the extension, an automatic post-analysis hook), which
 * would let the three drift into three different-looking notebook entries.
 *
 * Markdown, because the notebook already renders it and because it survives
 * being pasted anywhere else.
 */

import type { SentenceAnalysisResult, SentenceAnnotation } from './sentenceAnalysisCore';
import {
  hasSection,
  type AnalysisSectionId,
  type SentenceAnalysisPrefs,
} from './sentenceAnalysisPrefs';

export interface AnalysisSnapshot {
  /** One-line title for the notebook row. */
  title: string;
  /** The full markdown body. */
  body: string;
  /** Notebook folder, from preferences. */
  folder: string;
  /** Compact facts the notebook row can show without opening the body. */
  meta: {
    sentence: string;
    lang: string;
    difficulty?: string;
    formality?: string;
    annotations: number;
    source: string;
  };
}

/** Longest title before it is cut — a notebook row is one line. */
const TITLE_MAX = 64;

function title(sentence: string): string {
  const trimmed = sentence.trim();
  return trimmed.length <= TITLE_MAX ? trimmed : `${trimmed.slice(0, TITLE_MAX - 1)}…`;
}

/**
 * The sentence with its annotated spans marked.
 *
 * Highlights are colour in the UI and colour does not survive to plain text, so
 * the span is bracketed instead and keyed to the numbered list below. The
 * mapping is what makes the snapshot readable on its own.
 */
export function markedSentence(result: SentenceAnalysisResult): string {
  if (!result.annotations.length) return result.sentence;
  let out = '';
  let at = 0;
  result.annotations.forEach((annotation, i) => {
    out += result.sentence.slice(at, annotation.start);
    out += `[${result.sentence.slice(annotation.start, annotation.end)}](${i + 1})`;
    at = annotation.end;
  });
  return out + result.sentence.slice(at);
}

function annotationBlock(annotation: SentenceAnnotation, index: number, prefs: SentenceAnalysisPrefs): string {
  const head = [`${index + 1}. **${annotation.headword || annotation.text}**`];
  if (annotation.reading && !annotation.headword) head.push(`（${annotation.reading}）`);
  const tags = [annotation.category, annotation.level].filter(Boolean).join(' · ');
  if (tags) head.push(`_${tags}_`);

  const lines = [head.join(' '), `   ${annotation.meaning}`];
  if (annotation.explanation) lines.push(`   ${annotation.explanation}`);
  if (annotation.formality && hasSection(prefs, 'formality')) {
    lines.push(`   Register: ${annotation.formality}`);
  }
  if (hasSection(prefs, 'examples')) {
    for (const example of annotation.examples) {
      lines.push(`   - ${example.text}${example.translation ? ` — ${example.translation}` : ''}`);
    }
  }
  if (hasSection(prefs, 'vocabulary')) {
    for (const note of annotation.vocabulary) {
      const reading = note.reading ? `（${note.reading}）` : '';
      lines.push(`   - ${note.term}${reading} — ${note.gloss}`);
    }
  }
  return lines.join('\n');
}

function noteList(heading: string, notes: readonly string[]): string[] {
  if (!notes.length) return [];
  return [`**${heading}**`, ...notes.map((note) => `- ${note}`)];
}

/**
 * Build the snapshot.
 *
 * `prefs.snapshot.sections` — not `prefs.sections` — decides what is included:
 * a reader can want formality on screen while every analysis is being read, and
 * not want it filling up their notebook. The two lists are independent on
 * purpose. Sections that were never requested from the model are simply absent
 * from `result`, so the intersection falls out naturally.
 */
export function buildAnalysisSnapshot(
  result: SentenceAnalysisResult,
  prefs: SentenceAnalysisPrefs,
  opts: { lang: string; source: string; sourceLabel?: string },
): AnalysisSnapshot {
  const want = (id: AnalysisSectionId) => prefs.snapshot.sections.includes(id);
  const lines: string[] = [markedSentence(result), ''];

  if (want('translations')) {
    for (const [code, text] of Object.entries(result.translations)) {
      if (text) lines.push(`**${code.toUpperCase()}** ${text}`);
    }
  }
  if (want('literal') && result.literal) lines.push(`**Literal** ${result.literal}`);
  if (want('formality') && result.formality) {
    lines.push(`**Register** ${result.formality.level}${result.formality.note ? ` — ${result.formality.note}` : ''}`);
  }
  if (result.difficulty) lines.push(`**Level** ${result.difficulty}`);
  if (want('structure') && result.structure) lines.push('', `**Structure** ${result.structure}`);

  if (result.annotations.length) {
    lines.push('', '**Annotations**');
    result.annotations.forEach((annotation, i) => {
      lines.push(annotationBlock(annotation, i, prefs));
    });
  }

  if (want('nuance')) lines.push('', ...noteList('Nuance', result.nuance));
  if (want('pitfalls')) lines.push('', ...noteList('Watch out', result.pitfalls));

  if (opts.sourceLabel) lines.push('', `_${opts.sourceLabel}_`);

  return {
    title: title(result.sentence),
    // Collapse the blank runs the conditional sections leave behind, so a
    // snapshot with most sections off does not open with a page of whitespace.
    body: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    folder: prefs.snapshot.folder,
    meta: {
      sentence: result.sentence,
      lang: opts.lang,
      difficulty: result.difficulty,
      formality: result.formality?.level,
      annotations: result.annotations.length,
      source: opts.source,
    },
  };
}
