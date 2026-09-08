/**
 * The deck action menu, opened from a deck card's "Options" button.
 *
 * It looks modal and it behaves modally to the mouse: `.deck-action-backdrop`
 * is `position: fixed`, `z-index: 200`, `rgba(0,0,0,0.55)` over the whole
 * window, so every control underneath — including that deck's own "Delete
 * deck" and each card's "Remove" — is dimmed and unclickable.
 *
 * Until 2026-09-08 the KEYBOARD was left outside it (register row D410).
 * Measured live: after opening, `document.activeElement` was still the
 * "Options" trigger, and one Tab landed on **Delete deck** — a destructive
 * control the user cannot see, behind the scrim. The menu's own first control
 * was ten tab stops further on, past four card "Remove" buttons.
 *
 * The fix is `useModalKeyboard`, which is what the 2026-09-06 sweep (D9) put
 * on the other seven dialogs in this app; this one was simply missed. It moves
 * focus into the panel, traps Tab inside it, swallows Escape (the desktop
 * shell closes the whole window on an unstopped Escape) and restores focus to
 * the trigger on close. `aria-modal` then tells a screen reader what the scrim
 * already tells everyone else.
 */
import { useEffect, useRef } from 'react';
import type { BookGroup } from '../flashcardDeck';
import { useT } from '../i18n';
import { useModalKeyboard } from './ui/useModalKeyboard';

type Props = {
  group: BookGroup;
  folders: string[];
  onClose: () => void;
  onReview: () => void;
  onSaveCsv: () => void;
  onMoveFolder: (folder: string | null) => void;
  onRename: () => void;
  onDelete: () => void;
};

export default function DeckActionMenu({
  group,
  folders,
  onClose,
  onReview,
  onSaveCsv,
  onMoveFolder,
  onRename,
  onDelete,
}: Props) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);

  // Escape and the Tab trap live in the hook; this only keeps the click-outside
  // close, which the hook deliberately does not own.
  useModalKeyboard({ panelRef: ref, onEscape: onClose });

  useEffect(() => {
    function onDoc(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
    };
  }, [onClose]);

  return (
    <div className="deck-action-backdrop" role="presentation">
      <div
        className="deck-action-menu anki-card"
        ref={ref}
        role="dialog"
        aria-modal="true"
        // The panel is the initial focus target, not its first button: focusing
        // "Start review" would read that label instead of the menu's own.
        tabIndex={-1}
        aria-label={t('flash.aero.actionsAria')}
      >
        <header className="deck-action-head">
          <h3>{group.bookTitle}</h3>
          <p className="muted">{t('flash.cardsCount', { count: group.cards.length })}</p>
          <button type="button" className="deck-action-close" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </header>
        <div className="deck-action-list">
          <button type="button" className="deck-action-item primary" onClick={onReview}>
            {t('flash.startReview')}
          </button>
          <button type="button" className="deck-action-item" onClick={onSaveCsv}>
            {t('flash.aero.saveCsv')}
          </button>
          <button type="button" className="deck-action-item" onClick={onRename}>
            {t('flash.renameBook')}
          </button>
          <div className="deck-action-sub">
            <span className="muted">{t('flash.aero.moveToFolder')}</span>
            <button type="button" className="deck-action-chip" onClick={() => onMoveFolder(null)}>
              {t('flash.unfiled')}
            </button>
            {folders.map((folder) => (
              <button
                key={folder}
                type="button"
                className="deck-action-chip"
                onClick={() => onMoveFolder(folder)}
              >
                {folder}
              </button>
            ))}
          </div>
          <button type="button" className="deck-action-item danger" onClick={onDelete}>
            {t('flash.deleteDeck')}
          </button>
        </div>
      </div>
    </div>
  );
}
