/**
 * The workflow → Reading Lens capture handoff.
 *
 * A workflow that opens the lens on its own behalf parks one of these before
 * calling `lensOpen`: the lens is a separate always-on-top window created by
 * the main process, so there are no props to pass and the two renderers only
 * share their `localhost` origin.
 *
 * What travels is the workflow's identity and the identifiers its own save
 * action needs. What the lens then stamps on the capture is `sourceLabel` and
 * `sourceRef` — the two provenance fields `ReadingLensCapture` already
 * defines — so a recorded capture says where it came from instead of the
 * workflow keeping that knowledge to itself. Both are **derived here** on
 * read rather than trusted from storage, so a stored target cannot claim a
 * provenance its own fields do not support.
 */

export const LENS_CAPTURE_TARGET_KEY = 'jp-lens-capture-target-v1';
export const LENS_CAPTURE_TARGET_MAX_AGE_MS = 30 * 60 * 1000;

export const LENS_CAPTURE_TARGET_WORKFLOWS = ['visual-novel', 'manga'] as const;
export type LensCaptureTargetWorkflow = (typeof LENS_CAPTURE_TARGET_WORKFLOWS)[number];

export interface VisualNovelCaptureFields {
  visualNovelId: string;
  title: string;
  routeId: string;
  chapter: string;
  scene: string;
}

export interface VisualNovelCaptureTarget {
  workflow: 'visual-novel';
  /** Human context for the capture record. */
  sourceLabel: string;
  /** Addressable pointer back to the place the capture was taken from. */
  sourceRef: string;
  createdAt: number;
  visualNovel: VisualNovelCaptureFields;
}

export interface MangaCaptureFields {
  mangaId: string;
  title: string;
  /** Chapter number when the item came from a provider; '' for a plain import. */
  chapter: string;
  /** 1-based page number as shown in the reader, stringified for the ref. */
  page: string;
}

export interface MangaCaptureTarget {
  workflow: 'manga';
  sourceLabel: string;
  sourceRef: string;
  createdAt: number;
  manga: MangaCaptureFields;
}

export type LensCaptureTarget = VisualNovelCaptureTarget | MangaCaptureTarget;

/** Both bounds match `normalizeReadingLensCapture`, which truncates past them. */
const MAX_SOURCE_LABEL = 240;
const MAX_SOURCE_REF = 1_000;
const MAX_ID = 160;
const MAX_CONTEXT = 240;

const clean = (value: unknown, limit: number): string => (
  typeof value === 'string' ? value.trim().slice(0, limit) : ''
);

/** Joins the pieces that fit, so a long title never truncates mid-context. */
function boundedLabel(parts: readonly string[]): string {
  let label = '';
  for (const part of parts) {
    if (!part) continue;
    const next = label ? `${label} · ${part}` : part;
    if (next.length > MAX_SOURCE_LABEL) break;
    label = next;
  }
  return label;
}

/**
 * Percent-encodes `value` and drops trailing characters until it fits.
 *
 * Slicing the encoded form instead would cut an escape in half; Japanese
 * titles are three bytes — nine encoded characters — each, so a 240-character
 * chapter name alone can exceed the whole ref budget.
 */
function boundedEncode(value: string, limit: number): string {
  let raw = value;
  let encoded = encodeURIComponent(raw);
  while (encoded.length > limit && raw.length > 0) {
    raw = raw.slice(0, Math.max(0, Math.floor(raw.length * 0.8) - 1));
    encoded = encodeURIComponent(raw);
  }
  return encoded;
}

/** Appends `key=value` only when the whole ref still fits. */
function withParam(ref: string, key: string, value: string): string {
  if (!value) return ref;
  const encoded = encodeURIComponent(value);
  const next = `${ref}${ref.includes('?') ? '&' : '?'}${key}=${encoded}`;
  return next.length <= MAX_SOURCE_REF ? next : ref;
}

export function visualNovelCaptureRef(fields: VisualNovelCaptureFields): string {
  let ref = `vn:${boundedEncode(fields.visualNovelId, MAX_SOURCE_REF - 3)}`;
  ref = withParam(ref, 'route', fields.routeId);
  ref = withParam(ref, 'chapter', fields.chapter);
  ref = withParam(ref, 'scene', fields.scene);
  return ref;
}

export function visualNovelCaptureLabel(fields: VisualNovelCaptureFields): string {
  return boundedLabel([fields.title, fields.chapter, fields.scene]);
}

export function buildVisualNovelCaptureTarget(
  fields: VisualNovelCaptureFields,
  createdAt = Date.now(),
): VisualNovelCaptureTarget {
  const visualNovel: VisualNovelCaptureFields = {
    visualNovelId: clean(fields.visualNovelId, MAX_ID),
    title: clean(fields.title, MAX_CONTEXT),
    routeId: clean(fields.routeId, MAX_ID),
    chapter: clean(fields.chapter, MAX_CONTEXT),
    scene: clean(fields.scene, MAX_CONTEXT),
  };
  return {
    workflow: 'visual-novel',
    sourceLabel: visualNovelCaptureLabel(visualNovel),
    sourceRef: visualNovelCaptureRef(visualNovel),
    createdAt,
    visualNovel,
  };
}

export function mangaCaptureRef(fields: MangaCaptureFields): string {
  let ref = `manga:${boundedEncode(fields.mangaId, MAX_SOURCE_REF - 6)}`;
  ref = withParam(ref, 'chapter', fields.chapter);
  ref = withParam(ref, 'page', fields.page);
  return ref;
}

export function mangaCaptureLabel(fields: MangaCaptureFields): string {
  // The page is what makes one manga capture distinguishable from the next, so
  // it is a part of the label rather than only of the ref.
  return boundedLabel([
    fields.title,
    fields.chapter ? `Ch. ${fields.chapter}` : '',
    fields.page ? `p. ${fields.page}` : '',
  ]);
}

export function buildMangaCaptureTarget(
  fields: MangaCaptureFields,
  createdAt = Date.now(),
): MangaCaptureTarget {
  const manga: MangaCaptureFields = {
    mangaId: clean(fields.mangaId, MAX_ID),
    title: clean(fields.title, MAX_CONTEXT),
    chapter: clean(fields.chapter, MAX_CONTEXT),
    page: clean(fields.page, MAX_ID),
  };
  return {
    workflow: 'manga',
    sourceLabel: mangaCaptureLabel(manga),
    sourceRef: mangaCaptureRef(manga),
    createdAt,
    manga,
  };
}

export function normalizeLensCaptureTarget(
  value: unknown,
  now = Date.now(),
): LensCaptureTarget | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const createdAt = typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt)
    ? candidate.createdAt
    : 0;
  if (
    createdAt <= 0
    || createdAt > now + 60_000
    || now - createdAt > LENS_CAPTURE_TARGET_MAX_AGE_MS
  ) {
    return null;
  }
  if (candidate.workflow === 'visual-novel') {
    const payload = candidate.visualNovel;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const fields = payload as Record<string, unknown>;
    const target = buildVisualNovelCaptureTarget({
      visualNovelId: clean(fields.visualNovelId, MAX_ID),
      title: clean(fields.title, MAX_CONTEXT),
      routeId: clean(fields.routeId, MAX_ID),
      chapter: clean(fields.chapter, MAX_CONTEXT),
      scene: clean(fields.scene, MAX_CONTEXT),
    }, createdAt);
    // A target with no novel and no name cannot address anything.
    if (!target.visualNovel.visualNovelId || !target.visualNovel.title) return null;
    return target;
  }
  if (candidate.workflow === 'manga') {
    const payload = candidate.manga;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const fields = payload as Record<string, unknown>;
    const target = buildMangaCaptureTarget({
      mangaId: clean(fields.mangaId, MAX_ID),
      title: clean(fields.title, MAX_CONTEXT),
      chapter: clean(fields.chapter, MAX_CONTEXT),
      page: clean(fields.page, MAX_ID),
    }, createdAt);
    // Same rule as the novel: no item and no name addresses nothing. The page
    // is allowed to be absent — a capture from an unpaginated view still points
    // at the right book.
    if (!target.manga.mangaId || !target.manga.title) return null;
    return target;
  }
  return null;
}

export function parseLensCaptureTarget(
  raw: string | null,
  now = Date.now(),
): LensCaptureTarget | null {
  if (!raw) return null;
  try {
    return normalizeLensCaptureTarget(JSON.parse(raw), now);
  } catch {
    return null;
  }
}
