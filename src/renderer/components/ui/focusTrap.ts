/**
 * The Tab half of a modal focus trap, shared by every dialog that keeps its own
 * key handler (Dialog, useModalKeyboard, FirstRunSetup, GrammarTestModal).
 *
 * a11y3: each copy wrapped only from the first control to the last and back.
 * Every one of those dialogs moves initial focus to a NON-tabbable node (the
 * panel or its heading, `tabIndex={-1}`), so Shift+Tab from there was not
 * "on the first control" and the browser walked focus straight out of an
 * `aria-modal` dialog onto the page behind it. Focus that has already left the
 * container (a click on the backdrop, a portal) is pulled back in the same way.
 */
export const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), '
  + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** Tabbable descendants of `container`, in DOM order, skipping hidden subtrees. */
export function tabbables(container: Element): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (el) => !el.closest('[hidden], [inert], [aria-hidden="true"]'),
  );
}

/**
 * Keep a Tab keydown inside `container`. Returns true when it moved focus (and
 * called `preventDefault`), false when the browser's own move stays inside.
 */
export function trapTab(
  event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'preventDefault'>,
  container: Element | null | undefined,
): boolean {
  if (event.key !== 'Tab' || !container) return false;
  const list = tabbables(container);
  if (list.length === 0) {
    // Nothing to land on: keep focus where it is rather than leak it.
    event.preventDefault();
    return true;
  }
  const first = list[0];
  const last = list[list.length - 1];
  const active = document.activeElement;
  if (!active || !container.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return true;
  }
  // Is there a tabbable on the side Tab is moving towards? Asked by document
  // position, so it also holds when focus sits on the panel or a heading.
  const before = (el: Element): boolean =>
    el !== active && !!(el.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING);
  const after = (el: Element): boolean =>
    el !== active && !!(active.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
    && !el.contains(active);
  if (event.shiftKey && !list.some(before)) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && !list.some(after)) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}
