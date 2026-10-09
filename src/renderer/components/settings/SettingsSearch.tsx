import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import { groupLabelKey, pageMeta, SETTINGS_SEARCH_SUGGESTIONS, searchSettings } from './settingsRegistry';
import { getRecentQueries, pushRecentQuery } from './settingsRecent';
import type { SettingsPageId, SettingsRegistryEntry } from './types';
import Icon from '../Icons';
import { useT } from '../../i18n';
import { loadSettingsAdvanced } from '../../settingsAdvanced';
import { loadThemeId, onThemeChanged } from '../../theme/engine';
import { hasDiscoveredAero, onAeroDiscoveryChanged } from '../../aeroDiscovery';
import { hasDiscoveredWired, onWiredDiscoveryChanged } from '../../wiredDiscovery';

/** How recent a Tab keydown must be for the focus that follows it to count as the user's. */
const TAB_INTENT_MS = 1000;

const SettingsSearch = forwardRef<
  HTMLInputElement,
  {
    onNavigate: (page: SettingsPageId, settingId?: string) => void;
  }
>(function SettingsSearch({ onNavigate }, ref) {
  const { t, lang } = useT();
  // Prefer live advanced flag from document class (set by SettingsApp / boot).
  const advancedMode =
    typeof document !== 'undefined' && document.documentElement.classList.contains('settings-advanced')
      ? true
      : loadSettingsAdvanced();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // A theme-gated entry stops being a real destination the moment the shell
  // changes underneath an open Settings window, so this follows the same
  // `onThemeChanged` subscription the pages that render those cards use.
  const [themeId, setThemeId] = useState(loadThemeId);
  useEffect(() => onThemeChanged(setThemeId), []);
  // Discovery can happen in another window against the same profile, which is
  // why both modules broadcast a `storage` event as well as their own.
  const [aeroFound, setAeroFound] = useState(hasDiscoveredAero);
  const [wiredFound, setWiredFound] = useState(hasDiscoveredWired);
  useEffect(() => onAeroDiscoveryChanged(setAeroFound), []);
  useEffect(() => onWiredDiscoveryChanged(setWiredFound), []);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<number | null>(null);
  // Escape dismisses the panel and hands focus back to the input — and that focus move is
  // itself a focus-IN on the widget, which would re-open what was just dismissed. So the
  // dismissal is remembered until focus genuinely leaves the widget or the query changes,
  // rather than inferred from `relatedTarget`, which focus-in does not reliably carry.
  const dismissed = useRef(false);
  // What tells a user's focus from the shell's programmatic one: see `onFocusIn`.
  const pointerIntent = useRef(false);
  const lastTabAt = useRef(Number.NEGATIVE_INFINITY);
  useEffect(() => {
    // Capture on the window: the Tab keydown fires on the element focus is LEAVING, which
    // is outside this widget, so a listener on the widget never sees it.
    const onKey = (ev: globalThis.KeyboardEvent) => {
      if (ev.key === 'Tab') lastTabAt.current = performance.now();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  const results = useMemo(
    () =>
      searchSettings(query, t, {
        advanced: advancedMode,
        themeId,
        discovered: { aero: aeroFound, wired: wiredFound },
      }),
    [query, lang, advancedMode, themeId, aeroFound, wiredFound, t],
  );
  const recent = useMemo(() => (query.trim() ? [] : getRecentQueries()), [query, open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  useEffect(() => cancelClose, [cancelClose]);

  const focusInput = () => {
    const input = rootRef.current?.querySelector<HTMLInputElement>('.os-set-search-input');
    input?.focus();
  };

  // Options are real focusable buttons, so `active` has to be REAL focus and not a second,
  // independent cursor: otherwise an arrow press moves `aria-selected` while the browser's
  // focus ring stays where Tab left it, and a screen reader and a sighted keyboard user are
  // told two different things. Arrows move focus only when focus is already in the list;
  // from the input they keep the combobox behaviour they had.
  const moveActive = (next: number) => {
    setActive(next);
    const el = document.activeElement as HTMLElement | null;
    if (!el || !el.classList.contains('os-set-search-item')) return;
    const options = rootRef.current?.querySelectorAll<HTMLButtonElement>(
      '.os-set-search-item[role="option"]',
    );
    options?.[next]?.focus();
  };

  const pick = (e: SettingsRegistryEntry) => {
    pushRecentQuery(query.trim() || t(e.titleKey));
    onNavigate(e.pageId, e.id.startsWith('page-') ? undefined : e.id);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    // Candidate confirmation, navigation and cancellation belong to the IME.
    if (ev.nativeEvent.isComposing || ev.nativeEvent.keyCode === 229) return;
    if (!open && (ev.key === 'ArrowDown' || ev.key === 'Enter') && query.trim()) {
      dismissed.current = false;
      setOpen(true);
    }
    if (!open) return;
    if (ev.key === 'Escape') {
      dismissed.current = true;
      setOpen(false);
      // Escape may now be pressed while focus sits on an option, because Tab no longer
      // closes the panel. Dismissing the panel would then destroy the focused node and
      // drop focus to `document.body` — the exact defect this widget was fixed for — so
      // focus is handed back to the input the dismissal belongs to.
      focusInput();
      return;
    }
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      moveActive(Math.min(results.length - 1, active + 1));
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      moveActive(Math.max(0, active - 1));
    } else if (ev.key === 'Enter' && results[active]) {
      ev.preventDefault();
      pick(results[active]);
    }
  };

  // Closing is a property of focus leaving the WIDGET, not of the input losing focus.
  // While it lived on the input, Tab from the input into the list scheduled the close,
  // the panel unmounted under the option the browser had just focused, and focus fell to
  // `document.body` — measured live: a real Tab walk of Settings stopped after 7 stops.
  // The pointer path never saw it because every item carries `onMouseDown preventDefault`,
  // so a click never blurs the input at all. `relatedTarget` is what tells the two apart.
  //
  // Opening on focus is for a USER arriving at the field: a pointer press on it, or a Tab
  // onto it. The shell hands every newly opened window's focus to its first control (K7),
  // and this input is Settings' first, so an unconditional open dropped the suggestion
  // panel over the page every time Settings opened, hiding the breadcrumb, the page head
  // and half the navigation until the user clicked somewhere else. A focus nobody asked
  // for now leaves the panel shut; typing, ArrowDown or a click opens it.
  const onFocusIn = () => {
    cancelClose();
    const byUser = pointerIntent.current || performance.now() - lastTabAt.current < TAB_INTENT_MS;
    pointerIntent.current = false;
    if (dismissed.current || !byUser) return;
    setOpen(true);
  };
  const onFocusOut = (ev: FocusEvent<HTMLDivElement>) => {
    const next = ev.relatedTarget as Node | null;
    if (next && ev.currentTarget.contains(next)) return;
    cancelClose();
    dismissed.current = false;
    // Delay so a click on a result still registers when there is no relatedTarget.
    closeTimer.current = window.setTimeout(() => setOpen(false), 140);
  };

  const showResultList = Boolean(query.trim()) && results.length > 0;
  const recentLabelId = `${listId}-recent`;
  const suggestLabelId = `${listId}-suggested`;

  return (
    <div
      className="os-set-search"
      role="search"
      ref={rootRef}
      onFocus={onFocusIn}
      onBlur={onFocusOut}
      onKeyDown={onKeyDown}
      onPointerDown={() => {
        pointerIntent.current = true;
      }}
    >
      <Icon name="search" size={15} className="os-set-search-icon" />
      <input
        ref={ref}
        className="os-set-search-input"
        type="search"
        placeholder={t('settings.search.placeholder')}
        value={query}
        aria-label={t('settings.search.placeholder')}
        aria-controls={listId}
        aria-expanded={open && (results.length > 0 || recent.length > 0 || !query.trim())}
        aria-autocomplete="list"
        autoComplete="off"
        // A click on a field that already holds focus fires no focus event, and the shell's
        // hand-off leaves it focused with the panel shut, so the click opens it itself.
        onClick={() => {
          if (open) return;
          dismissed.current = false;
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          dismissed.current = false;
          setOpen(true);
        }}
      />
      {open && (
        <div
          id={listId}
          className="os-set-search-panel"
          // A listbox's children must be options. In the empty-query state they are two
          // labelled groups of shortcut buttons that fill the query rather than select a
          // destination, so claiming `listbox` there described the widget to a screen
          // reader as something it is not.
          role={showResultList ? 'listbox' : 'group'}
          aria-label={showResultList ? undefined : t('settings.search.placeholder')}
        >
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
                  onFocus={() => setActive(i)}
                  onClick={() => pick(r)}
                >
                  <span className="os-set-search-item-title">{t(r.titleKey)}</span>
                  <span className="os-set-search-item-path muted">
                    {/* The rail's group for the destination page (set2), so a hit
                        says where it will land; the entry's own `group` is the
                        fallback for a page that left the rail (Files). */}
                    {t(groupLabelKey(pageMeta(r.pageId)?.group || r.group))} · {(r.descKey && t(r.descKey)) || r.pageId}
                  </span>
                </button>
              ))
            ) : (
              <p className="os-set-search-empty muted">{t('settings.search.noMatches')}</p>
            )
          ) : (
            <>
              {recent.length > 0 && (
                <div className="os-set-search-section" role="group" aria-labelledby={recentLabelId}>
                  <div id={recentLabelId} className="os-set-search-section-label muted">
                    {t('settings.search.recent')}
                  </div>
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
              <div className="os-set-search-section" role="group" aria-labelledby={suggestLabelId}>
                <div id={suggestLabelId} className="os-set-search-section-label muted">
                  {t('settings.search.suggestions')}
                </div>
                {SETTINGS_SEARCH_SUGGESTIONS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="os-set-search-item"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setQuery(t(key));
                      setOpen(true);
                    }}
                  >
                    {t(key)}
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
