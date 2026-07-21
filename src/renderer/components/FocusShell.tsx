/**
 * Focus Mode shell — library, reader, dictionary, Anki, mini music.
 * No desktop, living layer, widgets, or taskbar.
 */
import { useCallback, useEffect, useState } from 'react';
import type { LibraryItem } from '../../shared/types';
import Icon from './Icons';
import FocusMusicBar from './FocusMusicBar';
import FocusLockBadge from './FocusLockBadge';
import LibraryView from '../views/LibraryView';
import DictionaryView from '../views/DictionaryView';
import AnkiView from '../views/AnkiView';
import NovelReader from '../views/NovelReader';
import MangaReader from '../views/MangaReader';
import {
  getInitialFocusTab,
  isFocusLocked,
  loadFocusSettings,
  onFocusSettingsChanged,
  saveFocusLastTab,
  setFocusMode,
  type FocusTabId,
} from '../focusMode';
import { registerCommandHandler } from '../keyboardShortcuts';
import { useT } from '../i18n';

const TABS: { id: FocusTabId; labelKey: string; icon: 'library' | 'dictionary' | 'anki' }[] = [
  { id: 'library', labelKey: 'focus.tab.library', icon: 'library' },
  { id: 'dictionary', labelKey: 'focus.tab.dictionary', icon: 'dictionary' },
  { id: 'anki', labelKey: 'focus.tab.anki', icon: 'anki' },
];

export default function FocusShell({
  initialBook = null,
  onInitialBookConsumed,
}: {
  initialBook?: LibraryItem | null;
  onInitialBookConsumed?: () => void;
}) {
  const { t } = useT();
  const [settings, setSettings] = useState(loadFocusSettings);
  const [tab, setTab] = useState<FocusTabId>(() => getInitialFocusTab());
  const [reading, setReading] = useState<LibraryItem | null>(initialBook ?? null);
  const [locked, setLocked] = useState(isFocusLocked);

  useEffect(() => onFocusSettingsChanged(setSettings), []);

  useEffect(() => {
    const tick = () => setLocked(isFocusLocked());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (initialBook) {
      setReading(initialBook);
      onInitialBookConsumed?.();
    }
  }, [initialBook, onInitialBookConsumed]);

  const setTabAndRemember = useCallback((next: FocusTabId) => {
    setTab(next);
    saveFocusLastTab(next);
  }, []);

  const exit = useCallback(() => {
    setFocusMode(false);
  }, []);

  const openBook = useCallback((item: LibraryItem) => {
    setReading(item);
  }, []);

  const closeBook = useCallback(() => {
    setReading(null);
    setTabAndRemember('library');
  }, [setTabAndRemember]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (document.querySelector('.dict-popup, .sentence-translate-popup, .reader-collection-panel')) {
        return;
      }
      if (reading) {
        e.preventDefault();
        closeBook();
        return;
      }
      if (isFocusLocked()) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      exit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reading, closeBook, exit]);

  useEffect(() => {
    return registerCommandHandler('nav.home', () => {
      if (reading) closeBook();
      return false;
    });
  }, [reading, closeBook]);

  useEffect(() => {
    return registerCommandHandler('study.focusMode', () => {
      if (isFocusLocked()) return true;
      setFocusMode(false);
      return true;
    });
  }, []);

  const shellClass = `focus-shell${settings.minimalChrome ? ' is-minimal' : ''}${reading ? ' focus-shell-reading' : ''}`;
  const exitBtn = (
    <button
      type="button"
      className={`btn small focus-exit-btn${locked ? ' is-locked' : ''}`}
      onClick={exit}
      disabled={locked}
      title={locked ? t('focus.lock.exitBlocked') : t('focus.exitHint')}
    >
      {locked ? t('focus.exitLocked') : t('focus.exit')}
    </button>
  );

  if (reading) {
    return (
      <div className={shellClass}>
        <header className="focus-bar">
          <div className="focus-bar-left">
            <span className="focus-brand muted">{t('focus.brand')}</span>
            <FocusLockBadge />
            <button type="button" className="btn small" onClick={closeBook}>
              {t('focus.tab.library')}
            </button>
          </div>
          {!settings.hideMusicBar && <FocusMusicBar />}
          {exitBtn}
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
    <div className={shellClass}>
      <header className="focus-bar">
        <div className="focus-bar-left">
          <span className="focus-brand">{t('focus.brand')}</span>
          <FocusLockBadge />
          <nav className="focus-nav" aria-label={t('focus.navAria')}>
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`focus-nav-btn${tab === item.id ? ' active' : ''}`}
                title={settings.minimalChrome ? t(item.labelKey) : undefined}
                onClick={() => setTabAndRemember(item.id)}
              >
                <Icon name={item.icon} size={15} />
                {!settings.minimalChrome && <span>{t(item.labelKey)}</span>}
              </button>
            ))}
          </nav>
        </div>
        {!settings.hideMusicBar && <FocusMusicBar />}
        {exitBtn}
      </header>
      <main className="focus-main">
        {tab === 'library' && <LibraryView onOpen={openBook} />}
        {tab === 'dictionary' && <DictionaryView />}
        {tab === 'anki' && <AnkiView />}
      </main>
    </div>
  );
}
