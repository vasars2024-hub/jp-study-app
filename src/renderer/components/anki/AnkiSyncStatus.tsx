/**
 * "Sync with Anki": what the two-way review sync is doing and the one switch it has.
 *
 * Last sync, answers waiting to be sent, cards waiting to be added, the Anki
 * profile the links belong to, a per-deck summary of which Gum cards are linked,
 * Anki's own due state while Anki schedules, and "Sync now". Every error is a
 * kind (`shared/ankiReviewSync.ts`) explained in the user's language with what to
 * do about it — never a raw AnkiConnect string on its own.
 *
 * Shared by Study OS (AnkiView) and Blanc (BlancAnkiPanel): the wrapper supplies
 * the frame and the heading, this supplies the content.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { translateAnkiReason } from '../../../shared/anki';
import { summarizeAnkiDeckLinks, type AnkiSyncErrorKind } from '../../../shared/ankiReviewSync';
import { ANKI_OWNS_SCHEDULING_EVENT, ankiOwnsScheduling } from '../../ankiSchedulingOwner';
import {
  ankiPushReviewsEnabled,
  onAnkiSyncStateChanged,
  readAnkiSyncState,
  setAnkiPushReviewsEnabled,
  type AnkiSyncSnapshot,
} from '../../ankiSyncState';
import {
  ankiMirrorCounts,
  clearAnkiReviewOutbox,
  readAnkiReviewOutbox,
  rebindAnkiSyncProfile,
  syncAnkiNow,
  type AnkiSyncRunReport,
} from '../../ankiReviewSync';
import { loadDeck, onDeckChanged } from '../../flashcardDeck';
import { getProfiles } from '../../profileState';
import { onAnkiMineQueueChanged, pendingAnkiCards } from '../../studyMining';
import { useT } from '../../i18n';
import './ankiSyncStatus.css';

/** Panel refresh while open: another window may have synced. */
const REFRESH_MS = 15_000;

const ERROR_KEYS: Record<AnkiSyncErrorKind, string> = {
  unreachable: 'anki3.sync.error.unreachable',
  collection: 'anki3.sync.error.collection',
  unsupported: 'anki3.sync.error.unsupported',
  permission: 'anki3.sync.error.permission',
  version: 'anki3.sync.error.version',
  'profile-mismatch': 'anki3.sync.error.profileMismatch',
  api: 'anki3.sync.error.api',
};

interface Live {
  state: AnkiSyncSnapshot | null;
  outbox: number;
  mirror: { due: number; suspended: number; total: number };
}

function useLiveSyncState(): [Live, () => void] {
  const [live, setLive] = useState<Live>({ state: null, outbox: 0, mirror: { due: 0, suspended: 0, total: 0 } });
  const refresh = useCallback(() => {
    void Promise.all([readAnkiSyncState(), readAnkiReviewOutbox(), ankiMirrorCounts()]).then(([state, outbox, mirror]) => {
      setLive({ state, outbox: outbox.length, mirror });
    });
  }, []);
  useEffect(() => {
    refresh();
    const offState = onAnkiSyncStateChanged(refresh);
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => {
      offState();
      window.clearInterval(timer);
    };
  }, [refresh]);
  return [live, refresh];
}

export default function AnkiSyncStatus() {
  const { t, lang } = useT();
  const [live, refresh] = useLiveSyncState();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<AnkiSyncRunReport | null>(null);
  const [pushOn, setPushOn] = useState(ankiPushReviewsEnabled);
  const [ankiOwns, setAnkiOwns] = useState(ankiOwnsScheduling);
  const [deckTick, setDeckTick] = useState(0);

  useEffect(() => {
    const bumpDeck = (): void => setDeckTick((n) => n + 1);
    const offDeck = onDeckChanged(bumpDeck);
    const offQueue = onAnkiMineQueueChanged(bumpDeck);
    const onOwner = (): void => setAnkiOwns(ankiOwnsScheduling());
    window.addEventListener(ANKI_OWNS_SCHEDULING_EVENT, onOwner);
    return () => {
      offDeck();
      offQueue();
      window.removeEventListener(ANKI_OWNS_SCHEDULING_EVENT, onOwner);
    };
  }, []);

  const deck = useMemo(() => loadDeck(), [deckTick]);
  const pendingCards = useMemo(() => pendingAnkiCards(deck).length, [deck]);
  const deckRows = useMemo(
    () => summarizeAnkiDeckLinks(deck, t('anki3.sync.decks.unknown')),
    [deck, t, lang],
  );
  const mappings = useMemo(
    () => getProfiles().map((profile) => t('anki3.sync.mapping', {
      profile: profile.label || profile.id,
      deck: profile.anki.deckName,
      model: profile.anki.modelName,
    })),
    [t, lang, deckTick],
  );
  const formatWhen = useCallback(
    (at: number | undefined): string => (at ? new Date(at).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' }) : t('anki3.sync.never')),
    [t, lang],
  );

  const state = live.state;
  const error = state?.lastError;
  const errorText = useMemo(() => {
    if (!error) return '';
    const [bound = '', current = ''] = (error.detail ?? '').split(' -> ');
    return t(ERROR_KEYS[error.kind] ?? ERROR_KEYS.api, {
      bound,
      current,
      detail: translateAnkiReason(error.detail, t) ?? '',
    });
  }, [error, t, lang]);

  const resultText = useMemo(() => {
    if (!report) return '';
    if (report.busy) return t('anki3.sync.result.busy');
    if (!report.ok) return '';
    const skipped = Object.values(report.skipped).reduce((sum, n) => sum + (n ?? 0), 0);
    const parts = [
      report.answered ? t('anki3.sync.result.answered', { count: report.answered }) : '',
      report.linked ? t('anki3.sync.result.linked', { count: report.linked }) : '',
      report.pulled ? t('anki3.sync.result.pulled', { count: report.pulled }) : '',
      report.unlinked ? t('anki3.sync.result.unlinked', { count: report.unlinked }) : '',
      skipped ? t('anki3.sync.result.skipped', { count: skipped }) : '',
    ].filter(Boolean);
    return parts.length ? parts.join(' ') : t('anki3.sync.result.nothing');
  }, [report, t, lang]);

  const runNow = async (): Promise<void> => {
    setBusy(true);
    try {
      setReport(await syncAnkiNow({ force: true, manual: true }));
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const togglePush = (on: boolean): void => {
    setAnkiPushReviewsEnabled(on);
    setPushOn(on);
    // Answers queued before "off" must not be replayed by a later "on".
    if (!on) void clearAnkiReviewOutbox().then(refresh);
  };

  const rebind = async (): Promise<void> => {
    setBusy(true);
    try {
      await rebindAnkiSyncProfile();
      setReport(null);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const mode = ankiOwns
    ? t('anki3.sync.mode.ankiOwns')
    : pushOn
      ? t('anki3.sync.mode.gumPush')
      : t('anki3.sync.mode.gumOnly');
  const currentProfile = error?.kind === 'profile-mismatch' ? (error.detail ?? '').split(' -> ')[1] ?? '' : '';

  return (
    <div className="anki-sync-status">
      <p className="muted">{t('anki3.sync.lead')}</p>
      <dl className="anki-sync-facts">
        <dt>{t('anki3.sync.lastSync')}</dt>
        <dd>{formatWhen(state?.lastSyncAt)}</dd>
        <dt>{t('anki3.sync.modeLabel')}</dt>
        <dd>{mode}</dd>
        <dt>{t('anki3.sync.answersLabel')}</dt>
        <dd>{t('anki3.sync.answersWaiting', { count: live.outbox })}</dd>
        <dt>{t('anki3.sync.cardsLabel')}</dt>
        <dd>{t('anki3.sync.cardsWaiting', { count: pendingCards })}</dd>
        <dt>{t('anki3.sync.profileLabel')}</dt>
        <dd>{state?.boundProfile || t('anki3.sync.profileUnbound')}</dd>
        {ankiOwns && (
          <>
            <dt>{t('anki3.sync.mirrorLabel')}</dt>
            <dd>
              {live.mirror.total
                ? t('anki3.sync.mirror', { due: live.mirror.due, suspended: live.mirror.suspended, total: live.mirror.total })
                : t('anki3.sync.mirrorEmpty')}
            </dd>
          </>
        )}
      </dl>

      {errorText && (
        <div className="status-banner warn anki-sync-error" role="alert">
          <span>{errorText}</span>
          {error?.kind === 'profile-mismatch' && currentProfile && (
            <button type="button" className="btn small" disabled={busy} onClick={() => void rebind()}>
              {t('anki3.sync.rebind', { profile: currentProfile })}
            </button>
          )}
        </div>
      )}

      <label className="pl-field">
        <input
          type="checkbox"
          checked={pushOn && !ankiOwns}
          disabled={ankiOwns}
          onChange={(e) => togglePush(e.target.checked)}
        />
        <span>{t('anki3.sync.pushToggle')}</span>
      </label>
      <p className="muted">{ankiOwns ? t('anki3.sync.pushDisabledAnkiOwns') : t('anki3.sync.pushHint')}</p>

      <div className="actions">
        <button type="button" className="btn" disabled={busy} onClick={() => void runNow()}>
          {busy ? t('anki3.sync.busy') : t('anki3.sync.now')}
        </button>
        <span className="muted" role="status" aria-live="polite">{resultText}</span>
      </div>

      <table className="anki-sync-decks">
        <caption>{t('anki3.sync.decks.title')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('anki3.sync.decks.deck')}</th>
            <th scope="col">{t('anki3.sync.decks.linked')}</th>
            <th scope="col">{t('anki3.sync.decks.pending')}</th>
            <th scope="col">{t('anki3.sync.decks.unlinked')}</th>
          </tr>
        </thead>
        <tbody>
          {deckRows.length ? deckRows.map((row) => (
            <tr key={row.deck}>
              <th scope="row">{row.deck}</th>
              <td>{row.linked}</td>
              <td>{row.pending}</td>
              <td>{row.unlinked}</td>
            </tr>
          )) : (
            <tr>
              <td colSpan={4} className="muted">{t('anki3.sync.decks.empty')}</td>
            </tr>
          )}
        </tbody>
      </table>

      {mappings.length > 0 && (
        <>
          <h3 className="anki-sync-subhead">{t('anki3.sync.mappingTitle')}</h3>
          <ul className="anki-sync-mappings">
            {mappings.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </>
      )}

      {state && state.unlinked.length > 0 && (
        <>
          <h3 className="anki-sync-subhead">{t('anki3.sync.unlinked.title')}</h3>
          <p className="muted">{state.unlinked.map((card) => card.word).join(', ')}</p>
        </>
      )}
    </div>
  );
}
