import { forwardRef, useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { SETTINGS_SEARCH_SUGGESTIONS, searchSettings } from './settingsRegistry';
import { getRecentQueries, pushRecentQuery } from './settingsRecent';
import type { SettingsPageId, SettingsRegistryEntry } from './types';
import Icon from '../Icons';
import { loadSettingsAdvanced } from '../../settingsAdvanced';

const SettingsSearch = forwardRef<
  HTMLInputElement,
  {
    onNavigate: (page: SettingsPageId, settingId?: string) => void;
  }
>(function SettingsSearch({ onNavigate }, ref) {
  // Prefer live advanced flag from document class (set by SettingsApp / boot).
  const advancedMode =
    typeof document !== 'undefined' && document.documentElement.classList.contains('settings-advanced')
      ? true
      : loadSettingsAdvanced();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  // Recompute when query changes; advanced class is flipped with a full re-render of settings.
  const results = useMemo(
    () => searchSettings(query, { advanced: advancedMode }),
    [query, advancedMode],
  );
  const recent = useMemo(() => (query.trim() ? [] : getRecentQueries()), [query, open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const pick = (e: SettingsRegistryEntry) => {
    pushRecentQuery(query.trim() || e.title);
    onNavigate(e.pageId, e.id.startsWith('page-') ? undefined : e.id);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    if (!open && (ev.key === 'ArrowDown' || ev.key === 'Enter') && query.trim()) {
      setOpen(true);
    }
    if (!open) return;
    if (ev.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (ev.key === 'Enter' && results[active]) {
      ev.preventDefault();
      pick(results[active]);
    }
  };

  return (
    <div className="os-set-search" role="search">
      <Icon name="search" size={15} className="os-set-search-icon" />
      <input
        ref={ref}
        className="os-set-search-input"
        type="search"
        placeholder="Search settings"
        value={query}
        aria-label="Search settings"
        aria-controls={listId}
        aria-expanded={open && (results.length > 0 || recent.length > 0 || !query.trim())}
        aria-autocomplete="list"
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so click on result registers
          window.setTimeout(() => setOpen(false), 140);
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div id={listId} className="os-set-search-panel" role="listbox">
          {query.trim() ? (
            results.length ? (
              results.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={`os-set-search-item ${i === active ? 'active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(r)}
                >
                  <span className="os-set-search-item-title">{r.title}</span>
                  <span className="os-set-search-item-path muted">
                    {r.group} · {r.description || r.pageId}
                  </span>
                </button>
              ))
            ) : (
              <p className="os-set-search-empty muted">No matching settings</p>
            )
          ) : (
            <>
              {recent.length > 0 && (
                <div className="os-set-search-section">
                  <div className="os-set-search-section-label muted">Recent searches</div>
                  {recent.map((q) => (
                    <button
                      key={q}
                      type="button"
                      className="os-set-search-item"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setQuery(q);
                        setOpen(true);
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
              <div className="os-set-search-section">
                <div className="os-set-search-section-label muted">Suggestions</div>
                {SETTINGS_SEARCH_SUGGESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="os-set-search-item"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setQuery(q);
                      setOpen(true);
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export default SettingsSearch;
