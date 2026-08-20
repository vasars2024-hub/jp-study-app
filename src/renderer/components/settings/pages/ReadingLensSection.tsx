import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '../../../i18n';
import { LANG_TAGS } from '../../../../shared/i18n/core';
import type { ReadingLensStatus } from '../../../../main/readingLens';
import type { ReadingLensSource } from '../../../../shared/readingLens';
import type { ReadingLensHistoryEntry } from '../../../../shared/readingLensHistory';

const DEFAULT_STATUS: ReadingLensStatus = {
  enabled: false,
  hotkey: 'Ctrl+Shift+Space',
  lastRegion: null,
  supported: true,
  registered: false,
  open: false,
  canRepeatRegion: false,
};

const SOURCE_LABEL_KEYS: Record<ReadingLensSource, string> = {
  screen: 'settings.lens.history.source.screen',
  clipboard: 'settings.lens.history.source.clipboard',
  image: 'settings.lens.history.source.image',
  text: 'settings.lens.history.source.text',
};

/** Build an accelerator chord ("Ctrl+Shift+D") from a captured keydown. */
function chordFromEvent(e: KeyboardEvent): string | null {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Meta');
  const key = e.key;
  if (key === 'Control' || key === 'Alt' || key === 'Shift' || key === 'Meta') return null;
  if (!mods.length) return null; // a global shortcut needs a modifier
  const main = key.length === 1 ? key.toUpperCase() : key;
  return [...mods, main].join('+');
}

/**
 * Every capture the Lens has read, searchable.
 *
 * The store is in main (`main/readingLensHistory.ts`) and holds text plus source
 * metadata only — never the screenshot — so this list is safe to render in a
 * settings page that is not behind any further consent.
 *
 * Search runs in main against the whole history rather than filtering a page
 * that was already fetched, so a match older than the visible window is still
 * findable. The source and pinned-only filters go the same way and for the same
 * reason — narrowing an already-truncated 50-row page would silently answer
 * "no captures from the clipboard" whenever the newest 50 happened to be
 * screen captures.
 */
function LensCaptureHistory() {
  const { t, lang } = useT();
  const [entries, setEntries] = useState<ReadingLensHistoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<ReadingLensSource | 'all'>('all');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [loaded, setLoaded] = useState(false);

  /** True whenever the list shown is narrower than the whole history. */
  const filtered = Boolean(query) || source !== 'all' || pinnedOnly;

  const refresh = useCallback(
    async (search: string, forSource: ReadingLensSource | 'all', onlyPinned: boolean) => {
      try {
        setEntries(await window.api.lensHistoryList({
          query: search,
          source: forSource,
          pinnedOnly: onlyPinned,
          limit: 50,
        }));
      } catch {
        setEntries([]);
      } finally {
        setLoaded(true);
      }
    },
    [],
  );

  // Debounced so typing a query does not cross IPC on every keystroke. The two
  // filters are single clicks, so they only pay the debounce a query already
  // owes.
  useEffect(() => {
    const id = window.setTimeout(() => void refresh(query, source, pinnedOnly), query ? 180 : 0);
    return () => window.clearTimeout(id);
  }, [query, source, pinnedOnly, refresh]);

  const remove = useCallback(
    async (captureId: string) => {
      await window.api.lensHistoryRemove(captureId);
      await refresh(query, source, pinnedOnly);
    },
    [query, source, pinnedOnly, refresh],
  );

  const setPinned = useCallback(
    async (captureId: string, pinned: boolean) => {
      await window.api.lensHistoryPin(captureId, pinned);
      await refresh(query, source, pinnedOnly);
    },
    [query, source, pinnedOnly, refresh],
  );

  const clear = useCallback(async () => {
    await window.api.lensHistoryClear();
    await refresh(query, source, pinnedOnly);
  }, [query, source, pinnedOnly, refresh]);

  const formatWhen = useMemo(
    () => (at: number) => new Date(at).toLocaleString(LANG_TAGS[lang]),
    [lang],
  );

  return (
    <div style={{ marginTop: 16 }}>
      <div className="os-viz-row" style={{ alignItems: 'center', gap: 8 }}>
        <span className="muted">{t('settings.lens.history.title')}</span>
        <input
          type="search"
          className="os-input"
          style={{ flex: 1, minWidth: 120 }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('settings.lens.history.searchPlaceholder')}
          aria-label={t('settings.lens.history.searchPlaceholder')}
        />
        <button
          type="button"
          className="btn small"
          disabled={!entries.length && !filtered}
          onClick={() => void clear()}
        >
          {t('settings.lens.history.clear')}
        </button>
      </div>

      <div className="os-viz-row" style={{ alignItems: 'center', gap: 8, marginTop: 6 }}>
        <select
          className="os-input"
          value={source}
          onChange={(e) => setSource(e.target.value as ReadingLensSource | 'all')}
          aria-label={t('settings.lens.history.filter.source')}
        >
          <option value="all">{t('settings.lens.history.source.all')}</option>
          {(Object.keys(SOURCE_LABEL_KEYS) as ReadingLensSource[]).map((id) => (
            <option key={id} value={id}>{t(SOURCE_LABEL_KEYS[id])}</option>
          ))}
        </select>
        <button
          type="button"
          className="btn small"
          aria-pressed={pinnedOnly}
          onClick={() => setPinnedOnly((on) => !on)}
        >
          {t('settings.lens.history.filter.pinnedOnly')}
        </button>
      </div>

      {loaded && !entries.length && (
        <p className="muted os-set-hint">
          {filtered ? t('settings.lens.history.noMatches') : t('settings.lens.history.empty')}
        </p>
      )}

      {entries.length > 0 && (
        <ul className="os-set-list" style={{ marginTop: 8 }}>
          {entries.map((entry) => (
            <li key={entry.captureId} className="os-viz-row" style={{ alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ overflowWrap: 'anywhere' }}>{entry.text}</div>
                <div className="muted" style={{ fontSize: '0.85em' }}>
                  {t(SOURCE_LABEL_KEYS[entry.source])} · {formatWhen(entry.capturedAt)}
                  {entry.seenCount > 1 && ` · ${t('settings.lens.history.seen', { count: entry.seenCount })}`}
                </div>
              </div>
              <button
                type="button"
                className="btn small"
                aria-pressed={entry.pinned}
                onClick={() => void setPinned(entry.captureId, !entry.pinned)}
                title={t(entry.pinned ? 'clipboard.unpin' : 'clipboard.pin')}
              >
                {t(entry.pinned ? 'clipboard.unpin' : 'clipboard.pin')}
              </button>
              <button
                type="button"
                className="btn small"
                onClick={() => void remove(entry.captureId)}
                aria-label={t('settings.lens.history.remove')}
                title={t('settings.lens.history.remove')}
              >
                {t('settings.lens.history.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="muted os-set-hint">{t('settings.lens.history.hint')}</p>
    </div>
  );
}

/**
 * Study → Reading Lens. Toggles the OS-wide screen-region OCR reader
 * (main/readingLens.ts), lets the user rebind its accelerator, and opens it on
 * demand. Mirrors SystemDictionarySection; the two are independent features.
 */
export default function ReadingLensSection() {
  const { t } = useT();
  const [status, setStatus] = useState<ReadingLensStatus>(DEFAULT_STATUS);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    window.api
      .lensGetSettings()
      .then((s) => {
        if (alive) setStatus(s);
      })
      .catch(() => undefined);
    const off = window.api.onLensSettingsChanged((s) => setStatus(s));
    return () => {
      alive = false;
      off();
    };
  }, []);

  // A hotkey that reports enabled-but-not-registered was rejected by the OS
  // (another app holds it) — surface that so the user knows to rebind.
  useEffect(() => {
    if (status.enabled && status.supported && !status.registered) setError(t('settings.lens.busy'));
    else setError('');
  }, [status.enabled, status.supported, status.registered, t]);

  const toggle = useCallback(async (on: boolean) => {
    const next = await window.api.lensSetEnabled(on);
    setStatus(next);
  }, []);

  useEffect(() => {
    if (!capturing) return;
    const onKey = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturing(false);
        return;
      }
      const chord = chordFromEvent(e);
      if (!chord) return;
      setCapturing(false);
      const res = await window.api.lensSetHotkey(chord);
      setStatus(res.status);
      if (!res.ok) setError(res.error || t('settings.lens.busy'));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, t]);

  return (
    <>
      <label className="os-toggle os-toggle-compact">
        <input
          type="checkbox"
          checked={status.enabled}
          onChange={(e) => void toggle(e.target.checked)}
          aria-label={t('settings.lens.enable')}
        />
        <span>{status.enabled ? t('common.on') : t('common.off')}</span>
      </label>

      <div className="os-viz-row" style={{ alignItems: 'center', gap: 8, marginTop: 8 }}>
        <span className="muted">{t('settings.lens.hotkeyLabel')}</span>
        <kbd className="sc-keys">{capturing ? t('settings.lens.capturing') : status.hotkey}</kbd>
        <button
          type="button"
          className="btn small"
          disabled={capturing}
          onClick={() => {
            setError('');
            setCapturing(true);
          }}
        >
          {t('settings.lens.change')}
        </button>
      </div>

      {error && <p className="dict-add-err">{error}</p>}

      <p className="muted os-set-hint">{t('settings.lens.hint')}</p>
      {!status.supported && <p className="muted os-set-hint">{t('settings.lens.unsupported')}</p>}

      <div className="os-viz-row" style={{ marginTop: 8 }}>
        <button
          type="button"
          className="btn small"
          disabled={!status.enabled}
          onClick={() => void window.api.lensOpen('select')}
        >
          {t('settings.lens.openNow')}
        </button>
        {/*
          Disabled on `canRepeatRegion`, which main computes from whether the
          stored region is still replayable — not from whether one was ever
          stored. A region left on a monitor that has since been unplugged
          would otherwise offer an enabled button that quietly opened an
          ordinary selection instead.
        */}
        <button
          type="button"
          className="btn small"
          disabled={!status.enabled || !status.canRepeatRegion}
          title={
            status.canRepeatRegion
              ? t('settings.lens.repeatRegionHint')
              : t('settings.lens.repeatRegionNone')
          }
          onClick={() => void window.api.lensOpen('repeat')}
        >
          {t('settings.lens.repeatRegion')}
        </button>
      </div>

      <LensCaptureHistory />
    </>
  );
}
