import { useEffect, useRef } from 'react';
import type { BookGroup } from '../flashcardDeck';

type Props = {
  group: BookGroup;
  folders: string[];
  onClose: () => void;
  onReview: () => void;
  onSaveCsv: () => void;
  onMoveFolder: (folder: string | null) => void;
  onDelete: () => void;
};

export default function DeckActionMenu({
  group,
  folders,
  onClose,
  onReview,
  onSaveCsv,
  onMoveFolder,
  onDelete,
}: Props) {
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
      <div className="deck-action-menu anki-card" ref={ref} role="dialog" aria-label="Deck actions">
        <header className="deck-action-head">
          <h3>{group.bookTitle}</h3>
          <p className="muted">{group.cards.length} cards</p>
          <button type="button" className="deck-action-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="deck-action-list">
          <button type="button" className="deck-action-item primary" onClick={onReview}>
            Start review
          </button>
          <button type="button" className="deck-action-item" onClick={onSaveCsv}>
            Save as CSV
          </button>
          <div className="deck-action-sub">
            <span className="muted">Move to folder</span>
            <button type="button" className="deck-action-chip" onClick={() => onMoveFolder(null)}>
              Unfiled
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
            Delete deck
          </button>
        </div>
      </div>
    </div>
  );
}
