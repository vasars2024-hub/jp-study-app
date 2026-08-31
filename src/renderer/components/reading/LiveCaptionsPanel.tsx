/**
 * Live Captions — arming the capture, and reading what it collected.
 *
 * Arming matters more than it looks: the Windows Live Captions window holds
 * only ~12 lines and evicts them within seconds, so nothing is recoverable
 * after the fact. Capture has to be running *before* the conversation, which is
 * why the toggle sits next to the scripts rather than buried in Settings, and
 * why the state persists across restarts.
 *
 * **Rehomed at gate 7b** (`FILES_APP_PLAN.md`). Its only mount used to be
 * `NotebookView`, which that gate deletes. It is a *capture* control, not a
 * file, so it does not become a Files row — and putting it in the Files app
 * would have made an existing capability Files-app-only, which gate 6 forbids.
 * The Reading workspace's Captures surface already declares itself the home for
 * captured text belonging to no work (`ReadingCapturesView`'s header comment),
 * which is exactly what a caption script is, so it lands there as a second
 * reading tool beside the capture list.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { LANG_TAGS, type UiLang } from '../../../shared/i18n/core';
import type { LiveCaptionsStatus } from '../../../main/liveCaptions';
import {
  type CaptionLang,
  type CaptionScript,
  scriptText,
  scriptTitle,
  sortScriptsByLang,
} from '../../../shared/liveCaptions';

/**
 * Resolved at render rather than stored as text: a module-level table cannot
 * call `useT()`, and a language switch has to re-label these groups.
 */
const LANG_LABEL_KEYS: Record<CaptionLang, string> = {
  ja: 'reading.liveCaptions.lang.ja',
  zh: 'reading.liveCaptions.lang.zh',
  ko: 'reading.liveCaptions.lang.ko',
  ru: 'reading.liveCaptions.lang.ru',
  en: 'reading.liveCaptions.lang.en',
  und: 'reading.liveCaptions.lang.und',
};

/**
 * Module-level, so it cannot call `useT()` — the UI language comes in as an
 * argument. A bare `toLocaleDateString()` here would follow the OS locale and
 * render an English date inside a Russian panel.
 */
function formatRange(script: CaptionScript, lang: UiLang): string {
  const start = new Date(script.startedAt);
  const end = new Date(script.endedAt);
  const hhmm = (d: Date) =>
    `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
  return `${start.toLocaleDateString(LANG_TAGS[lang])} ${hhmm(start)}–${hhmm(end)}`;
}

export interface LiveCaptionsPanelProps {
  /**
   * Drop the panel's own `<h3>` when the host already names it — a
   * `ReadingCanvasTool` renders `label` as the sheet heading, and stacking a
   * second one is the commonest way a migration adds chrome while claiming to
   * remove it (`ReadingCanvas.tsx`'s `actions` comment). The description line
   * stays: it is the instruction for a control most users meet once.
   */
  headless?: boolean;
}

export default function LiveCaptionsPanel({ headless = false }: LiveCaptionsPanelProps = {}) {
  const { t, lang } = useT();
  const [status, setStatus] = useState<LiveCaptionsStatus | null>(null);
  const [scripts, setScripts] = useState<CaptionScript[]>([]);
  const [openId, setOpenId] = useState('');
  const [busy, setBusy] = useState(false);
  /**
   * Failures of the toggle itself, which `status.error` cannot carry: if main
   * never registered the handler (a renderer reloaded onto a main process older
   * than this feature), `invoke` rejects and there is no status to report it in.
   * Without this the button is simply inert, which reads as "capture is broken"
   * rather than "restart the app".
   */
  const [actionError, setActionError] = useState('');

  const refresh = useCallback(async () => {
    const api = window.api;
    if (!api?.liveCaptionsStatus) return;
    try {
      const [s, list] = await Promise.all([
        api.liveCaptionsStatus(),
        api.liveCaptionsScripts?.() ?? Promise.resolve([]),
      ]);
      setStatus(s);
      // Newest first — the script you just recorded is the one you want to read.
      setScripts([...list].reverse());
    } catch {
      /* main is not ready yet; the change event will bring us back */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const off = window.api?.onLiveCaptionsChanged?.((s) => {
      setStatus(s);
      void refresh();
    });
    return () => off?.();
  }, [refresh]);

  const toggle = useCallback(async () => {
    const api = window.api;
    if (!api) return;
    setBusy(true);
    setActionError('');
    try {
      // A refused spawn comes back as `{ ok: false }` with the reason parked in
      // `lastError`, so the `refresh` below surfaces it as `status.error`; only
      // a rejected invoke needs catching here.
      if (status?.capturing) await api.liveCaptionsStop?.();
      else await api.liveCaptionsStart?.();
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [status?.capturing, refresh]);

  const clear = useCallback(async () => {
    setBusy(true);
    setActionError('');
    try {
      await window.api?.liveCaptionsClear?.();
      setOpenId('');
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const groups = useMemo(() => sortScriptsByLang(scripts), [scripts]);

  /**
   * Counted over the whole time-ordered list, not per group: `scriptTitle` uses
   * this to append a time when a day holds more than one script, and two
   * languages recorded on the same day would otherwise both render as a bare
   * "Script 31st July".
   */
  const sameDayIndex = useMemo(() => {
    const map = new Map<string, number>();
    // `scripts` is newest-first, so an earlier same-day script sits later in
    // the array — count those.
    scripts.forEach((script, i) => {
      const day = new Date(script.startedAt).toDateString();
      map.set(
        script.id,
        scripts.slice(i + 1).filter((s) => new Date(s.startedAt).toDateString() === day).length,
      );
    });
    return map;
  }, [scripts]);

  if (status && !status.supported) {
    return (
      <section className="gx-lc-panel">
        <p className="muted">{t('reading.liveCaptions.unsupported')}</p>
      </section>
    );
  }

  const capturing = Boolean(status?.capturing);
  const stateLabel = !capturing
    ? t('reading.liveCaptions.stateOff')
    : status?.attached
      ? t('reading.liveCaptions.stateReading')
      : t('reading.liveCaptions.stateWaiting');

  return (
    <section className="gx-lc-panel">
      <div className="gx-lc-head">
        <div className="gx-lc-headings">
          {headless ? null : <h3 className="gx-lc-title">{t('reading.liveCaptions.title')}</h3>}
          <p className="muted gx-lc-desc">{t('reading.liveCaptions.desc')}</p>
        </div>
        <div className="gx-lc-actions">
          <span className={`gx-lc-state${capturing ? ' is-live' : ''}`}>{stateLabel}</span>
          <button type="button" className="btn primary" onClick={toggle} disabled={busy}>
            {capturing ? t('reading.liveCaptions.stop') : t('reading.liveCaptions.start')}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={clear}
            disabled={busy || scripts.length === 0}
          >
            {t('reading.liveCaptions.clear')}
          </button>
        </div>
      </div>

      {actionError ? (
        <p className="gx-lc-error">
          {t('reading.liveCaptions.actionFailed', { message: actionError })}
        </p>
      ) : null}

      {status?.error ? <p className="gx-lc-error">{status.error}</p> : null}

      {capturing && !status?.attached ? (
        <p className="muted gx-lc-hint">{t('reading.liveCaptions.openCaptions')}</p>
      ) : null}

      {scripts.length === 0 ? (
        <p className="muted gx-lc-empty">{t('reading.liveCaptions.empty')}</p>
      ) : (
        groups.map((group) => (
          <section key={group.lang} className="gx-lc-group">
            {/* One language is the common case, and a lone heading over the
                only list is noise — the grouping is only worth announcing
                once there is something to tell apart. */}
            {groups.length > 1 ? (
              <h4 className="gx-lc-group-title">{t(LANG_LABEL_KEYS[group.lang])}</h4>
            ) : null}
            <ul className="gx-lc-list">
              {group.scripts.map((script) => {
                const open = openId === script.id;
                return (
                  <li key={script.id} className="gx-lc-item">
                    <button
                      type="button"
                      className="gx-lc-item-btn"
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? '' : script.id)}
                    >
                      <span className="gx-lc-item-title">
                        {scriptTitle(script, Date.now(), sameDayIndex.get(script.id) ?? 0)}
                      </span>
                      <span className="muted gx-lc-item-meta">
                        {formatRange(script, lang)} ·{' '}
                        {t('reading.liveCaptions.lineCount', { count: script.lines.length })}
                      </span>
                    </button>
                    {open ? <pre className="gx-lc-text">{scriptText(script)}</pre> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}
