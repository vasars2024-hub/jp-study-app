/**
 * Pick an OpenSubtitles release by hand — the drama and film counterpart of
 * the Nyaa dialog. Lists every release the tiered search finds for this file
 * (hash first), with its group, language and match score; Use downloads it,
 * aligns it to the audio and attaches it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../ui';
import Icon from '../../Icons';
import { useModalKeyboard } from '../../ui/useModalKeyboard';
import { useT } from '../../../i18n';
import type { OpenSubtitlesCandidateView } from '../../../../shared/subtitleDiscoveryIpc';

export default function OpenSubtitlesDialog({
  mediaId,
  onCancel,
  onAttached,
}: {
  mediaId: string;
  onCancel: () => void;
  onAttached: (lang: string) => void;
}) {
  const { t } = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const [candidates, setCandidates] = useState<OpenSubtitlesCandidateView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [accepting, setAccepting] = useState('');
  const [message, setMessage] = useState('');

  const search = useCallback(async () => {
    setBusy(true);
    setMessage('');
    try {
      const result = await window.api.listOpenSubtitles(mediaId);
      setCandidates(result.candidates);
      if (!result.candidates.length) setMessage(result.message || t('media.subtitles.os.none'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [mediaId, t]);

  useEffect(() => {
    void search();
  }, [search]);

  const accept = async (candidate: OpenSubtitlesCandidateView) => {
    setAccepting(candidate.id);
    setMessage('');
    try {
      const result = await window.api.acceptOpenSubtitles(mediaId, candidate.id);
      if (result.ok) onAttached(result.lang ?? candidate.language);
      else setMessage(result.message);
    } finally {
      setAccepting('');
    }
  };

  useModalKeyboard({ panelRef, onEscape: accepting ? null : onCancel });

  return (
    <div ref={panelRef} tabIndex={-1} className="medialib-match" role="dialog" aria-modal="true" aria-label={t('media.subtitles.os.title')}>
      <div className="medialib-match__head">
        <strong>{t('media.subtitles.os.title')}</strong>
        <button type="button" className="medialib-drawer__close" onClick={onCancel} aria-label={t('common.close')}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <p className="muted">{t('media.subtitles.os.explainer')}</p>
      {message && <p className="medialib-match__error" role="alert">{message}</p>}
      {busy && <p className="muted">{t('media.subtitles.searching')}</p>}
      <ul className="medialib-match__list">
        {(candidates ?? []).map((candidate) => {
          const detail = [
            candidate.releaseGroup ? t('media.subtitles.group', { group: candidate.releaseGroup }) : null,
            candidate.language,
            candidate.hashMatch ? t('media.subtitles.os.exactFile') : t('media.subtitles.confidence', { percent: candidate.score }),
            candidate.hearingImpaired ? t('media.subtitles.os.hi') : null,
            candidate.downloads ? t('media.subtitles.os.downloads', { count: candidate.downloads }) : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <li key={candidate.id}>
              <div className="medialib-match__hit">
                <span className="medialib-match__text">
                  <span className="medialib-match__name">{candidate.releaseName}</span>
                  <span className="muted">{detail}</span>
                </span>
                <Button size="sm" disabled={Boolean(accepting)} onClick={() => void accept(candidate)}>
                  {accepting === candidate.id ? t('media.subtitles.nyaa.fetching') : t('media.subtitles.nyaa.use')}
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
