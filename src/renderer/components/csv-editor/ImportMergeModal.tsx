import { Button } from '../ui';
import { Dialog } from '../ui/Dialog';

type Props = {
  rowCount: number;
  onClose: () => void;
  onChoose: (mode: 'append' | 'overwrite') => void;
};

export default function ImportMergeModal({ rowCount, onClose, onChoose }: Props) {
  return (
    <Dialog
      open
      onClose={onClose}
      title="Import data"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={() => onChoose('append')}>Append to bottom</Button>
          <Button variant="primary" onClick={() => onChoose('overwrite')}>
            Overwrite grid
          </Button>
        </>
      }
    >
      <p className="muted csv-editor-modal-lead">
        The grid already has data. Choose how to merge the incoming {rowCount} row
        {rowCount === 1 ? '' : 's'}.
      </p>
    </Dialog>
  );
}
