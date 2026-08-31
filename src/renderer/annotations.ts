// Personal color-highlight annotations — independent of knowledge (.wk) levels.
// Hot path: localStorage per book. Durable mirror: IndexedDB map of all books
// so highlights survive LS eviction and show up in Memory export domains.

import { IDB_KEYS, mirrorToIdb } from './storage/storage';
import { kvGet } from './storage/db';

export type AnnoColor = 'yellow' | 'blue' | 'green' | 'purple' | 'orange' | 'red';

export const ANNO_COLORS: AnnoColor[] = ['yellow', 'blue', 'green', 'purple', 'orange', 'red'];

export interface Annotation {
  id: string;
  bookId: string;
  /** Chapter / part index when known. */
  part?: number;
  startOffset: number;
  endOffset: number;
  text: string;
  color: AnnoColor;
  createdAt: number;
}

/** Prefix for the per-book highlight stores, shared with read-only catalogue consumers. */
export const ANNOTATIONS_STORAGE_PREFIX = 'jp-annotations:';
export const ANNOTATIONS_EVENT = 'annotations-changed';

export function annotationStorageKey(bookId: string): string {
  return `${ANNOTATIONS_STORAGE_PREFIX}${bookId}`;
}

/**
 * Parse one per-book store with the exact acceptance rule used by the reader.
 * Files can enumerate highlights without inventing a second, stricter parser
 * that makes legacy marks disappear during Notebook absorption.
 */
export function parseAnnotations(raw: string | null): Annotation[] {
  try {
    if (!raw) return [];
    const list = JSON.parse(raw) as Annotation[];
    return Array.isArray(list)
      ? list.filter((annotation) => annotation && typeof annotation.id === 'string')
      : [];
  } catch {
    return [];
  }
}

/** Snapshot every per-book annotation list for IDB + export inventory. */
export function collectAllAnnotationsMap(): Record<string, Annotation[]> {
  const out: Record<string, Annotation[]> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(ANNOTATIONS_STORAGE_PREFIX)) continue;
      const bookId = k.slice(ANNOTATIONS_STORAGE_PREFIX.length);
      if (!bookId) continue;
      const list = parseAnnotations(localStorage.getItem(k));
      if (list.length) out[bookId] = list;
    }
  } catch {
    /* private mode */
  }
  return out;
}

function mirrorAllAnnotations(): void {
  mirrorToIdb(IDB_KEYS.annotations, collectAllAnnotationsMap());
}

/** Force durable mirror (e.g. on reader close). */
export function flushAnnotationsMirror(): void {
  mirrorAllAnnotations();
}

export function loadAnnotations(bookId: string): Annotation[] {
  try {
    return parseAnnotations(localStorage.getItem(annotationStorageKey(bookId)));
  } catch {
    return [];
  }
}

/**
 * Restore annotations from IndexedDB when localStorage was wiped.
 * Called from storage migration.
 */
export async function restoreAnnotationsFromIdb(): Promise<void> {
  try {
    const map = await kvGet<Record<string, Annotation[]>>(IDB_KEYS.annotations);
    if (!map || typeof map !== 'object') return;
    for (const [bookId, list] of Object.entries(map)) {
      if (!bookId || !Array.isArray(list) || !list.length) continue;
      const k = annotationStorageKey(bookId);
      try {
        if (!localStorage.getItem(k)) {
          localStorage.setItem(k, JSON.stringify(list));
        }
      } catch {
        /* quota */
      }
    }
  } catch {
    /* IDB unavailable */
  }
}

function save(bookId: string, list: Annotation[]): void {
  try {
    if (list.length === 0) localStorage.removeItem(annotationStorageKey(bookId));
    else localStorage.setItem(annotationStorageKey(bookId), JSON.stringify(list));
  } catch {
    /* ignore */
  }
  mirrorAllAnnotations();
  try {
    window.dispatchEvent(new CustomEvent(ANNOTATIONS_EVENT, { detail: { bookId } }));
  } catch {
    /* tests */
  }
}

function newId(): string {
  return `an-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function addAnnotation(
  bookId: string,
  input: Omit<Annotation, 'id' | 'bookId' | 'createdAt'>,
): Annotation[] {
  const list = loadAnnotations(bookId);
  const next: Annotation = {
    ...input,
    id: newId(),
    bookId,
    createdAt: Date.now(),
  };
  // Skip exact duplicates.
  if (
    list.some(
      (a) =>
        a.startOffset === next.startOffset &&
        a.endOffset === next.endOffset &&
        a.part === next.part &&
        a.color === next.color,
    )
  ) {
    return list;
  }
  const out = [...list, next];
  save(bookId, out);
  return out;
}

export function removeAnnotation(bookId: string, id: string): Annotation[] {
  const out = loadAnnotations(bookId).filter((a) => a.id !== id);
  save(bookId, out);
  return out;
}

export function clearAnnotations(bookId: string): void {
  save(bookId, []);
}

/** Count all personal highlights across books (Memory inventory). */
export function countAllAnnotations(): { books: number; marks: number } {
  const map = collectAllAnnotationsMap();
  let marks = 0;
  for (const list of Object.values(map)) marks += list.length;
  return { books: Object.keys(map).length, marks };
}

export function onAnnotationsChanged(cb: (bookId: string) => void): () => void {
  const h = (e: Event) => {
    const d = (e as CustomEvent<{ bookId: string }>).detail;
    if (d?.bookId) cb(d.bookId);
  };
  window.addEventListener(ANNOTATIONS_EVENT, h);
  return () => window.removeEventListener(ANNOTATIONS_EVENT, h);
}

/**
 * Wrap plain text ranges in `root` with annotation spans.
 * Offsets are relative to root textContent (simple model for a single part).
 */
export function applyAnnotationsToRoot(
  root: HTMLElement,
  annotations: Annotation[],
  part?: number,
): void {
  // Remove previous annotation wrappers (unwrap).
  root.querySelectorAll('span.anno').forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    parent.normalize();
  });

  const relevant = annotations
    .filter((a) => part === undefined || a.part === undefined || a.part === part)
    .slice()
    .sort((a, b) => b.startOffset - a.startOffset); // apply from end so offsets stay valid

  for (const a of relevant) {
    if (a.endOffset <= a.startOffset) continue;
    wrapRange(root, a.startOffset, a.endOffset, a.color, a.id);
  }
}

function wrapRange(
  root: HTMLElement,
  start: number,
  end: number,
  color: AnnoColor,
  id: string,
): void {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let startNode: Text | null = null;
  let startOff = 0;
  let endNode: Text | null = null;
  let endOff = 0;
  let n = walker.nextNode() as Text | null;
  let lastNode: Text | null = null;
  let lastLen = 0;
  while (n) {
    const len = (n.textContent ?? '').length;
    if (!startNode && pos + len > start) {
      startNode = n;
      startOff = start - pos;
    }
    if (pos + len >= end) {
      endNode = n;
      endOff = end - pos;
      break;
    }
    pos += len;
    lastNode = n;
    lastLen = len;
    n = walker.nextNode() as Text | null;
  }
  // `end` came from a selection that ran past this block's own text (e.g. a
  // sentence spanning two windowed .novel-part chunks) — clamp to whatever
  // text this block actually has instead of dropping the highlight entirely.
  if (!endNode && lastNode) {
    endNode = lastNode;
    endOff = lastLen;
  }
  if (!startNode || !endNode) return;
  try {
    const range = doc.createRange();
    range.setStart(startNode, Math.max(0, Math.min(startOff, startNode.length)));
    range.setEnd(endNode, Math.max(0, Math.min(endOff, endNode.length)));
    if (range.collapsed) return;
    const span = doc.createElement('span');
    span.className = `anno anno-${color}`;
    span.dataset.annoId = id;
    try {
      range.surroundContents(span);
    } catch {
      // Range crosses element boundaries (e.g. multiple .wk tokens) — extract/insert.
      const contents = range.extractContents();
      span.appendChild(contents);
      range.insertNode(span);
    }
  } catch {
    // Give up quietly — offsets may be stale after a DOM rebuild.
  }
}
