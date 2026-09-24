// The one question removing a transfer has to ask: keep what it downloaded?
//
// Shared by the Downloads page and the Torrent Manager so the two cannot answer
// it differently. Keeping the files is the default and the button says which
// of the two it will do — deleting episodes from someone's disk is never the
// thing a stray click does.

import { useState } from 'react';
import { Button, Checkbox } from '../ui';
import { sx, sxs } from './strings';

export default function TransferRemoveConfirm({
  name,
  busy,
  onConfirm,
  onCancel,
}: {
  name: string;
  busy: boolean;
  onConfirm: (deleteFiles: boolean) => void;
  onCancel: () => void;
}) {
  const [deleteFiles, setDeleteFiles] = useState(false);
  return (
    <div className="scr-remove-confirm" role="group" aria-label={sxs('transfer.removeQuestion', name)}>
      <p>{sxs('transfer.removeQuestion', name)}</p>
      <Checkbox
        checked={deleteFiles}
        label={sx('transfer.deleteFiles')}
        onChange={(event) => setDeleteFiles(event.currentTarget.checked)}
      />
      <div className="scr-page-actions">
        <Button
          size="sm"
          variant={deleteFiles ? 'danger' : 'primary'}
          disabled={busy}
          title={busy ? sx('why.busy') : undefined}
          onClick={() => onConfirm(deleteFiles)}
        >
          {sx(deleteFiles ? 'transfer.removeAndDelete' : 'transfer.removeKeep')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          title={busy ? sx('why.busy') : undefined}
          onClick={onCancel}
        >
          {sx('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
