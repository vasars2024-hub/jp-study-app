/**
 * Open the Notes app as a dialog: the route to every note in the Study OS,
 * Aero and Wired shells (Blanc shows the same manager inline as Quick Notes).
 *
 * Opened imperatively, the way `dialogService` and the note viewer open their
 * dialogs, so no shell has to mount a host for it; the manager itself is a
 * lazy chunk, loaded on first use. A second call while it is open focuses the
 * requested note in the open dialog instead of stacking another.
 */
import { createRoot } from 'react-dom/client';
import { t } from '../../i18n';
import { Dialog } from '../ui/Dialog';
import { requestNoteFocus } from './notesFocus';

let open = false;

/** Where a note's source href goes in the default shell. */
export function openStudyOsHref(href: string): void {
  if (href === 'clipboard') {
    window.dispatchEvent(new CustomEvent('clipboard:open'));
    return;
  }
  window.dispatchEvent(new CustomEvent('os:open', { detail: href }));
}

export async function openNotesManager(opts: { noteId?: string | null; newNote?: boolean } = {}): Promise<boolean> {
  if (opts.noteId) requestNoteFocus(opts.noteId);
  if (open) return true;
  open = true;
  try {
    const { default: NotesManager } = await import('./NotesManager');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const close = (): void => {
      open = false;
      window.setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
    };
    root.render(
      <Dialog open onClose={close} className="notes-manager-dialog" title={t('notes.app.title')}>
        <NotesManager variant="dialog" startWithNewNote={opts.newNote} onOpenSection={(href) => {
          openStudyOsHref(href);
          close();
        }} />
      </Dialog>,
    );
    return true;
  } catch (err) {
    open = false;
    console.warn('[notes] could not open the Notes app:', err instanceof Error ? err.message : String(err));
    return false;
  }
}
