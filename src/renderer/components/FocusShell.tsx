/**
 * Focus Mode shell — library, reader, dictionary, Anki, mini music.
 * No desktop, living layer, widgets, or taskbar.
 */
import { useCallback, useEffect, useState } from 'react';
import type { LibraryItem } from '../../shared/types';
import Icon from './Icons';
import FocusMusicBar from './FocusMusicBar';
import LibraryView from '../views/LibraryView';
import DictionaryView from '../views/DictionaryView';
import AnkiView from '../views/AnkiView';
import NovelReader from '../views/NovelReader';
import MangaReader from '../views/MangaReader';
import { setFocusMode } from '../focusMode';
import { registerCommandHandler } from '../keyboardShortcuts';

type FocusTab = 'library' | 'dictionary' | 'anki';

const TABS: { id: FocusTab; label: string; icon: 'library' | 'dictionary' | 'anki' }[] = [
  { id: 'library', label: 'Library', icon: 'library' },
  { id: 'dictionary', label: 'Dictionary', icon: 'dictionary' },
  { id: 'anki', label: 'Anki', icon: 'anki' },
];

export default function FocusShell({
  initialBook = null,
  onInitialBookConsumed,
}: {
  /** Open this book immediately (e.g. entered focus from desktop reader). */
  initialBook?: LibraryItem | null;
  /** Clear parent ownership so exiting focus does not re-open the same book. */
  onInitialBookConsumed?: () => void;
}) {
  const [tab, setTab] = useState<FocusTab>('library');
  const [reading, setReading] = useState<LibraryItem | null>(initialBook ?? null);

  useEffect(() => {
    if (initialBook) {
      setReading(initialBook);
      onInitialBookConsumed?.();
    }
  }, [initialBook, onInitialBookConsumed]);

  const exit = useCallback(() => {
    setFocusMode(false);
  }, []);

  const openBook = useCallback((item: LibraryItem) => {
    setReading(item);
  }, []);

  const closeBook = useCallback(() => {
    setReading(null);
    setTab('library');
  }, []);

  // Esc: leave reader first, then exit focus (don't steal dict popup Esc if any)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      // Dictionary / sentence popups inside reader handle their own close
      if (document.querySelector('.dict-popup, .sentence-translate-popup, .reader-collection-panel')) {
        return;
      }
      if (reading) {
        e.preventDefault();
        closeBook();
        return;
      }
      e.preventDefault();
      exit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reading, closeBook, exit]);

  // Allow “return home” while focused to mean leave reader / stay in focus
  useEffect(() => {
    return registerCommandHandler('nav.home', () => {
      if (reading) closeBook();
      return false;
    });
  }, [reading, closeBook]);

  if (reading) {
    return (
      <div className="focus-shell focus-shell-reading">
        <header className="focus-bar">
          <div className="focus-bar-left">
            <span className="focus-brand muted">Focus</span>
            <button type="button" className="btn small" onClick={closeBook}>
              Library
            </button>
          </div>
          <FocusMusicBar />
          <button type="button" className="btn small" onClick={exit} title="Exit focus mode (Ctrl+Shift+E)">
            Exit focus
          </button>
        </header>
        <main className="focus-reader">
          {reading.kind === 'book' ? (
            <NovelReader item={reading} onClose={closeBook} />
          ) : (
            <MangaReader item={reading} onClose={closeBook} />
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="focus-shell">
      <header className="focus-bar">
        <div className="focus-bar-left">
          <span className="focus-brand">Focus</span>
          <nav className="focus-nav" aria-label="Focus apps">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`focus-nav-btn${tab === t.id ? ' active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                <Icon name={t.icon} size={15} />
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        </div>
        <FocusMusicBar />
        <button type="button" className="btn small" onClick={exit} title="Exit focus mode (Ctrl+Shift+E)">
          Exit focus
        </button>
      </header>
      <main className="focus-main">
        {tab === 'library' && <LibraryView onOpen={openBook} />}
        {tab === 'dictionary' && <DictionaryView />}
        {tab === 'anki' && <AnkiView />}
      </main>
    </div>
  );
}
