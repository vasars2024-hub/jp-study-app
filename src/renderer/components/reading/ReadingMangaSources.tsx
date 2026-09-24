/**
 * Manga chapters, from the Reading workspace.
 *
 * The provider dialog (`MangaProviderBrowser`) was reachable only from the
 * Scraper's Discover page, so a reader in the Reading workspace — the place
 * the Sources tab promises sources — had no way to it. This is that way in:
 * search the manga catalogue, pick a title, compare its chapters across the
 * installed providers. When no provider is installed it says so up front and
 * points at where providers are managed, instead of letting the dialog be the
 * first to find out.
 */
import { useEffect, useState, type FormEvent } from 'react';
import type { DiscoveryCandidate } from '../../../shared/mediaDiscovery';
import type { ReadingMangaCatalogueItem } from '../../../shared/readingIpc';
import { useT } from '../../i18n';
import Icon from '../Icons';
import MangaProviderBrowser, { MangaNoProviders } from './MangaProviderBrowser';
import { isLocalOnlyMangaProvider } from './mangaSourcePresentation';

type ProviderCheck = 'checking' | 'none' | 'some' | 'unknown';
type SearchState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

function candidateFrom(item: ReadingMangaCatalogueItem): DiscoveryCandidate {
  return {
    provider: 'anilist',
    id: item.mediaId,
    mediaType: 'manga',
    title: item.title,
    nativeTitle: item.titleNative || undefined,
    year: item.year ?? undefined,
    format: item.format || undefined,
    status: item.status || undefined,
    chapterCount: item.chapterCount ?? undefined,
    genres: item.genres,
    posterUrl: item.coverUrl || undefined,
  };
}

export default function ReadingMangaSources() {
  const { t } = useT();
  const [providers, setProviders] = useState<ProviderCheck>('checking');
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>('idle');
  const [error, setError] = useState('');
  const [items, setItems] = useState<ReadingMangaCatalogueItem[]>([]);
  const [open, setOpen] = useState<DiscoveryCandidate | null>(null);

  useEffect(() => {
    let dead = false;
    void Promise.resolve(window.api.readingMangaProviders?.())
      .then((reply) => {
        if (dead) return;
        // An offline sidecar is not "no providers" — the dialog explains that
        // case itself, with the backend's own message.
        if (!reply || reply.state !== 'ready' || !reply.data) {
          setProviders('unknown');
          return;
        }
        const usable = reply.data.filter((p) => !isLocalOnlyMangaProvider(p.id));
        setProviders(usable.length ? 'some' : 'none');
      })
      .catch(() => {
        if (!dead) setProviders('unknown');
      });
    return () => {
      dead = true;
    };
  }, []);

  const search = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = query.trim();
    if (!text) return;
    setState('loading');
    setError('');
    try {
      const reply = await window.api.readingMangaSearch({ search: text, page: 1, perPage: 20 });
      if (reply.state !== 'ready' || !reply.data) {
        setState('error');
        setError(reply.message || reply.state);
        return;
      }
      setItems(reply.data.items);
      setState(reply.data.items.length ? 'ready' : 'empty');
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="reading-manga-sources" aria-label={t('reading.mangaSources.title')}>
      <header>
        <h2>{t('reading.mangaSources.title')}</h2>
        <p className="muted">{t('reading.mangaSources.intro')}</p>
      </header>

      {providers === 'none' ? <MangaNoProviders /> : null}

      <form className="reading-manga-sources-search" onSubmit={(event) => void search(event)}>
        <label className="reading-source-search">
          <Icon name="search" size={13} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('reading.mangaSources.searchPlaceholder')}
            aria-label={t('reading.mangaSources.searchLabel')}
          />
        </label>
        <button type="submit" className="disc-btn disc-btn-primary" disabled={!query.trim() || state === 'loading'}>
          {state === 'loading' ? t('reading.mangaSources.searching') : t('reading.mangaSources.search')}
        </button>
      </form>

      {state === 'empty' ? (
        <p className="muted" role="status">{t('reading.mangaSources.noResults', { query: query.trim() })}</p>
      ) : null}
      {state === 'error' ? (
        <p className="reading-source-error" role="alert">
          {t('reading.sources.unavailable')} — {error}
        </p>
      ) : null}

      {state === 'ready' ? (
        <ul className="reading-manga-sources-list">
          {items.map((item) => (
            <li key={item.mediaId}>
              <div>
                <strong>{item.title}</strong>
                {item.titleNative ? <span lang="ja">{item.titleNative}</span> : null}
              </div>
              <button type="button" className="disc-btn" onClick={() => setOpen(candidateFrom(item))}>
                <Icon name="library" size={12} />
                {t('reading.sources.find')}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? <MangaProviderBrowser candidate={open} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}
