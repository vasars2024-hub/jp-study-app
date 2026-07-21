import { useT } from '../../i18n';
import { Button } from '../ui';
import { Dialog } from '../ui/Dialog';

type Props = {
  rowCount: number;
  onClose: () => void;
  onChoose: (mode: 'append' | 'overwrite') => void;
};

export default function ImportMergeModal({ rowCount, onClose, onChoose }: Props) {
  const { t } = useT();
  return (
    <Dialog
      open
      onClose={onClose}
      title={t('csv.import.title')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={() => onChoose('append')}>{t('csv.import.append')}</Button>
          <Button variant="primary" onClick={() => onChoose('overwrite')}>
            {t('csv.import.overwrite')}
          </Button>
        </>
      }
    >
      <p className="muted csv-editor-modal-lead">
        {t('csv.import.mergeLead', { count: rowCount })}
      </p>
    </Dialog>
  );
}
