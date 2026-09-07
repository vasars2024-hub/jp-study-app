import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '../../../i18n';
import { confirmDialog } from '../../ui';
import { LANG_TAGS } from '../../../../shared/i18n/core';
import type { ReadingLensStatus } from '../../../../main/readingLens';
import type { ReadingLensSource } from '../../../../shared/readingLens';
import {
  READING_LENS_RETENTION_CHOICES,
  READING_LENS_RETENTION_DEFAULT,
  normalizeReadingLensRetentionDays,
  type ReadingLensHistoryEntry,
  type ReadingLensRetentionDays,
} from '../../../../shared/readingLensHistory';
import {
  READING_LENS_ENGINE_CHOICES,
  READING_LENS_ENGINE_DEFAULT,
  normalizeReadingLensEngine,
  readingLensEngineRunnable,
  readingLensOcrIsFullyOnDevice,
  type ReadingLensEngine,
  type ReadingLensEngineStatus,
} from '../../../../shared/readingLensEngine';

const DEFAULT_STATUS: ReadingLensStatus = {
  enabled: false,
  hotkey: 'Ctrl+Shift+Space',
  lastRegion: null,
  supported: true,
  registered: false,
  open: false,
  canRepeatRegion: false,
  defaultEngine: READING_LENS_ENGINE_DEFAULT,
};

const ENGINE_LABEL_KEYS: Record<ReadingLensEngine, string> = {
  auto: 'settings.lens.ocr.engine.auto',
  manga: 'settings.lens.ocr.engine.manga',
  web: 'settings.lens.ocr.engine.web',
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
  const [retention, setRetention] = useState<ReadingLensRetentionDays>(READING_LENS_RETENTION_DEFAULT);
  /** What the last retention change actually deleted; null until one is made. */
  const [retentionRemoved, setRetentionRemoved] = useState<number | null>(null);

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

  // Read once on mount; main is the authority, and the value is only changed
  // from here, so there is nothing to subscribe to.
  useEffect(() => {
    let alive = true;
    window.api
      .lensHistoryGetRetention()
      .then((days) => {
        // Normalized on the way in, not trusted. This drives a controlled
        // `<select value>`, and React throws outright on a non-scalar there —
        // one unexpected IPC payload would take the whole settings page down
        // rather than degrade. The shared normalizer is the same one main uses.
        if (alive) setRetention(normalizeReadingLensRetentionDays(days));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const changeRetention = useCallback(
    async (days: number) => {
      // The count comes back from main, which did the deleting. Reporting the
      // renderer's own before/after would be a guess: the list on screen is a
      // filtered page of 50, not the store.
      const res = await window.api.lensHistorySetRetention(days);
      setRetention(normalizeReadingLensRetentionDays(res?.retentionDays));
      setRetentionRemoved(Number.isFinite(res?.removed) ? res.removed : 0);
      await refresh(query, source, pinnedOnly);
    },
    [query, source, pinnedOnly, refresh],
  );

  const clear = useCallback(async () => {
    // `lens:history:clear` is `entries = []` in main — the whole store, not the filtered
    // page on screen, and PINNED captures go with it. Neither fact is visible from the
    // button, and there is no undo and no backup of userData, so it has to be asked.
    // The message deliberately quotes no count: this component holds a filtered page of
    // 50, so any number it named would be a guess about the store.
    const ok = await confirmDialog({
      title: t('settings.lens.history.clearTitle'),
      message: t('settings.lens.history.clearMessage'),
      confirmLabel: t('settings.lens.history.clearConfirm'),
      danger: true,
    });
    if (!ok) return;
    await window.api.lensHistoryClear();
    await refresh(query, source, pinnedOnly);
  }, [lang, query, source, pinnedOnly, refresh]);

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

      <div className="os-viz-row" style={{ alignItems: 'center', gap: 8, marginTop: 6 }}>
        <span className="muted">{t('settings.lens.history.retention.label')}</span>
        <select
          className="os-input"
          value={retention}
          onChange={(e) => void changeRetention(Number(e.target.value))}
          aria-label={t('settings.lens.history.retention.label')}
        >
          {READING_LENS_RETENTION_CHOICES.map((days) => (
            <option key={days} value={days}>
              {days === 0
                ? t('settings.lens.history.retention.off')
                : t('settings.lens.history.retention.days', { count: days })}
            </option>
          ))}
        </select>
      </div>
      {retentionRemoved !== null && (
        <p className="muted os-set-hint">
          {retentionRemoved > 0
            ? t('settings.lens.history.retention.removed', { count: retentionRemoved })
            : t('settings.lens.history.retention.none')}
        </p>
      )}
      <p className="muted os-set-hint">{t('settings.lens.history.retention.hint')}</p>

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
 * Which recognizer a scan uses by default, and the honest answer to where the
 * recognition happens.
 *
 * The two belong in one block because the second is only true of the first:
 * "runs on this device" is a property of the engines offered above it, computed
 * from `shared/readingLensEngine.ts`'s table rather than asserted here, so a
 * cloud recognizer added later cannot inherit the claim.
 *
 * Availability is read live from main on mount rather than assumed: the model
 * packs are installed from the Assets surface, so a choice this page offered
 * without checking would look accepted and then refuse on the next scan.
 */
function LensRecognition({
  engine,
  onEngine,
}: {
  engine: ReadingLensEngine;
  onEngine: (engine: ReadingLensEngine) => void;
}) {
  const { t } = useT();
  const [status, setStatus] = useState<ReadingLensEngineStatus | null>(null);

  useEffect(() => {
    let alive = true;
    window.api
      .lensOcrEngineStatus()
      .then((s) => {
        // Shape-checked, not trusted. This drives warning text that makes a
        // factual claim about the user's machine, and a malformed payload must
        // show nothing rather than a confident wrong answer.
        if (!alive || !s || typeof s !== 'object') return;
        setStatus({
          manga: s.manga === true,
          web: s.web === true,
          webLangs: Array.isArray(s.webLangs) ? s.webLangs.filter((l) => typeof l === 'string') : [],
          none: s.manga !== true && s.web !== true,
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // Only ever a warning about the engine that is actually selected — listing
  // every uninstalled engine would nag a user whose `auto` works fine.
  const chosenBroken = status !== null && !readingLensEngineRunnable(engine, status);

  return (
    <div style={{ marginTop: 16 }}>
      <div className="os-viz-row" style={{ alignItems: 'center', gap: 8 }}>
        <span className="muted">{t('settings.lens.ocr.title')}</span>
      </div>
      <div className="os-viz-row" style={{ alignItems: 'center', gap: 8, marginTop: 6 }}>
        <span className="muted">{t('settings.lens.ocr.defaultEngine')}</span>
        <select
          className="os-input"
          value={engine}
          onChange={(e) => onEngine(normalizeReadingLensEngine(e.target.value))}
          aria-label={t('settings.lens.ocr.defaultEngine')}
        >
          {READING_LENS_ENGINE_CHOICES.map((id) => (
            <option key={id} value={id}>{t(ENGINE_LABEL_KEYS[id])}</option>
          ))}
        </select>
      </div>
      <p className="muted os-set-hint">{t('settings.lens.ocr.engineHint')}</p>

      {status?.none && <p className="dict-add-err">{t('settings.lens.ocr.noneInstalled')}</p>}
      {chosenBroken && !status?.none && (
        <p className="dict-add-err">{t('settings.lens.ocr.unavailable')}</p>
      )}
      {status !== null && status.web && status.webLangs.length > 0 && (
        <p className="muted os-set-hint">
          {t('settings.lens.ocr.webLangs', { langs: status.webLangs.join(', ') })}
        </p>
      )}

      {readingLensOcrIsFullyOnDevice() && (
        <p className="muted os-set-hint">{t('settings.lens.ocr.onDevice')}</p>
      )}
      <p className="muted os-set-hint">{t('settings.lens.ocr.agentNote')}</p>
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

  // Main answers with the whole status, so the select settles on what was
  // actually stored rather than on what was clicked — the two differ whenever
  // the value did not survive normalization.
  const setDefaultEngine = useCallback(async (engine: ReadingLensEngine) => {
    setStatus(await window.api.lensSetDefaultEngine(engine));
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

      <LensRecognition
        engine={normalizeReadingLensEngine(status.defaultEngine)}
        onEngine={(next) => void setDefaultEngine(next)}
      />

      <LensCaptureHistory />
    </>
  );
}
