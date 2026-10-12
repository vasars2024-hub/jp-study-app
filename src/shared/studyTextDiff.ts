/**
 * A character diff for study-language text: what a correction keeps, removes
 * and adds, so the learner SEES the change rather than reading a replacement
 * sentence and hunting for it (the conversation partner's inline correction,
 * the writing correction's per-change view).
 *
 * Character-level on purpose: Japanese and Chinese have no spaces to diff
 * words by, and a particle change (は → が) is one character.
 *
 * Pure; capped so a pasted essay cannot make the table quadratic in the UI.
 */

export type StudyDiffKind = 'same' | 'removed' | 'added';

export interface StudyDiffPart {
  kind: StudyDiffKind;
  text: string;
}

/** Longer inputs are shown as one removal and one addition rather than aligned. */
export const STUDY_DIFF_MAX_CHARS = 1_200;

export function diffStudyText(before: string, after: string): StudyDiffPart[] {
  const a = [...before];
  const b = [...after];
  if (before === after) return before ? [{ kind: 'same', text: before }] : [];
  if (a.length > STUDY_DIFF_MAX_CHARS || b.length > STUDY_DIFF_MAX_CHARS) {
    return [
      ...(before ? [{ kind: 'removed' as const, text: before }] : []),
      ...(after ? [{ kind: 'added' as const, text: after }] : []),
    ];
  }
  // Longest common subsequence, filled from the end so the walk below goes forward.
  const width = b.length + 1;
  const table = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const parts: StudyDiffPart[] = [];
  const push = (kind: StudyDiffKind, text: string): void => {
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) last.text += text;
    else parts.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push('same', a[i]);
      i += 1;
      j += 1;
    } else if (j < b.length && (i >= a.length || table[i * width + j + 1] >= table[(i + 1) * width + j])) {
      push('added', b[j]);
      j += 1;
    } else {
      push('removed', a[i]);
      i += 1;
    }
  }
  // Removals read before additions inside one change ("は→が", not "が→は").
  for (let k = 0; k + 1 < parts.length; k += 1) {
    if (parts[k].kind === 'added' && parts[k + 1].kind === 'removed') {
      const added = parts[k];
      parts[k] = parts[k + 1];
      parts[k + 1] = added;
    }
  }
  return parts;
}
