/**
 * Choosing a subtitle release off a torrent index.
 *
 * This is the only subtitle source the app never attaches on its own. A result
 * here is a name match against a release with no curation behind it, and
 * accepting one starts a transfer in the user's own qBittorrent — so it is a
 * decision someone makes from a list, not a step in a sweep.
 *
 * The list therefore shows what that decision needs: how big the download is,
 * how healthy the swarm is, and why each release ranked where it did. A
 * sub-pack is a few hundred KB; a batch fetches only its subtitle files and
 * skips the video. Both are labelled, because "this will cost 400 KB" and
 * "this will sit in your client until the swarm answers" are very different
 * commitments.
 *
 * Borrows `MediaMatchDialog`'s markup and classes rather than inventing a
 * second dialog style — same shape, same CSS, nothing new to keep in sync.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../ui';
import Icon from '../../Icons';
import { useT } from '../../../i18n';
import { getActiveScraperSettings } from '../../../scraperSettingsStore';
import { acquisitionConfigFrom } from '../../../../shared/subtitleNyaa';
import type { NyaaSubtitleCandidateView } from '../../../../shared/subtitleDiscoveryIpc';

export interface NyaaSubtitleDialogProps {
  mediaId: string;
  /** Languages to search for; the discovery defaults are used when empty. */
  languages: string[];
  onCancel: () => void;
  /** Fired after a successful attach so the caller can refresh its records. */
  onAttached: (lang: string) => void;
}

function formatSize(bytes: number, locale: string): string {
  if (!(bytes > 0)) return '';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString(locale)} KB`;
  if (mb < 1024) return `${Math.round(mb).toLocaleString(locale)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

export default function NyaaSubtitleDialog({
  mediaId,
  languages,
  onCancel,
  onAttached,
}: NyaaSubtitleDialogProps) {
  const { t, lang } = useT();
  const [candidates, setCandidates] = useState<NyaaSubtitleCandidateView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [accepting, setAccepting] = useState('');
  const [message, setMessage] = useState('');

  const search = useCallback(async () => {
    setBusy(true);
    setMessage('');
    try {
      const result = await window.api.listNyaaSubtitles(
        mediaId,
        acquisitionConfigFrom(getActiveScraperSettings()),
        languages,
      );
      setCandidates(result.candidates);
      // A misconfiguration and a title with no subtitle releases are different
      // problems, and main already distinguishes them — pass its message
      // through rather than flattening both to "nothing found".
      setMessage(result.message);
    } catch (error) {
      setCandidates([]);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [mediaId, languages]);

  useEffect(() => { void search(); }, [search]);

  const accept = useCallback(async (candidate: NyaaSubtitleCandidateView) => {
    setAccepting(candidate.id);
    setMessage('');
    try {
      const result = await window.api.acceptNyaaSubtitle(
        mediaId,
        candidate.id,
        acquisitionConfigFrom(getActiveScraperSettings()),
        candidate.languages[0] ?? languages[0] ?? 'ja',
      );
      if (result.ok) onAttached(result.lang ?? 'ja');
      else setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAccepting('');
    }
  }, [mediaId, languages, onAttached]);

  return (
    <div
      className="medialib-match"
      role="dialog"
      aria-modal="true"
      aria-label={t('media.subtitles.nyaa.title')}
    >
      <div className="medialib-match__head">
        <strong>{t('media.subtitles.nyaa.title')}</strong>
        <button
          type="button"
          className="medialib-drawer__close"
          onClick={onCancel}
          aria-label={t('common.close')}
        >
          <Icon name="close" size={14} />
        </button>
      </div>

      <p className="muted">{t('media.subtitles.nyaa.explainer')}</p>

      {message && <p className="medialib-match__error" role="alert">{message}</p>}

      {busy && <p className="muted">{t('media.subtitles.nyaa.searching')}</p>}

      <ul className="medialib-match__list">
        {(candidates ?? []).map((candidate) => {
          const size = formatSize(candidate.sizeBytes, lang);
          const detail = [
            t(`media.subtitles.nyaa.route.${candidate.route}`),
            size,
            t('media.subtitles.nyaa.seeders', { count: candidate.seeders }),
          ].filter(Boolean).join(' · ');

          return (
            <li key={candidate.id}>
              <div className="medialib-match__hit">
                <span className="medialib-match__text">
                  <span className="medialib-match__name">{candidate.releaseName}</span>
                  <span className="muted">{detail}</span>
                  {candidate.reasons.length > 0 && (
                    <span className="muted">{candidate.reasons.join(' · ')}</span>
                  )}
                </span>
                <Button
                  size="sm"
                  disabled={Boolean(accepting)}
                  onClick={() => void accept(candidate)}
                >
                  {accepting === candidate.id
                    ? t('media.subtitles.nyaa.fetching')
                    : t('media.subtitles.nyaa.use')}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="medialib-match__search">
        <Button size="sm" disabled={busy} onClick={() => void search()}>
          {t('media.subtitles.nyaa.retry')}
        </Button>
      </div>
    </div>
  );
}
