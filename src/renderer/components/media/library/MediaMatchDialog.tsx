/**
 * Manual metadata correction.
 *
 * The counterpart to flagging a low-confidence match instead of trusting it: the
 * flag is only worth showing if the user can act on it. Search results carry the
 * confidence the matcher gave them, so a wrong auto-match is visibly wrong next
 * to the right answer.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button, Input } from '../../ui';
import Icon from '../../Icons';
import { useT } from '../../../i18n';
import type { MediaMetadataSearchHit } from '../../../../shared/mediaMetadataIpc';

export interface MediaMatchDialogProps {
  /** Initial query — the series title as parsed from the file names. */
  initialQuery: string;
  onCancel: () => void;
  onPick: (hit: MediaMetadataSearchHit) => void;
}

export default function MediaMatchDialog({ initialQuery, onCancel, onPick }: MediaMatchDialogProps) {
  const { t } = useT();
  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<MediaMetadataSearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const search = useCallback(async (value: string) => {
    const term = value.trim();
    if (!term) return;
    setBusy(true);
    setError('');
    try {
      setHits(await window.api.searchMediaMetadata(term));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setHits([]);
    } finally {
      setBusy(false);
    }
  }, []);

  // Search once on open with the parsed title, which is usually right enough to
  // put the correct answer on screen without the user typing anything.
  useEffect(() => {
    void search(initialQuery);
  }, [initialQuery, search]);

  return (
    <div className="medialib-match" role="dialog" aria-modal="true" aria-label={t('media.match.title')}>
      <div className="medialib-match__head">
        <strong>{t('media.match.title')}</strong>
        <button type="button" className="medialib-drawer__close" onClick={onCancel} aria-label={t('common.close')}>
          <Icon name="close" size={14} />
        </button>
      </div>

      <form
        className="medialib-match__search"
        onSubmit={(e) => {
          e.preventDefault();
          void search(query);
        }}
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('media.match.search')}
          placeholder={t('media.match.search')}
        />
        <Button type="submit" disabled={busy || !query.trim()}>
          {busy ? t('media.match.searching') : t('media.match.searchAction')}
        </Button>
      </form>

      {error && <p className="medialib-match__error" role="alert">{error}</p>}

      {hits !== null && hits.length === 0 && !busy && (
        <p className="muted">{t('media.match.noResults')}</p>
      )}

      <ul className="medialib-match__list">
        {(hits ?? []).map((hit) => (
          <li key={`${hit.provider}:${hit.id}`}>
            <button type="button" className="medialib-match__hit" onClick={() => onPick(hit)}>
              {hit.imageUrl
                ? <img src={hit.imageUrl} alt="" loading="lazy" decoding="async" />
                : <span className="medialib-match__noart" aria-hidden="true" />}
              <span className="medialib-match__text">
                <span className="medialib-match__name">{hit.title}</span>
                {hit.nativeTitle && <span className="muted">{hit.nativeTitle}</span>}
                <span className="muted">
                  {[hit.format, hit.year ? String(hit.year) : null,
                    hit.episodeCount ? t('media.detail.episodeCount', { count: hit.episodeCount }) : null]
                    .filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="medialib-match__score">{Math.round(hit.confidence * 100)}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
