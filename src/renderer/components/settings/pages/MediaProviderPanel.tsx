import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../../i18n';
import SettingsCard from '../SettingsCard';
import { Button } from '../../ui';

type ProviderId = 'jikan' | 'anilist' | 'tvmaze' | 'tmdb';
type ProviderState = 'ok' | 'down' | 'needs-key' | 'checking';

/** What each real client is used for, in the order the library asks them. */
const PROVIDERS: ReadonlyArray<{ id: ProviderId; name: string; covers: string }> = [
  { id: 'jikan', name: 'MyAnimeList (Jikan)', covers: 'mediaProvider.covers.anime' },
  { id: 'anilist', name: 'AniList', covers: 'mediaProvider.covers.anime' },
  { id: 'tvmaze', name: 'TVmaze', covers: 'mediaProvider.covers.tv' },
  { id: 'tmdb', name: 'TMDB', covers: 'mediaProvider.covers.films' },
];

/**
 * The metadata sources the library really uses, and whether each answers now.
 *
 * This card used to be an editor for a provider document that nothing wrote —
 * a JSON import box, a capability planner and a tracking table over an empty
 * list, all showing raw ids. What the learner needs to know is simpler: which
 * source fills anime, dramas and films, and whether it is reachable (TMDB also
 * needs a key, set in Settings › Keys).
 */
export default function MediaProviderPanel() {
  const { t } = useT();
  const [states, setStates] = useState<Record<ProviderId, { state: ProviderState; latencyMs?: number }>>(() =>
    Object.fromEntries(PROVIDERS.map((p) => [p.id, { state: 'checking' as ProviderState }])) as Record<ProviderId, { state: ProviderState }>,
  );

  const check = useCallback(() => {
    setStates((prev) => Object.fromEntries(Object.keys(prev).map((id) => [id, { state: 'checking' as ProviderState }])) as typeof prev);
    void window.api
      .mediaProviderStatus()
      .then((list) => {
        setStates((prev) => {
          const next = { ...prev };
          for (const entry of list) next[entry.id] = { state: entry.state, latencyMs: entry.latencyMs };
          return next;
        });
      })
      .catch(() => {
        setStates((prev) => Object.fromEntries(Object.keys(prev).map((id) => [id, { state: 'down' as ProviderState }])) as typeof prev);
      });
  }, []);

  useEffect(check, [check]);

  return (
    <SettingsCard
      id="media-providers"
      title={t('mediaProvider.title')}
      description={t('mediaProvider.desc')}
      trailing={<Button size="sm" onClick={check}>{t('mediaProvider.recheck')}</Button>}
    >
      <ul className="media-provider-list">
        {PROVIDERS.map((provider) => {
          const entry = states[provider.id];
          return (
            <li key={provider.id} className="media-provider-row">
              <span className="media-provider-name">
                <strong>{provider.name}</strong>
                <small className="muted">{t(provider.covers)}</small>
              </span>
              <span className={`media-provider-state is-${entry.state}`} role="status">
                {t(`mediaProvider.state.${entry.state}`)}
                {entry.state === 'ok' && entry.latencyMs !== undefined && (
                  <small className="muted"> {t('mediaProvider.latency', { ms: entry.latencyMs })}</small>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </SettingsCard>
  );
}
