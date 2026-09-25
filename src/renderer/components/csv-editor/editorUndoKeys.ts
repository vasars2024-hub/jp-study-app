/**
 * Which Ctrl+Z / Ctrl+Y presses belong to the CSV editor's own history.
 *
 * The editor used to listen on `window`, so a Ctrl+Z typed into any other
 * window's text field — or the editor's own deck-name and search boxes — was
 * swallowed and undid a grid edit instead. Now the listener sits on the editor,
 * and a press whose focus is a text control outside the grid is left to that
 * control's native undo.
 */

export type EditorUndoAction = 'undo' | 'redo' | null;

type KeyLike = Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'key' | 'target'>;

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset']);

function isTextEntry(node: EventTarget | null): node is HTMLElement {
  if (!node || typeof (node as HTMLElement).tagName !== 'string') return false;
  const el = node as HTMLElement;
  if (el.isContentEditable) return true;
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea') return true;
  if (tag === 'input') return !NON_TEXT_INPUTS.has(((el as HTMLInputElement).type || 'text').toLowerCase());
  return false;
}

export function editorUndoAction(e: KeyLike, grid: Element | null): EditorUndoAction {
  if (!(e.ctrlKey || e.metaKey)) return null;
  const key = e.key.toLowerCase();
  let action: EditorUndoAction = null;
  if (key === 'z') action = e.shiftKey ? 'redo' : 'undo';
  else if (key === 'y') action = 'redo';
  if (!action) return null;
  const target = e.target as Node | null;
  if (isTextEntry(target) && !(grid && grid.contains(target))) return null;
  return action;
}
