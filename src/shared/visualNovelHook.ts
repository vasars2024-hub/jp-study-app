import type { VisualNovelTextKind } from './visualNovel';

export const VISUAL_NOVEL_HOOK_LINE_LIMIT = 500;
export const VISUAL_NOVEL_HOOK_TEXT_LIMIT = 2_000;

export interface VisualNovelHookLine {
  japanese: string;
  speaker: string;
  kind: VisualNovelTextKind;
}

export interface VisualNovelHookState {
  visualNovelId: string;
  active: boolean;
  filePath: string;
  capturedLines: number;
  lastError: string;
}

export function parseVisualNovelHookLine(value: string): VisualNovelHookLine | null {
  const normalized = value
    .replace(/^\uFEFF/, '')
    .replace(/^\s*(?:\[\d{1,2}:\d{2}(?::\d{2})?\]|\d{1,2}:\d{2}(?::\d{2})?)\s*/, '')
    .trim();
  if (!normalized || !/[\u3040-\u30ff\u3400-\u9fff]/u.test(normalized)) return null;

  const speakerMatch = normalized.match(/^(?:【([^】]{1,80})】|\[([^\]]{1,80})\]|([^：:\s]{1,40})[：:])\s*(.+)$/u);
  const speaker = speakerMatch
    ? (speakerMatch[1] ?? speakerMatch[2] ?? speakerMatch[3] ?? '').trim()
    : '';
  const japanese = (speakerMatch?.[4] ?? normalized).trim().slice(0, VISUAL_NOVEL_HOOK_TEXT_LIMIT);
  if (!japanese || !/[\u3040-\u30ff\u3400-\u9fff]/u.test(japanese)) return null;
  return {
    japanese,
    speaker,
    kind: speaker ? 'dialogue' : 'narration',
  };
}

export function parseVisualNovelHookChunk(value: string): VisualNovelHookLine[] {
  return value
    .split(/\r?\n/u)
    .slice(0, VISUAL_NOVEL_HOOK_LINE_LIMIT)
    .flatMap((line) => {
      const parsed = parseVisualNovelHookLine(line);
      return parsed ? [parsed] : [];
    });
}
