/**
 * Which window events count as "the reader is reading".
 *
 * The novel reader's idle clock listens on the window in the capture phase so
 * no handler can swallow the signal. Without a filter that meant every event in
 * the window: typing in another pane, scrolling a sidebar, the mouse crossing
 * the desktop shell. Reading time was credited to the book for all of it.
 *
 * An event counts when it happens inside the reader's root. The one exception
 * is a key pressed with nothing focused (target `<body>` / `<html>`): the reader
 * is the page's keyboard owner then — its own arrow-key and shortcut handlers
 * run on exactly those events.
 */
export function isReaderInteraction(event: Pick<Event, 'type' | 'target'>, root: Element | null): boolean {
  // Before the root has mounted there is nothing to compare against; count it
  // rather than lose the first second of a session.
  if (!root) return true;
  const target = event.target;
  if (!target || typeof (target as Node).nodeType !== 'number') return false;
  const node = target as Node;
  if (root.contains(node)) return true;
  if (event.type !== 'keydown') return false;
  const doc = root.ownerDocument;
  return node === doc.body || node === doc.documentElement;
}
