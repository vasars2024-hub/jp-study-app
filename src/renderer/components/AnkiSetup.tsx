import { ANKI_COLLECTION_UNAVAILABLE_MSG } from '../../shared/anki';
import type { AnkiStatus } from '../../shared/types';
import { useT } from '../i18n';

interface Props {
  status: AnkiStatus | null;
  onRetry: () => void;
  /** Optional "Back" button (used inside the small reader popup). */
  onBack?: () => void;
  /** AnkiConnect is up but the collection is still loading. */
  waitingCollection?: boolean;
}

const ANKI_CONNECT_CODE = '2055492159';

// Shown whenever AnkiConnect can't be reached or the collection isn't ready.
export default function AnkiSetup({ status, onRetry, onBack, waitingCollection }: Props) {
  const { t } = useT();
  const collectionWait =
    waitingCollection || status?.error === ANKI_COLLECTION_UNAVAILABLE_MSG;

  return (
    <div className="anki-setup">
      <p className="anki-setup-msg">{status?.error ?? t('ankiSetup.cantReach')}</p>
      {collectionWait ? (
        <p className="anki-setup-sub">{t('ankiSetup.collectionWait')}</p>
      ) : (
        <>
          <p className="anki-setup-sub">{t('ankiSetup.installLead')}</p>
          <ol className="anki-steps">
            <li>{t('ankiSetup.step1')}</li>
            <li>{t('ankiSetup.step2')}</li>
            <li>{t('ankiSetup.step3', { code: ANKI_CONNECT_CODE })}</li>
            <li>{t('ankiSetup.step4')}</li>
          </ol>
        </>
      )}
      <div className="anki-setup-actions">
        {onBack && (
          <button className="btn small" onClick={onBack}>
            {t('ankiSetup.back')}
          </button>
        )}
        <button className="btn small primary" onClick={onRetry}>
          {collectionWait ? t('ankiSetup.checkNow') : t('ankiSetup.retry')}
        </button>
      </div>
    </div>
  );
}
