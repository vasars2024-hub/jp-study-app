import type { OcrUnsureChar } from './ocrRouterTypes';

/** Keep only candidates still aligned with the current code-point text. */
export function ocrUnsureOf(value: unknown, text?: string): OcrUnsureChar[] {
  if (!value || typeof value !== 'object') return [];
  const raw = value as { text?: unknown; unsure?: unknown };
  const points = [...(text ?? (typeof raw.text === 'string' ? raw.text : ''))];
  if (!Array.isArray(raw.unsure)) return [];
  return raw.unsure.slice(0, 2000).flatMap((fix: OcrUnsureChar) => {
    if (!fix || !Number.isInteger(fix.at) || fix.at < 0 || typeof fix.ch !== 'string' || [...fix.ch].length !== 1 || points[fix.at] !== fix.ch || !Number.isFinite(fix.p) || !Array.isArray(fix.alts)) return [];
    const alts = [...new Set(fix.alts.filter((alt) => typeof alt === 'string' && [...alt].length === 1 && alt.trim() && alt !== fix.ch))].slice(0, 5);
    return alts.length ? [{ at: fix.at, ch: fix.ch, p: Math.max(0, Math.min(1, fix.p)), alts }] : [];
  });
}

export function fixOcrCharacter(text: string, fix: OcrUnsureChar, alternative: string): string | null {
  const points = [...text];
  if (points[fix.at] !== fix.ch || !fix.alts.includes(alternative) || [...alternative].length !== 1) return null;
  points[fix.at] = alternative;
  return points.join('');
}

/** Normalized Lens captures deliberately omit provider detail; attach only validated fixes. */
export function withOcrLineCandidates<T extends { lines: Array<{ text: string }> }>(capture: T, source: readonly unknown[]): T {
  return { ...capture, lines: capture.lines.map((line, i) => ({ ...line, unsure: ocrUnsureOf(source[i], line.text) })) };
}
