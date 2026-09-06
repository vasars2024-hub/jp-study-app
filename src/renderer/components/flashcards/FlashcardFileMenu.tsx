import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ContextMenu } from '../ui/ContextMenu';
import { useT } from '../../i18n';

interface Props {
  open: boolean;
  folders: string[];
  onOpenChange: (open: boolean) => void;
  onMove: (folder: string | null) => void;
}

/** Both card-row hosts use the same dismissal, keyboard and focus-return contract. */
export default function FlashcardFileMenu({ open, folders, onOpenChange, onMove }: Props) {
  const { t } = useT();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  return (
    <>
      <button
        type="button"
        className="btn small"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          event.currentTarget.focus({ preventScroll: true });
          setPosition({ x: rect.left, y: rect.bottom + 4 });
          onOpenChange(!open);
        }}
      >
        {t('flash.file')}
      </button>
      {createPortal(<ContextMenu
        open={open}
        x={position.x}
        y={position.y}
        items={[
          { id: 'unfiled', label: t('flash.unfiled'), onSelect: () => onMove(null) },
          ...folders.map((folder) => ({ id: `folder:${folder}`, label: folder, onSelect: () => onMove(folder) })),
        ]}
        onClose={() => onOpenChange(false)}
      />, document.body)}
    </>
  );
}
