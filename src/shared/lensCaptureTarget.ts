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

export const LENS_CAPTURE_TARGET_WORKFLOWS = [
  'visual-novel',
  'manga',
  'video',
  'document',
  'browser',
] as const;
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

export interface VideoCaptureFields {
  /** Library id when the file is matched; '' for a loose file played directly. */
  mediaId: string;
  title: string;
  /** Episode number as the player shows it; '' for a standalone file. */
  episode: string;
  /**
   * Whole seconds into the file, stringified. A capture from a video is only
   * addressable with the position — the same episode is a different frame a
   * second later — so this is the field that does the work here.
   */
  positionSec: string;
}

export interface VideoCaptureTarget {
  workflow: 'video';
  sourceLabel: string;
  sourceRef: string;
  createdAt: number;
  video: VideoCaptureFields;
}

/** Which loader produced the text on screen; the reader opens all three. */
export const DOCUMENT_CAPTURE_FORMATS = ['pdf', 'epub', 'text'] as const;
export type DocumentCaptureFormat = (typeof DOCUMENT_CAPTURE_FORMATS)[number];

export interface DocumentCaptureFields {
  documentId: string;
  title: string;
  format: DocumentCaptureFormat;
  /** Chapter or section label as the reader shows it; '' when there is none. */
  section: string;
  /** 1-based ordinal of the open chapter/page; '' when unpaginated. */
  page: string;
}

export interface DocumentCaptureTarget {
  workflow: 'document';
  sourceLabel: string;
  sourceRef: string;
  createdAt: number;
  document: DocumentCaptureFields;
}

export interface BrowserCaptureFields {
  /** Absolute http(s) URL. Anything else is refused — see `browserCaptureUrl`. */
  url: string;
  title: string;
}

export interface BrowserCaptureTarget {
  workflow: 'browser';
  sourceLabel: string;
  sourceRef: string;
  createdAt: number;
  browser: BrowserCaptureFields;
}

export type LensCaptureTarget =
  | VisualNovelCaptureTarget
  | MangaCaptureTarget
  | VideoCaptureTarget
  | DocumentCaptureTarget
  | BrowserCaptureTarget;

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

/**
 * Whole non-negative seconds, or '' — a fractional or negative position is not
 * a place in a file, and `NaN` stringifies to a ref that resolves to nothing.
 */
function cleanSeconds(value: unknown): string {
  const raw = typeof value === 'number' ? value : Number(clean(value, MAX_ID));
  if (!Number.isFinite(raw) || raw < 0) return '';
  return String(Math.floor(raw));
}

/** `h:mm:ss` past an hour, `m:ss` below it — how a player itself shows a position. */
export function formatCaptureTimecode(positionSec: string): string {
  if (positionSec === '') return '';
  const total = Number(positionSec);
  if (!Number.isFinite(total) || total < 0) return '';
  const seconds = Math.floor(total % 60);
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(seconds).padStart(2, '0')}`;
}

export function videoCaptureRef(fields: VideoCaptureFields): string {
  let ref = `video:${boundedEncode(fields.mediaId, MAX_SOURCE_REF - 6)}`;
  ref = withParam(ref, 'episode', fields.episode);
  ref = withParam(ref, 't', fields.positionSec);
  return ref;
}

export function videoCaptureLabel(fields: VideoCaptureFields): string {
  // The timecode is in the label for the same reason the manga page is: it is
  // what makes one capture from a two-hour file distinguishable from the next.
  return boundedLabel([
    fields.title,
    fields.episode ? `Ep. ${fields.episode}` : '',
    formatCaptureTimecode(fields.positionSec),
  ]);
}

export function buildVideoCaptureTarget(
  fields: VideoCaptureFields,
  createdAt = Date.now(),
): VideoCaptureTarget {
  const video: VideoCaptureFields = {
    mediaId: clean(fields.mediaId, MAX_ID),
    title: clean(fields.title, MAX_CONTEXT),
    episode: clean(fields.episode, MAX_ID),
    positionSec: cleanSeconds(fields.positionSec),
  };
  return {
    workflow: 'video',
    sourceLabel: videoCaptureLabel(video),
    sourceRef: videoCaptureRef(video),
    createdAt,
    video,
  };
}

export function documentCaptureRef(fields: DocumentCaptureFields): string {
  let ref = `doc:${boundedEncode(fields.documentId, MAX_SOURCE_REF - 4)}`;
  ref = withParam(ref, 'format', fields.format);
  ref = withParam(ref, 'section', fields.section);
  ref = withParam(ref, 'page', fields.page);
  return ref;
}

export function documentCaptureLabel(fields: DocumentCaptureFields): string {
  // The format stays in the ref only. It says which loader ran, which is a fact
  // about the pipeline rather than about the place the reader was looking at.
  return boundedLabel([
    fields.title,
    fields.section,
    fields.page ? `p. ${fields.page}` : '',
  ]);
}

export function buildDocumentCaptureTarget(
  fields: DocumentCaptureFields,
  createdAt = Date.now(),
): DocumentCaptureTarget {
  const document: DocumentCaptureFields = {
    documentId: clean(fields.documentId, MAX_ID),
    title: clean(fields.title, MAX_CONTEXT),
    format: fields.format,
    section: clean(fields.section, MAX_CONTEXT),
    page: clean(fields.page, MAX_ID),
  };
  return {
    workflow: 'document',
    sourceLabel: documentCaptureLabel(document),
    sourceRef: documentCaptureRef(document),
    createdAt,
    document,
  };
}

/**
 * The absolute http(s) URL a browser capture is addressable by, or '' .
 *
 * Two rules, both deliberate. Only `http`/`https` resolve: a `file:`, `data:`
 * or `about:` URL either leaks a local path into a stored record or points at
 * nothing a later reader can open. And embedded credentials are dropped — a
 * `https://user:token@host/…` URL is a secret, and the page it addresses is
 * exactly as reachable without them.
 */
export function browserCaptureUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return '';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
  parsed.username = '';
  parsed.password = '';
  return parsed.toString();
}

export function browserCaptureRef(fields: BrowserCaptureFields): string {
  if (!fields.url) return '';
  return `web:${boundedEncode(fields.url, MAX_SOURCE_REF - 4)}`;
}

export function browserCaptureLabel(fields: BrowserCaptureFields): string {
  let host = '';
  try {
    host = fields.url ? new URL(fields.url).host : '';
  } catch {
    host = '';
  }
  // The host is the second part because a page title alone rarely says where
  // the sentence came from, and the same title recurs across mirrors.
  return boundedLabel([fields.title, host]);
}

export function buildBrowserCaptureTarget(
  fields: BrowserCaptureFields,
  createdAt = Date.now(),
): BrowserCaptureTarget {
  const browser: BrowserCaptureFields = {
    url: browserCaptureUrl(clean(fields.url, MAX_SOURCE_REF)),
    title: clean(fields.title, MAX_CONTEXT),
  };
  return {
    workflow: 'browser',
    sourceLabel: browserCaptureLabel(browser),
    sourceRef: browserCaptureRef(browser),
    createdAt,
    browser,
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
  if (candidate.workflow === 'video') {
    const payload = candidate.video;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const fields = payload as Record<string, unknown>;
    const target = buildVideoCaptureTarget({
      mediaId: clean(fields.mediaId, MAX_ID),
      title: clean(fields.title, MAX_CONTEXT),
      episode: clean(fields.episode, MAX_ID),
      positionSec: cleanSeconds(fields.positionSec),
    }, createdAt);
    // A loose file has no library id, so the title alone has to carry it — but
    // a target with neither addresses nothing, the same rule the readers use.
    if (!target.video.title) return null;
    return target;
  }
  if (candidate.workflow === 'document') {
    const payload = candidate.document;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const fields = payload as Record<string, unknown>;
    const format = DOCUMENT_CAPTURE_FORMATS
      .find((known) => known === fields.format);
    // A format outside the three is a corrupt record rather than a missing
    // field: nothing in the product writes one, so it is refused instead of
    // being folded into a default that would claim the wrong pipeline.
    if (!format) return null;
    const target = buildDocumentCaptureTarget({
      documentId: clean(fields.documentId, MAX_ID),
      title: clean(fields.title, MAX_CONTEXT),
      format,
      section: clean(fields.section, MAX_CONTEXT),
      page: clean(fields.page, MAX_ID),
    }, createdAt);
    if (!target.document.documentId || !target.document.title) return null;
    return target;
  }
  if (candidate.workflow === 'browser') {
    const payload = candidate.browser;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const fields = payload as Record<string, unknown>;
    const target = buildBrowserCaptureTarget({
      url: clean(fields.url, MAX_SOURCE_REF),
      title: clean(fields.title, MAX_CONTEXT),
    }, createdAt);
    // The URL is the whole identity here; `browserCaptureUrl` has already
    // rejected every scheme that is not http(s), so an empty one is a refusal.
    if (!target.browser.url) return null;
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
