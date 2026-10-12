/**
 * The visual novel's small AI helpers that load with the reader: the explain
 * key, and the context-aware AI translation (`vnTranslate`) for a line that has
 * no translation of its own.
 *
 * Offered as a button everywhere a line is shown. It only runs by itself when
 * the learner turned on "Translate mined lines automatically" (Settings > AI;
 * off by default), and then only for a line being MINED without a translation —
 * the card is the place a missing meaning hurts. A failure never blocks the mine:
 * the line is saved exactly as it would have been without AI.
 */
import type { AiStudyResponse } from '../shared/aiStudyCommon';
import type { ContextTranslateResult } from '../shared/aiImmerseLine';
import { currentAiReadiness } from './aiSetupClient';
import { loadAiImmersePrefs } from './aiImmersePrefs';
import { getStudyLang } from './studyEnvironment';
import { getTranslateTarget } from './translateTarget';
import { studyLangOfText } from '../shared/studyLang';
import type { VisualNovelTextCapture } from '../shared/visualNovel';
import { vn5ContextBefore, vn5ContextText } from '../shared/visualNovelStudy5';

/**
 * The reader window's optional AI explain key. Free: the reader's own keys are
 * M, T, R, N, C, Enter and →. Only live while "Use AI features" is on.
 */
export const VN_AI_EXPLAIN_KEY = 'E';

/** E with no modifier, outside a text field, not held down: the AI explain key. */
export function isVnAiExplainKey(event: {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  repeat?: boolean;
  editable?: boolean;
}): boolean {
  if (event.ctrlKey || event.altKey || event.metaKey || event.repeat || event.editable) return false;
  return event.key.toUpperCase() === VN_AI_EXPLAIN_KEY;
}

/** The two lines before `line` (same novel, same scene), as context for a prompt. */
export function vnAiContextFor(
  line: Pick<VisualNovelTextCapture, 'id'>,
  captures: readonly VisualNovelTextCapture[],
  count = 2,
): string {
  return vn5ContextText(vn5ContextBefore(captures, line.id, count));
}

export function vnTranslateWithContext(
  line: VisualNovelTextCapture,
  captures: readonly VisualNovelTextCapture[],
  requestId?: string,
): Promise<AiStudyResponse<ContextTranslateResult>> {
  return window.api.aiImmerseTranslateLine({
    ...(requestId ? { requestId } : {}),
    text: line.japanese,
    context: vnAiContextFor(line, captures),
    speaker: line.speaker ?? '',
    studyLang: studyLangOfText(line.japanese, getStudyLang()),
    targetLang: getTranslateTarget(),
  });
}

/**
 * The line to mine: unchanged, unless it has no translation AND the learner
 * enabled automatic AI translation AND AI can run — then translated, with the
 * translation saved on the capture first so the card and the line agree.
 */
export async function vnLineForMining(
  line: VisualNovelTextCapture,
  captures: readonly VisualNovelTextCapture[],
): Promise<VisualNovelTextCapture> {
  if (line.translation?.trim() || !line.japanese.trim()) return line;
  if (!loadAiImmersePrefs().vnAutoTranslate) return line;
  const ai = currentAiReadiness();
  if (!ai.loaded || !ai.enabled || !ai.ready) return line;
  try {
    const reply = await vnTranslateWithContext(line, captures);
    const translation = reply.ok ? reply.result?.translation.trim() : '';
    if (!translation) return line;
    await window.api.visualNovelUpdateCapture(line.id, { translation }).catch(() => undefined);
    return { ...line, translation };
  } catch {
    return line;
  }
}
