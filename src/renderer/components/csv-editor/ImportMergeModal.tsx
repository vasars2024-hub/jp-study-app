type Props = {
  rowCount: number;
  onClose: () => void;
  onChoose: (mode: 'append' | 'overwrite') => void;
};

export default function ImportMergeModal({ rowCount, onClose, onChoose }: Props) {
  return (
    <div className="csv-editor-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="csv-editor-modal"
        role="dialog"
        aria-labelledby="csv-import-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="csv-import-title" className="csv-editor-modal-title">
          Import data
        </h3>
        <p className="muted csv-editor-modal-lead">
          The grid already has data. Choose how to merge the incoming {rowCount} row
          {rowCount === 1 ? '' : 's'}.
        </p>
        <div className="csv-editor-modal-actions csv-editor-import-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={() => onChoose('append')}>
            Append to bottom
          </button>
          <button type="button" className="btn primary" onClick={() => onChoose('overwrite')}>
            Overwrite grid
          </button>
        </div>
      </div>
    </div>
  );
}
