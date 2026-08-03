import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DiscoveryCandidate } from '../../../shared/mediaDiscovery';
import type { ReadingMangaProvider } from '../../../shared/readingIpc';
import type { ReadingChapter } from '../../../shared/readingModel';
import type { LibraryItem } from '../../../shared/types';
import MangaReader from '../../views/MangaReader';
import { useT } from '../../i18n';
import Icon from '../Icons';
import {
  isEmptyProviderResult,
  mangaChapterSecondaryTitle,
  mangaChapterSourceKey,
  type MangaChapterOrder,
  visibleMangaChapters,
} from './mangaSourcePresentation';

const INITIAL_CHAPTER_LIMIT = 60;
const CHAPTER_LIMIT_STEP = 100;

interface ProviderChapters {
  provider: ReadingMangaProvider;
  state: 'loading' | 'ready' | 'error';
  message: string;
  chapters: ReadingChapter[];
}

interface Props {
  candidate: DiscoveryCandidate;
  onClose: () => void;
}

function providerState(
  provider: ReadingMangaProvider,
  patch: Partial<ProviderChapters> = {},
): ProviderChapters {
  return {
    provider,
    state: 'loading',
    message: '',
    chapters: [],
    ...patch,
  };
}

/**
 * Provider aggregation attached to a real manga catalogue entry.
 *
 * This replaces the old hand-typed AniList-id pager. It does not render remote
 * pages itself: downloading a chapter creates a normal local LibraryItem and
 * opens the retained Study OS MangaReader, preserving OCR/mining/progress.
 */
export default function MangaProviderBrowser({ candidate, onClose }: Props) {
  const { t } = useT();
  const [sources, setSources] = useState<ProviderChapters[]>([]);
  const [loadError, setLoadError] = useState('');
  const [downloading, setDownloading] = useState('');
  const [downloadMessage, setDownloadMessage] = useState('');
  const [readerItem, setReaderItem] = useState<LibraryItem | null>(null);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [chapterQuery, setChapterQuery] = useState('');
  const [chapterOrder, setChapterOrder] = useState<MangaChapterOrder>('latest');
  const [chapterLimits, setChapterLimits] = useState<Record<string, number>>({});

  useEffect(() => {
    let dead = false;
    void window.api.listLibrary()
      .then((items) => {
        if (!dead) setLibraryItems(items);
      })
      .catch(() => {
        // Source discovery still works if the local library cannot be read.
      });
    return () => {
      dead = true;
    };
  }, []);

  useEffect(() => {
    let dead = false;
    setLoadError('');
    void window.api.readingMangaProviders().then(async (reply) => {
      if (dead) return;
      if (reply.state !== 'ready' || !reply.data) {
        setLoadError(reply.message || reply.state);
        return;
      }
      const providers = reply.data;
      setSources(providers.map((provider) => providerState(provider)));
      const settled = await Promise.all(providers.map(async (provider): Promise<ProviderChapters> => {
        const chapters = await window.api.readingMangaChapters({
          mediaId: candidate.id,
          providerId: provider.id,
        });
        if (chapters.state !== 'ready' || !chapters.data) {
          return providerState(provider, {
            state: 'error',
            message: chapters.message || chapters.state,
          });
        }
        return providerState(provider, { state: 'ready', chapters: chapters.data });
      }));
      if (!dead) setSources(settled);
    }).catch((error: unknown) => {
      if (!dead) setLoadError(error instanceof Error ? error.message : String(error));
    });
    return () => {
      dead = true;
    };
  }, [candidate.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !readerItem) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, readerItem]);

  const dialogRef = useRef<HTMLElement | null>(null);
  const backdropPressRef = useRef(false);
  // The search input carries `autoFocus`, but it only renders once providers resolve —
  // until then focus sat behind the modal, on the catalogue underneath it.
  useEffect(() => {
    if (!readerItem) dialogRef.current?.focus({ preventScroll: true });
  }, [readerItem]);

  const chapterCount = useMemo(
    () => sources.reduce((sum, source) => sum + source.chapters.length, 0),
    [sources],
  );
  const downloaded = useMemo(() => {
    const items = new Map<string, LibraryItem>();
    for (const item of libraryItems) {
      const source = item.readingSource;
      if (source?.kind !== 'seanime-manga-chapter' || source.mediaId !== candidate.id) continue;
      items.set(mangaChapterSourceKey(source.providerId, source.chapterId), item);
    }
    return items;
  }, [candidate.id, libraryItems]);

  const download = async (source: ProviderChapters, chapter: ReadingChapter) => {
    const key = mangaChapterSourceKey(source.provider.id, chapter.chapterId);
    const existing = downloaded.get(key);
    if (existing) {
      setReaderItem(existing);
      return;
    }
    setDownloading(key);
    setDownloadMessage('');
    try {
      const reply = await window.api.readingMangaDownloadChapter({
        mediaId: candidate.id,
        providerId: source.provider.id,
        providerLabel: source.provider.name,
        chapterId: chapter.chapterId,
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
        language: chapter.language || source.provider.lang,
      });
      if (reply.state !== 'ready' || !reply.data) {
        setDownloadMessage(reply.message || reply.state);
        return;
      }
      const item = reply.data.item;
      setDownloadMessage(
        reply.data.alreadyPresent
          ? t('reading.sources.alreadyDownloaded')
          : t('reading.sources.downloaded', { count: reply.data.pageCount }),
      );
      setLibraryItems((current) => [
        item,
        ...current.filter((currentItem) => currentItem.id !== item.id),
      ]);
      setReaderItem(item);
    } catch (error) {
      setDownloadMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setDownloading('');
    }
  };

  if (readerItem) {
    return createPortal(
      <MangaReader item={readerItem} onClose={() => setReaderItem(null)} />,
      document.body,
    );
  }

  return createPortal(
    <div
      className="reading-source-backdrop"
      role="presentation"
      // Was `onMouseDown={onClose}`, which discarded the dialog on the *press* — so a
      // text-selection drag that began on the backdrop closed it, with nothing to undo.
      // Require press and release to both land outside the dialog.
      onMouseDown={(event) => {
        backdropPressRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (backdropPressRef.current && event.target === event.currentTarget) onClose();
        backdropPressRef.current = false;
      }}
    >
      <section
        ref={dialogRef}
        className="reading-source-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('reading.sources.title')}
        tabIndex={-1}
      >
        <header>
          <div>
            <span className="reading-source-eyebrow">{t('reading.sources.eyebrow')}</span>
            <h2>{candidate.title}</h2>
            <p>{t('reading.sources.intro')}</p>
          </div>
          <button type="button" className="disc-pin" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="close" size={14} />
          </button>
        </header>

        {loadError ? (
          <div className="reading-source-message reading-source-error" role="alert">
            {t('reading.sources.unavailable')} — {loadError}
          </div>
        ) : null}

        {!loadError && sources.length === 0 ? (
          <div className="reading-source-message" role="status" aria-busy="true">
            {t('reading.sources.loading')}
          </div>
        ) : null}

        {sources.length > 0 ? (
          <div className="reading-source-summary">
            <div>
              <span>{t('reading.sources.providerCount', { count: sources.length })}</span>
              <span>{t('reading.sources.chapterCount', { count: chapterCount })}</span>
              {downloaded.size > 0 ? (
                <span>{t('reading.sources.downloadedCount', { count: downloaded.size })}</span>
              ) : null}
            </div>
            <div className="reading-source-tools">
              <label className="reading-source-search">
                <Icon name="search" size={13} />
                <input
                  autoFocus
                  value={chapterQuery}
                  onChange={(event) => setChapterQuery(event.target.value)}
                  placeholder={t('reading.sources.searchPlaceholder')}
                  aria-label={t('reading.sources.searchLabel')}
                />
              </label>
              {/* An aria-label on a plain div is ignored; the group role is what
                  makes it the accessible name for the pair of toggles. */}
              <div
                className="reading-source-order"
                role="group"
                aria-label={t('reading.sources.orderLabel')}
              >
                <button
                  type="button"
                  aria-pressed={chapterOrder === 'latest'}
                  onClick={() => setChapterOrder('latest')}
                >
                  {t('reading.sources.latestFirst')}
                </button>
                <button
                  type="button"
                  aria-pressed={chapterOrder === 'earliest'}
                  onClick={() => setChapterOrder('earliest')}
                >
                  {t('reading.sources.earliestFirst')}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="reading-source-list">
          {sources.map((source) => {
            const visible = visibleMangaChapters(
              source.chapters,
              chapterQuery,
              chapterOrder,
              chapterLimits[source.provider.id] ?? INITIAL_CHAPTER_LIMIT,
            );
            return (
              <section key={source.provider.id} className="reading-source-provider">
              <div className="reading-source-provider-head">
                <div>
                  <strong>{source.provider.name}</strong>
                  {source.provider.lang ? <span>{source.provider.lang.toUpperCase()}</span> : null}
                </div>
                <small>
                  {source.state === 'loading'
                    ? t('reading.sources.loading')
                    : source.state === 'error'
                      ? t('reading.sources.providerError')
                      : t('reading.sources.chapterCount', { count: source.chapters.length })}
                </small>
              </div>
              {source.state === 'error' ? (
                <div className="reading-source-provider-error">
                  <p className="reading-source-error">
                    {isEmptyProviderResult(source.message)
                      ? t('reading.sources.noMatch')
                      : t('reading.sources.providerFailed')}
                  </p>
                  <details>
                    <summary>{t('reading.sources.errorDetails')}</summary>
                    <code>{source.message}</code>
                  </details>
                </div>
              ) : null}
              {source.state === 'ready' && source.chapters.length === 0 ? (
                <p>{t('reading.sources.noChapters')}</p>
              ) : null}
              {source.state === 'ready' && source.chapters.length > 0 && visible.matchedCount === 0 ? (
                <p>{t('reading.sources.noSearchResults')}</p>
              ) : null}
              {visible.items.map((chapter) => {
                const key = mangaChapterSourceKey(source.provider.id, chapter.chapterId);
                const localItem = downloaded.get(key);
                const secondaryTitle = mangaChapterSecondaryTitle(chapter);
                return (
                  <div
                    key={chapter.chapterId}
                    className={`reading-source-chapter${localItem ? ' is-downloaded' : ''}`}
                  >
                    <div>
                      <strong>
                        {t('reading.sources.chapterLabel', {
                          number: chapter.number || chapter.index + 1,
                        })}
                      </strong>
                      {secondaryTitle ? <span>{secondaryTitle}</span> : null}
                      {chapter.scanlator ? <small>{chapter.scanlator}</small> : null}
                      {localItem ? (
                        <small className="reading-source-downloaded">
                          {t('reading.sources.inLibrary')}
                        </small>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="disc-btn disc-btn-primary"
                      // Downloads are serialised, so every other row is inert while one
                      // runs. Unexplained, that reads as the dialog having broken.
                      disabled={downloading.length > 0}
                      aria-busy={downloading === key}
                      title={downloading.length > 0 && downloading !== key
                        ? t('reading.sources.downloadBusy')
                        : undefined}
                      onClick={() => void download(source, chapter)}
                    >
                      <Icon name={localItem ? 'library' : 'download'} size={12} />
                      {downloading === key
                        ? t('reading.sources.downloading')
                        : localItem
                          ? t('reading.sources.read')
                          : t('reading.sources.download')}
                    </button>
                  </div>
                );
              })}
              {visible.hiddenCount > 0 ? (
                <button
                  type="button"
                  className="reading-source-more"
                  onClick={() => setChapterLimits((current) => ({
                    ...current,
                    [source.provider.id]:
                      (current[source.provider.id] ?? INITIAL_CHAPTER_LIMIT) + CHAPTER_LIMIT_STEP,
                  }))}
                >
                  {t('reading.sources.showMore', { count: visible.hiddenCount })}
                </button>
              ) : null}
            </section>
            );
          })}
        </div>

        {/* The live region has to exist *before* the message arrives — a region mounted
            together with its content is not reliably announced. */}
        <footer aria-live="polite" hidden={!downloadMessage}>{downloadMessage}</footer>
      </section>
    </div>,
    document.body,
  );
}
