import { useEffect, useRef } from 'react';
import type { BookGroup } from '../flashcardDeck';
import { useT } from '../i18n';

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

  useEffect(() => {
    function onDoc(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="deck-action-backdrop" role="presentation">
      <div className="deck-action-menu anki-card" ref={ref} role="dialog" aria-label={t('flash.aero.actionsAria')}>
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
