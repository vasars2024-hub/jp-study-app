// Shell-wide search over the page/feature registry.
//
// Renders as a popover under the field rather than a separate results page, so
// searching never loses the screen the user was already looking at.

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Icons';
import StatusDot from './StatusDot';
import { searchScraper } from './scraperRegistry';
import {
  clearRecentScraperQueries,
  getRecentScraperQueries,
  pushRecentScraperQuery,
} from './scraperRecent';
import { SCRAPER_NAV } from './scraperPages';
import { useScraper } from './ScraperContext';
import { sx } from './strings';

const QUICK_PAGE_IDS = ['dashboard', 'new-scrape', 'results', 'downloads'] as const;

export default function ScraperSearch() {
  const ctl = useScraper();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [recentQueries, setRecentQueries] = useState(getRecentScraperQueries);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => searchScraper(query, undefined, { advanced: ctl.advancedMode }),
    [query, ctl.advancedMode],
  );
  const quickPages = useMemo(
    () => QUICK_PAGE_IDS.flatMap((id) => {
      const page = SCRAPER_NAV.find((entry) => entry.id === id);
      return page ? [page] : [];
    }),
    [],
  );

  useEffect(() => {
    setCursor(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== 'k') return;
      event.preventDefault();
      setRecentQueries(getRecentScraperQueries());
      setOpen(true);
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const choose = (index: number) => {
    const hit = results[index];
    if (!hit) return;
    pushRecentScraperQuery(query);
    setRecentQueries(getRecentScraperQueries());
    ctl.navigate(hit.pageId, hit.id);
    setOpen(false);
    setQuery('');
  };

  const idle = query.trim().length === 0;

  return (
    <div className="scr-search" ref={boxRef}>
      <span className="scr-search-icon" aria-hidden>
        <Icon name="search" size={14} />
      </span>
      <input
        ref={inputRef}
        type="search"
        className="scr-search-input"
        value={query}
        placeholder={sx('app.searchPlaceholder')}
        aria-label={sx('app.search')}
        role="combobox"
        aria-expanded={open}
        aria-controls="scr-search-results"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setRecentQueries(getRecentScraperQueries());
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            return;
          }
          if (!results.length) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setCursor((c) => (c + 1) % results.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setCursor((c) => (c - 1 + results.length) % results.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            choose(cursor);
          }
        }}
      />
      <kbd className="scr-search-shortcut" aria-label={sx('app.searchShortcut')}>Ctrl K</kbd>
      {open && (
        <div
          className="scr-search-pop"
          id="scr-search-results"
          role={idle ? 'dialog' : 'listbox'}
          aria-label={sx('app.search')}
        >
          {idle ? (
            <div className="scr-search-command">
              {recentQueries.length > 0 && (
                <section className="scr-search-command-section">
                  <div className="scr-search-command-heading">
                    <span>{sx('app.searchRecent')}</span>
                    <button
                      type="button"
                      className="scr-link-btn"
                      onClick={() => {
                        clearRecentScraperQueries();
                        setRecentQueries([]);
                      }}
                    >
                      {sx('app.searchClear')}
                    </button>
                  </div>
                  <div className="scr-search-recent-list">
                    {recentQueries.map((recent) => (
                      <button
                        key={recent.toLocaleLowerCase()}
                        type="button"
                        onClick={() => {
                          setQuery(recent);
                          inputRef.current?.focus();
                        }}
                      >
                        <Icon name="history" size={14} />
                        <span>{recent}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <section className="scr-search-command-section">
                <div className="scr-search-command-heading">
                  <span>{sx('app.searchQuick')}</span>
                </div>
                <div className="scr-search-quick-grid">
                  {quickPages.map((page) => (
                    <button
                      key={page.id}
                      type="button"
                      onClick={() => {
                        ctl.navigate(page.id);
                        setOpen(false);
                      }}
                    >
                      <span className="scr-search-quick-icon">
                        <Icon name={page.icon} size={15} />
                      </span>
                      <span>{sx(page.labelKey)}</span>
                    </button>
                  ))}
                </div>
              </section>
              <p className="scr-search-command-hint">
                <Icon name="search" size={13} />
                {sx('app.searchHint')}
              </p>
            </div>
          ) : results.length === 0 ? (
            <p className="scr-search-empty">{sx('app.searchEmpty')}</p>
          ) : (
            results.map((hit, i) => (
              <button
                key={hit.id}
                type="button"
                role="option"
                aria-selected={i === cursor}
                className={`scr-search-hit${i === cursor ? ' is-cursor' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(i)}
              >
                <StatusDot id={`page.${hit.pageId}`} />
                <span className="scr-search-hit-main">
                  <span className="scr-search-hit-title">{sx(hit.titleKey)}</span>
                  {hit.descKey && (
                    <span className="scr-search-hit-desc">{sx(hit.descKey)}</span>
                  )}
                </span>
                <span className="scr-search-hit-group">{hit.group}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
