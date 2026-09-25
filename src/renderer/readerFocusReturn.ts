import { useLayoutEffect } from 'react';

/**
 * Where keyboard focus goes when a reader closes.
 *
 * In the main window a reader REPLACES the desktop (App.tsx renders the reader
 * instead of `DesktopShell`), so whatever opened it — a Library tile, a row, a
 * Start-menu entry — is unmounted while the book is open. Closing the reader with
 * Ctrl+H, Escape or the Library button remounted the desktop with focus on
 * `<body>`: the next Tab started from the top of the document and the book the
 * user had just read was nowhere near it (measured in the round-2 journey audit).
 *
 * So the reader remembers the element that had focus when it opened. If that
 * element survived (the Focus shell and Blanc open the reader over their own UI)
 * it gets focus back; otherwise the freshly mounted Library's tile or row for the
 * same item does; failing that, the Library window's first control. Focus that
 * something else has already claimed is never taken away.
 */

export interface ReaderFocusItem {
  id: string;
  title: string;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function byAttr(doc: Document, attr: string, value: string): HTMLElement | null {
  for (const el of doc.querySelectorAll<HTMLElement>(`[${attr}]`)) {
    if (el.getAttribute(attr) === value) return el;
  }
  return null;
}

/** The best element to hand focus to for `item`, or null when nothing fits yet. */
export function findReaderReturnTarget(doc: Document, item: ReaderFocusItem): HTMLElement | null {
  const tile = byAttr(doc, 'data-library-tile', item.id) ?? byAttr(doc, 'data-library-row', item.id);
  if (tile) return tile;
  // The Covers grid's card has no id attribute of its own, but it is a
  // role=button named by the item's title.
  if (item.title) {
    for (const el of doc.querySelectorAll<HTMLElement>('[role="button"][aria-label]')) {
      if (el.getAttribute('aria-label') === item.title) return el;
    }
  }
  const libraryWin = doc.querySelector<HTMLElement>('.fwin[data-section="library"]');
  return libraryWin?.querySelector<HTMLElement>(FOCUSABLE) ?? null;
}

function focusLost(doc: Document): boolean {
  const active = doc.activeElement;
  return !active || active === doc.body || active === doc.documentElement;
}

/**
 * Put focus back after a reader closed. Polls briefly, because in the main window
 * the desktop (and the Library inside it) mounts after the reader unmounts.
 */
export function returnFocusAfterReader(
  item: ReaderFocusItem,
  opener: HTMLElement | null,
  doc: Document = document,
  timeoutMs = 1500,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const started = Date.now();
  const attempt = (): void => {
    timer = null;
    if (!focusLost(doc)) return;
    const target = opener && opener.isConnected ? opener : findReaderReturnTarget(doc, item);
    if (target) {
      target.focus({ preventScroll: false });
      return;
    }
    if (Date.now() - started < timeoutMs) timer = setTimeout(attempt, 50);
  };
  timer = setTimeout(attempt, 0);
  return () => {
    if (timer) clearTimeout(timer);
  };
}

/** Remember the opener on mount; return focus to it (or the Library item) on unmount. */
export function useReturnFocusOnClose(item: ReaderFocusItem): void {
  useLayoutEffect(() => {
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body ? active : null;
    return () => {
      // Not cancelled on purpose: it runs after this component is gone, and it
      // stops by itself once focus lands or the budget runs out.
      returnFocusAfterReader({ id: item.id, title: item.title }, opener);
    };
    // Per opened item: a reader that switches books keeps the first opener.
  }, [item.id]);
}
