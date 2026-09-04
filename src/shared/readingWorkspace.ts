/**
 * Versioned contract for the unified Reading workspace.
 *
 * Finder, Novels, and Library currently own different shapes and are being
 * changed independently. This module is deliberately a leaf-level seam: it
 * gives the eventual workspace one route vocabulary and one normalized local
 * record without changing any of those surfaces or their storage.
 */

import {
  readingEditionFromLibraryItem,
  readingProgressFromLibraryItem,
  readingWorkFromLibraryItem,
} from './readingLibraryAdapter';
import type {
  ReadingEdition,
  ReadingProgress,
  ReadingWork,
} from './readingModel';
import type { LibraryItem } from './types';

export const READING_WORKSPACE_SCHEMA_VERSION = 1 as const;

export const READING_WORKSPACE_SECTIONS = [
  'home',
  'discover',
  'library',
  'lists',
  'captures',
  'continue',
  'plan',
  'imports',
  'sources',
] as const;
export type ReadingWorkspaceSection = (typeof READING_WORKSPACE_SECTIONS)[number];

/**
 * The retained surface that currently owns each workspace destination.
 *
 * Keeping this mapping beside the route vocabulary prevents the two legacy
 * desktop aliases from growing their own, contradictory navigation rules
 * while the destination-specific workspace panels converge incrementally.
 */
export type ReadingWorkspaceSurface = 'finder' | 'library' | 'novels' | 'captures' | 'lists';

export function readingWorkspaceSurfaceForSection(
  section: ReadingWorkspaceSection,
): ReadingWorkspaceSurface {
  if (section === 'library') return 'library';
  if (section === 'lists') return 'lists';
  if (section === 'captures') return 'captures';
  if (section === 'plan' || section === 'imports' || section === 'sources') return 'novels';
  return 'finder';
}

export const READING_WORKSPACE_INTENTS = [
  'browse',
  'open',
  'continue',
  'plan',
  'import',
  'sources',
] as const;
export type ReadingWorkspaceIntent = (typeof READING_WORKSPACE_INTENTS)[number];

export type ReadingWorkspaceSourceKind =
  | 'local-library'
  | 'web'
  | 'curated-site'
  | 'jiten'
  | 'provider';

export type ReadingWorkspaceAvailability =
  | 'readable'
  | 'importable'
  | 'external'
  | 'unavailable';

export type ReadingWorkspaceCoverState =
  | 'local-cache'
  | 'remote'
  | 'fallback'
  | 'missing';

export interface ReadingWorkspaceRoute {
  version: typeof READING_WORKSPACE_SCHEMA_VERSION;
  section: ReadingWorkspaceSection;
  intent: ReadingWorkspaceIntent;
  workId?: string;
  editionId?: string;
  itemId?: string;
  /**
   * Which reading list the `lists` section opens on.
   *
   * Its own field rather than a reuse of `workId`: a list and a work are
   * different records with different lifetimes, and a route that says `workId`
   * while carrying a list id is a lie the next reader has to discover.
   */
  listId?: string;
}

export interface ReadingWorkspaceCover {
  state: ReadingWorkspaceCoverState;
  /** Relative local path or validated remote URL; null means use the fallback. */
  ref: string | null;
}

export type ReadingWorkspaceProgressState = 'unstarted' | 'in-progress' | 'complete';

export interface ReadingWorkspaceProgress {
  value: ReadingProgress | null;
  percent: number;
  updatedAt: number;
  state: ReadingWorkspaceProgressState;
}

/** One card-sized record that any Reading surface can render or hand off. */
export interface ReadingWorkspaceEntry {
  version: typeof READING_WORKSPACE_SCHEMA_VERSION;
  /** Stable UI key. Local records are item-scoped even when they share a work. */
  key: string;
  itemId: string | null;
  work: ReadingWork;
  edition: ReadingEdition | null;
  source: {
    kind: ReadingWorkspaceSourceKind;
    id: string;
  };
  availability: ReadingWorkspaceAvailability;
  cover: ReadingWorkspaceCover;
  progress: ReadingWorkspaceProgress;
  level: number | null;
  knownRatio: number | null;
  tags: string[];
}

/** Existing Finder/desktop names stay valid while the workspace gains one vocabulary. */
const SECTION_ALIASES: Record<string, ReadingWorkspaceSection> = {
  home: 'home',
  discover: 'discover',
  reading: 'discover',
  'reading-finder': 'discover',
  readingfinder: 'discover',
  library: 'library',
  captures: 'captures',
  capture: 'captures',
  lens: 'captures',
  continue: 'continue',
  'continue-reading': 'continue',
  continuereading: 'continue',
  plan: 'plan',
  novel: 'plan',
  novels: 'plan',
  imports: 'imports',
  import: 'imports',
  sources: 'sources',
  source: 'sources',
};

const INTENT_SET = new Set<string>(READING_WORKSPACE_INTENTS);
const CONTENT_TYPE_SET = new Set<ReadingWork['contentType']>(['manga', 'novel', 'article']);
const FORMAT_SET = new Set<ReadingEdition['format']>(['image-series', 'epub', 'pdf', 'text']);
const ORIGIN_SET = new Set<ReadingEdition['origin']>(['local', 'provider']);
const SOURCE_KIND_SET = new Set<ReadingWorkspaceSourceKind>([
  'local-library',
  'web',
  'curated-site',
  'jiten',
  'provider',
]);
const AVAILABILITY_SET = new Set<ReadingWorkspaceAvailability>([
  'readable',
  'importable',
  'external',
  'unavailable',
]);
const COVER_STATE_SET = new Set<ReadingWorkspaceCoverState>([
  'local-cache',
  'remote',
  'fallback',
  'missing',
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function optionalId(value: unknown): string | undefined {
  const result = text(value, 240);
  return result || undefined;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clampPercent(value: unknown): number {
  const number = finiteNumber(value);
  return number === null ? 0 : Math.min(1, Math.max(0, number));
}

function progressState(percent: number): ReadingWorkspaceProgressState {
  if (percent >= 0.98) return 'complete';
  return percent > 0 ? 'in-progress' : 'unstarted';
}

function normalizeCoverRef(state: ReadingWorkspaceCoverState, value: unknown): string | null {
  if (state === 'fallback' || state === 'missing') return null;
  const ref = text(value, 2_000);
  if (!ref) return null;
  if (state === 'remote') {
    try {
      const url = new URL(ref);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
    } catch {
      return null;
    }
  }
  return /^(?:javascript|data|vbscript):/iu.test(ref) ? null : ref;
}

export function normalizeReadingWorkspaceSection(value: unknown): ReadingWorkspaceSection | null {
  if (typeof value !== 'string') return null;
  return SECTION_ALIASES[value.trim().toLowerCase()] ?? null;
}

export function defaultReadingWorkspaceRoute(): ReadingWorkspaceRoute {
  return {
    version: READING_WORKSPACE_SCHEMA_VERSION,
    section: 'home',
    intent: 'browse',
  };
}

function normalizeRouteRecord(raw: Record<string, unknown>): ReadingWorkspaceRoute | null {
  if (raw.version !== undefined && raw.version !== READING_WORKSPACE_SCHEMA_VERSION) return null;
  const section = normalizeReadingWorkspaceSection(raw.section);
  if (!section) return null;
  const intent = INTENT_SET.has(raw.intent as string)
    ? raw.intent as ReadingWorkspaceIntent
    : 'browse';
  return {
    version: READING_WORKSPACE_SCHEMA_VERSION,
    section,
    intent,
    ...(optionalId(raw.workId) ? { workId: optionalId(raw.workId) } : {}),
    ...(optionalId(raw.editionId) ? { editionId: optionalId(raw.editionId) } : {}),
    ...(optionalId(raw.itemId) ? { itemId: optionalId(raw.itemId) } : {}),
    ...(optionalId(raw.listId) ? { listId: optionalId(raw.listId) } : {}),
  };
}

/**
 * Accepts both the new object form and old section/deep-link names. Unknown
 * future versions are rejected so a newer app cannot silently reinterpret a
 * route written by a later schema.
 */
export function normalizeReadingWorkspaceRoute(value: unknown): ReadingWorkspaceRoute | null {
  if (typeof value === 'string') {
    const raw = value.trim();
    const alias = normalizeReadingWorkspaceSection(raw);
    if (alias) return normalizeRouteRecord({ section: alias });

    try {
      const url = new URL(raw);
      if (url.protocol !== 'reading:' || url.hostname !== 'workspace') return null;
      const section = url.pathname.replace(/^\/+/, '').split('/')[0] || 'home';
      const versionText = url.searchParams.get('v');
      const version = versionText ? Number(versionText) : READING_WORKSPACE_SCHEMA_VERSION;
      return normalizeRouteRecord({
        version,
        section,
        intent: url.searchParams.get('intent') ?? undefined,
        workId: url.searchParams.get('workId') ?? undefined,
        editionId: url.searchParams.get('editionId') ?? undefined,
        itemId: url.searchParams.get('itemId') ?? undefined,
        listId: url.searchParams.get('listId') ?? undefined,
      });
    } catch {
      return null;
    }
  }
  const raw = record(value);
  return normalizeRouteRecord(raw);
}

/** Stable deep-link form for OS/open events and future persisted handoffs. */
export function serializeReadingWorkspaceRoute(route: ReadingWorkspaceRoute): string {
  const normalized = normalizeReadingWorkspaceRoute(route);
  if (!normalized) throw new Error('Cannot serialize an invalid Reading workspace route.');
  const params = new URLSearchParams({
    v: String(READING_WORKSPACE_SCHEMA_VERSION),
    intent: normalized.intent,
  });
  if (normalized.workId) params.set('workId', normalized.workId);
  if (normalized.editionId) params.set('editionId', normalized.editionId);
  if (normalized.itemId) params.set('itemId', normalized.itemId);
  if (normalized.listId) params.set('listId', normalized.listId);
  return `reading://workspace/${normalized.section}?${params.toString()}`;
}

function normalizeWork(value: unknown): ReadingWork | null {
  const raw = record(value);
  const workId = text(raw.workId, 240);
  const title = text(raw.title, 500);
  if (!workId || !title || !CONTENT_TYPE_SET.has(raw.contentType as ReadingWork['contentType'])) {
    return null;
  }
  return {
    contentType: raw.contentType as ReadingWork['contentType'],
    workId,
    title,
    titleNative: text(raw.titleNative, 500),
    aniListId: finiteIntegerOrNull(raw.aniListId),
    malId: finiteIntegerOrNull(raw.malId),
  };
}

function finiteIntegerOrNull(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && Number.isInteger(number) && number >= 0 ? number : null;
}

function normalizeEdition(value: unknown, workId: string): ReadingEdition | null {
  const raw = record(value);
  const editionId = text(raw.editionId, 240);
  const format = raw.format as ReadingEdition['format'];
  const origin = raw.origin as ReadingEdition['origin'];
  if (!editionId || raw.workId !== workId || !FORMAT_SET.has(format) || !ORIGIN_SET.has(origin)) {
    return null;
  }
  return {
    editionId,
    workId,
    format,
    origin,
    providerId: text(raw.providerId, 240),
    providerLabel: text(raw.providerLabel, 240),
    language: text(raw.language, 40),
    coverRef: text(raw.coverRef, 2_000),
    unitCount: Math.max(0, Math.floor(finiteNumber(raw.unitCount) ?? 0)),
  };
}

function normalizeProgress(value: unknown): ReadingWorkspaceProgress | null {
  const raw = record(value);
  const percent = clampPercent(raw.percent);
  const updatedAt = Math.max(0, finiteNumber(raw.updatedAt) ?? 0);
  const nested = record(raw.value);
  const editionId = text(nested.editionId, 240);
  const locator = normalizeLocator(nested.locator);
  let readingProgress: ReadingProgress | null = null;
  if (editionId && locator) {
    readingProgress = {
      editionId,
      chapterId: optionalId(nested.chapterId) ?? null,
      locator,
      percent,
      updatedAt,
    };
  }
  return {
    value: readingProgress,
    percent,
    updatedAt,
    state: progressState(percent),
  };
}

function normalizeLocator(value: unknown): ReadingProgress['locator'] | null {
  const raw = record(value);
  if (raw.kind === 'page') {
    const index = finiteNumber(raw.index);
    return index !== null && Number.isInteger(index) && index >= 0
      ? { kind: 'page', index }
      : null;
  }
  if (raw.kind === 'part') {
    const part = finiteNumber(raw.part);
    const fraction = finiteNumber(raw.fraction);
    return part !== null && Number.isInteger(part) && part >= 0
      && fraction !== null && fraction >= 0 && fraction <= 1
      ? { kind: 'part', part, fraction }
      : null;
  }
  return null;
}

/** Normalizes a persisted workspace record without trusting nested input. */
export function normalizeReadingWorkspaceEntry(value: unknown): ReadingWorkspaceEntry | null {
  const raw = record(value);
  if (raw.version !== READING_WORKSPACE_SCHEMA_VERSION) return null;
  const work = normalizeWork(raw.work);
  if (!work) return null;
  const edition = raw.edition === null ? null : normalizeEdition(raw.edition, work.workId);
  if (raw.edition !== null && !edition) return null;
  const source = record(raw.source);
  const sourceKind = source.kind as ReadingWorkspaceSourceKind;
  const sourceId = text(source.id, 240);
  const availability = raw.availability as ReadingWorkspaceAvailability;
  const cover = record(raw.cover);
  const coverState = cover.state as ReadingWorkspaceCoverState;
  if (!sourceId || !SOURCE_KIND_SET.has(sourceKind) || !AVAILABILITY_SET.has(availability)) return null;
  if (!COVER_STATE_SET.has(coverState)) return null;
  const coverRef = normalizeCoverRef(coverState, cover.ref);
  if ((coverState === 'remote' || coverState === 'local-cache') && !coverRef) return null;
  const progress = normalizeProgress(raw.progress);
  if (!progress) return null;
  if (progress.value && edition && progress.value.editionId !== edition.editionId) {
    progress.value = null;
  }
  const key = text(raw.key, 500);
  if (!key) return null;
  const level = finiteIntegerOrNull(raw.level);
  const knownRatio = finiteNumber(raw.knownRatio);
  return {
    version: READING_WORKSPACE_SCHEMA_VERSION,
    key,
    itemId: optionalId(raw.itemId) ?? null,
    work,
    edition,
    source: { kind: sourceKind, id: sourceId },
    availability,
    cover: {
      state: coverState,
      ref: coverRef,
    },
    progress,
    level: level !== null && level >= 1 && level <= 7 ? level : null,
    knownRatio: knownRatio === null ? null : Math.min(1, Math.max(0, knownRatio)),
    tags: Array.isArray(raw.tags)
      ? [...new Set(raw.tags.map((tag) => text(tag, 120)).filter(Boolean))].slice(0, 40)
      : [],
  };
}

function sourceForLibraryItem(item: LibraryItem): { kind: ReadingWorkspaceSourceKind; id: string } {
  if (item.readingSource) {
    return {
      kind: 'provider',
      id: text(item.readingSource.providerId, 240) || `provider:${item.id}`,
    };
  }
  const webSource = item.inboxMeta?.sourceUrl ?? item.sourcePath;
  if (typeof webSource === 'string' && /^https?:\/\//i.test(webSource.trim())) {
    return { kind: 'web', id: webSource.trim().slice(0, 240) };
  }
  return { kind: 'local-library', id: 'library' };
}

function levelForLibraryItem(item: LibraryItem): number | null {
  const level = item.inboxMeta?.levelEstimate ?? item.levelMeta?.levelEstimate;
  return typeof level === 'number' && Number.isInteger(level) && level >= 1 && level <= 7
    ? level
    : null;
}

function knownRatioForLibraryItem(item: LibraryItem): number | null {
  const ratio = item.inboxMeta?.knownRatio ?? item.levelMeta?.knownRatio;
  return typeof ratio === 'number' && Number.isFinite(ratio)
    ? Math.min(1, Math.max(0, ratio))
    : null;
}

/** Projects the retained LibraryItem shape into the shared workspace card contract. */
export function readingWorkspaceEntryFromLibraryItem(item: LibraryItem): ReadingWorkspaceEntry {
  const work = readingWorkFromLibraryItem(item);
  const edition = readingEditionFromLibraryItem(item);
  const storedProgress = readingProgressFromLibraryItem(item);
  const percent = clampPercent(item.progress?.percent ?? storedProgress?.percent);
  const updatedAt = Math.max(0, finiteNumber(item.lastReadAt ?? item.createdAt) ?? 0);
  const coverRef = text(item.coverPath, 2_000);
  const source = sourceForLibraryItem(item);
  return {
    version: READING_WORKSPACE_SCHEMA_VERSION,
    key: `library:${item.id}`,
    itemId: item.id,
    work: {
      ...work,
      workId: text(work.workId, 240) || item.id,
      title: text(work.title, 500) || item.id,
      titleNative: text(work.titleNative, 500),
    },
    edition,
    source,
    availability: 'readable',
    cover: coverRef
      ? { state: 'local-cache', ref: coverRef }
      : { state: 'fallback', ref: null },
    progress: {
      value: storedProgress,
      percent,
      updatedAt,
      state: progressState(percent),
    },
    level: levelForLibraryItem(item),
    knownRatio: knownRatioForLibraryItem(item),
    tags: item.folder ? [item.folder] : [],
  };
}

/** Safely projects an IPC/library payload and drops malformed records. */
export function normalizeReadingWorkspaceLibrary(value: unknown): ReadingWorkspaceEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const entries: ReadingWorkspaceEntry[] = [];
  for (const raw of value.slice(0, 5_000)) {
    const item = record(raw);
    if (
      !text(item.id, 240) ||
      !text(item.title, 500) ||
      (item.kind !== 'book' && item.kind !== 'manga') ||
      finiteNumber(item.createdAt) === null
    ) {
      continue;
    }
    const entry = readingWorkspaceEntryFromLibraryItem(raw as unknown as LibraryItem);
    if (seen.has(entry.key)) continue;
    seen.add(entry.key);
    entries.push(entry);
  }
  return entries;
}

export function routeForReadingWorkspaceEntry(
  entry: ReadingWorkspaceEntry,
  intent: ReadingWorkspaceIntent = 'open',
): ReadingWorkspaceRoute {
  const section = intent === 'continue'
    ? 'continue'
    : intent === 'plan'
      ? 'plan'
      : intent === 'import'
        ? 'imports'
        : intent === 'sources'
          ? 'sources'
          : 'library';
  return {
    version: READING_WORKSPACE_SCHEMA_VERSION,
    section,
    intent,
    ...(entry.work.workId ? { workId: entry.work.workId } : {}),
    ...(entry.edition?.editionId ? { editionId: entry.edition.editionId } : {}),
    ...(entry.itemId ? { itemId: entry.itemId } : {}),
  };
}
