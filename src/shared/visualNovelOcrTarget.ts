export const VISUAL_NOVEL_OCR_TARGET_KEY = 'jp-vn-lens-capture-target-v1';
export const VISUAL_NOVEL_OCR_TARGET_MAX_AGE_MS = 30 * 60 * 1000;

export interface VisualNovelOcrTarget {
  visualNovelId: string;
  title: string;
  routeId: string;
  chapter: string;
  scene: string;
  createdAt: number;
}

const clean = (value: unknown, limit: number): string => (
  typeof value === 'string' ? value.trim().slice(0, limit) : ''
);

export function normalizeVisualNovelOcrTarget(
  value: unknown,
  now = Date.now(),
): VisualNovelOcrTarget | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const visualNovelId = clean(candidate.visualNovelId, 160);
  const title = clean(candidate.title, 240);
  const createdAt = typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt)
    ? candidate.createdAt
    : 0;
  if (
    !visualNovelId
    || !title
    || createdAt <= 0
    || createdAt > now + 60_000
    || now - createdAt > VISUAL_NOVEL_OCR_TARGET_MAX_AGE_MS
  ) {
    return null;
  }
  return {
    visualNovelId,
    title,
    routeId: clean(candidate.routeId, 160),
    chapter: clean(candidate.chapter, 240),
    scene: clean(candidate.scene, 240),
    createdAt,
  };
}

export function parseVisualNovelOcrTarget(
  raw: string | null,
  now = Date.now(),
): VisualNovelOcrTarget | null {
  if (!raw) return null;
  try {
    return normalizeVisualNovelOcrTarget(JSON.parse(raw), now);
  } catch {
    return null;
  }
}
