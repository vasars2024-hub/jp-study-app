/**
 * The manga the user shortlisted in Discover, shown where manga get READ.
 *
 * Audit r2 #24: the Discover console keeps manga on a local shortlist (they
 * are not watch-library titles), and nothing outside Discover read it — so a
 * shortlisted manga led nowhere. The Reading workspace's Discover tab lists
 * them here: "Find" hands the title to the Reading Finder beside it (the same
 * hand-off the reading lists use), and Remove takes it off the shortlist.
 * Renders nothing when there are none.
 */
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import {
  loadMediaShortlist,
  onShortlistChanged,
  removeFromShortlist,
} from '../../discoveryShortlistStore';
import type { MediaShortlistEntry } from '../../discoveryShortlistStore';

export default function MangaShortlistStrip({ onFind }: { onFind: (title: string) => void }) {
  const { t } = useT();
  const read = (): MediaShortlistEntry[] =>
    loadMediaShortlist().filter((entry) => entry.candidate.mediaType === 'manga');
  const [entries, setEntries] = useState<MediaShortlistEntry[]>(read);
  useEffect(() => onShortlistChanged(() => setEntries(read())), []);
  if (entries.length === 0) return null;
  return (
    <section className="manga-shortlist" aria-label={t('reading.mangaShortlist.title')}>
      <h3 className="manga-shortlist-title">{t('reading.mangaShortlist.title')}</h3>
      <ul className="manga-shortlist-list">
        {entries.map((entry) => {
          const title = entry.candidate.nativeTitle || entry.candidate.title;
          return (
            <li key={entry.id} className="manga-shortlist-row">
              <span className="manga-shortlist-name" title={entry.candidate.title}>
                {title}
                {entry.candidate.year ? <small> {entry.candidate.year}</small> : null}
              </span>
              <button type="button" className="btn small" onClick={() => onFind(title)}>
                {t('reading.mangaShortlist.find')}
              </button>
              <button
                type="button"
                className="btn small ghost"
                aria-label={t('reading.mangaShortlist.removeTitled', { title })}
                onClick={() => {
                  removeFromShortlist(entry.id);
                  setEntries(read());
                }}
              >
                {t('reading.mangaShortlist.remove')}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
