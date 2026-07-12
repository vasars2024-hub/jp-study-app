import { ANKI_COLLECTION_UNAVAILABLE_MSG } from '../../shared/anki';
import type { AnkiStatus } from '../../shared/types';

interface Props {
  status: AnkiStatus | null;
  onRetry: () => void;
  /** Optional "Back" button (used inside the small reader popup). */
  onBack?: () => void;
  /** AnkiConnect is up but the collection is still loading. */
  waitingCollection?: boolean;
}

// Shown whenever AnkiConnect can't be reached or the collection isn't ready.
export default function AnkiSetup({ status, onRetry, onBack, waitingCollection }: Props) {
  const collectionWait =
    waitingCollection || status?.error === ANKI_COLLECTION_UNAVAILABLE_MSG;

  return (
    <div className="anki-setup">
      <p className="anki-setup-msg">{status?.error ?? "Can't reach Anki."}</p>
      {collectionWait ? (
        <p className="anki-setup-sub">
          AnkiConnect responded, but your decks are not available yet. The app retries
          automatically — wait until Anki finishes opening, or close duplicate Anki windows
          and reopen.
        </p>
      ) : (
        <>
          <p className="anki-setup-sub">To add cards, install the free AnkiConnect add-on (one time):</p>
          <ol className="anki-steps">
            <li>
              Open the <b>Anki</b> desktop app and keep it running.
            </li>
            <li>
              Menu: <b>Tools → Add-ons → Get Add-ons…</b>
            </li>
            <li>
              Paste this code: <code>2055492159</code>
            </li>
            <li>Click OK and restart Anki, then Retry.</li>
          </ol>
        </>
      )}
      <div className="anki-setup-actions">
        {onBack && (
          <button className="btn small" onClick={onBack}>
            Back
          </button>
        )}
        <button className="btn small primary" onClick={onRetry}>
          {collectionWait ? 'Check now' : 'Retry'}
        </button>
      </div>
    </div>
  );
}
