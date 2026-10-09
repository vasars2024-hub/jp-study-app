/**
 * Blanc's mechanics in the top bar: the RAM chip (with Trim), the paused-Flow
 * chip, the Capture-inbox chip, and the two shell hotkeys (F = Flow,
 * Ctrl+Shift+X = capture). Always loaded, so it stays small: the Flow runner
 * and the inbox list are lazy chunks the shell opens on demand.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppMemoryReport } from '../../../shared/appMemory';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { t as translate, useT } from '../../i18n';
import { useVisibleInterval } from '../../useVisibleInterval';
import Icon from '../Icons';
import { blancToolLabel } from './blancToolLabels';
import { loadBlancMechSettings, onBlancMechSettingsChanged, type BlancMechSettings } from './blancMechSettings';
import { getWarmTools, subscribeWarmTools, trimWarmTools, unloadWarmTool, type WarmToolsSnapshot } from './blancWarmTools';
import { captureText, loadCaptureInbox, subscribeCaptureInbox } from './blancCaptureInbox';
import { getBlancFlowStatus, subscribeBlancFlowStatus, type BlancFlowStatus } from './blancMechBus';

/** The app-memory poll: only while the chip is on and the window is visible. */
const RAM_POLL_MS = 15_000;
const AUTO_TRIM_COOLDOWN_MS = 60_000;
/** Event the shell answers by releasing its own caches (Master search corpora). */
export const BLANC_TRIM_EVENT = 'blanc:trim';

export function useBlancMechSettings(): BlancMechSettings {
  const [settings, setSettings] = useState(() => loadBlancMechSettings());
  useEffect(() => onBlancMechSettingsChanged(setSettings), []);
  return settings;
}

export function useWarmTools(): WarmToolsSnapshot {
  const [snapshot, setSnapshot] = useState(() => getWarmTools());
  useEffect(() => {
    setSnapshot(getWarmTools());
    return subscribeWarmTools(setSnapshot);
  }, []);
  return snapshot;
}

function useFlowStatus(): BlancFlowStatus {
  const [status, setStatus] = useState(() => getBlancFlowStatus());
  useEffect(() => subscribeBlancFlowStatus(setStatus), []);
  return status;
}

function useInboxCount(): number {
  const [count, setCount] = useState(() => loadCaptureInbox().length);
  useEffect(() => subscribeCaptureInbox((items) => setCount(items.length)), []);
  return count;
}

function toast(message: string, kind: 'ok' | 'error' = 'ok'): void {
  window.dispatchEvent(new CustomEvent('os:toast', { detail: { message, kind } }));
}

function megabytes(bytes: number): number {
  return Math.round(bytes / 1024 ** 2);
}

/** Selected text: an input's selection first, then the document's. */
function selectedText(): string {
  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    const { selectionStart, selectionEnd, value } = active;
    if (selectionStart !== null && selectionEnd !== null && selectionEnd > selectionStart) {
      return value.slice(selectionStart, selectionEnd);
    }
  }
  return window.getSelection?.()?.toString() ?? '';
}

/**
 * Capture the selection, else the clipboard, else `text` when given. One
 * synchronous write; the reading and meaning are looked up later, when the
 * inbox is on screen.
 */
export async function captureToInbox(text?: string): Promise<void> {
  let value = (text ?? '').trim();
  let origin: 'typed' | 'selection' | 'clipboard' = 'typed';
  if (!value) {
    value = selectedText().trim();
    origin = 'selection';
  }
  if (!value) {
    try {
      value = ((await window.api?.clipboardReadText?.()) ?? '').trim();
    } catch {
      value = '';
    }
    origin = 'clipboard';
  }
  const item = value ? captureText(value, origin) : null;
  if (!item) {
    toast(translate('blanc.mech.capture.nothing'), 'error');
    return;
  }
  const preview = item.text.length > 24 ? `${item.text.slice(0, 24)}…` : item.text;
  toast(translate('blanc.mech.capture.done', { text: preview, count: loadCaptureInbox().length }));
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/**
 * F starts (or resumes) Flow; Ctrl+Shift+X captures. F is a bare key, so it is
 * honoured only when nothing else could want it: not while typing, not over a
 * dialog, not while a book is open (readers bind letters), and not when a
 * handler already took the key.
 */
export function useBlancMechanicsHotkeys({
  flowEnabled,
  onFlow,
}: {
  flowEnabled: boolean;
  onFlow: () => void;
}): void {
  const ref = useRef({ flowEnabled, onFlow });
  ref.current = { flowEnabled, onFlow };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.repeat) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key === 'x' && event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        void captureToInbox();
        return;
      }
      if (key !== 'f' || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      if (!ref.current.flowEnabled || isTypingTarget(event.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      ref.current.onFlow();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

/** Paused (or orphaned) Flow run: one click — or F — picks it up. */
export function FlowStatusChip({ overlayOpen, onOpen }: { overlayOpen: boolean; onOpen: () => void }) {
  const { t } = useT();
  const status = useFlowStatus();
  if (overlayOpen || (status.phase !== 'paused' && status.phase !== 'running')) return null;
  const label = t('blanc.mech.flow.chip', { count: status.remaining });
  return (
    <button type="button" className="blanc-mech-chip is-flow" onClick={onOpen} title={label} aria-label={label}>
      <Icon name="skip-forward" size={13} />
      <span>{t('blanc.mech.flow.chipShort', { count: status.remaining })}</span>
    </button>
  );
}

export function InboxChip({ onOpen }: { onOpen: () => void }) {
  const { t } = useT();
  const count = useInboxCount();
  if (count === 0) return null;
  const label = t('blanc.mech.inbox.chip', { count });
  return (
    <button type="button" className="blanc-mech-chip" onClick={onOpen} title={label} aria-label={label}>
      <Icon name="clipboard" size={13} />
      <span>{count}</span>
    </button>
  );
}

/** Unload everything that can go, then say honestly what the meter shows. */
export async function trimBlancMemory(): Promise<{ unloaded: number; releasedCacheBytes: number }> {
  const unloaded = trimWarmTools();
  window.dispatchEvent(new CustomEvent(BLANC_TRIM_EVENT));
  let releasedCacheBytes = 0;
  try {
    const { clearTokenizeCache } = await import('../../tokenizer');
    releasedCacheBytes = clearTokenizeCache();
  } catch {
    /* tokenizer never loaded: nothing to release */
  }
  return { unloaded, releasedCacheBytes };
}

export function RamChip({ activeTool }: { activeTool: string | null }) {
  const { t, lang } = useT();
  const settings = useBlancMechSettings();
  const warm = useWarmTools();
  const [report, setReport] = useState<AppMemoryReport | null>(null);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const lastAutoTrim = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const enabled = settings.ramChip && typeof window.api?.appMemoryMetrics === 'function';

  const measure = useCallback(async (): Promise<AppMemoryReport | null> => {
    try {
      const next = await window.api.appMemoryMetrics();
      setReport(next);
      return next;
    } catch {
      setReport(null);
      return null;
    }
  }, []);

  const runTrim = useCallback(async (auto: boolean): Promise<void> => {
    const before = report ? megabytes(report.totalWorkingSetBytes) : null;
    const { unloaded } = await trimBlancMemory();
    // The garbage collector frees on its own schedule; measure a moment later
    // and report what the meter actually says rather than a promise.
    window.setTimeout(() => {
      void measure().then((after) => {
        const afterMb = after ? megabytes(after.totalWorkingSetBytes) : null;
        const message = before !== null && afterMb !== null
          ? translate('blanc.mech.ram.trimmedMeasured', { count: unloaded, before, after: afterMb })
          : translate('blanc.mech.ram.trimmed', { count: unloaded });
        setNote(message);
        if (!auto) toast(message);
      });
    }, 1500);
  }, [measure, report]);

  useEffect(() => {
    if (enabled) void measure();
  }, [enabled, measure]);
  useVisibleInterval(() => {
    void measure().then((next) => {
      const s = loadBlancMechSettings();
      if (!next || !s.autoTrim) return;
      if (megabytes(next.totalWorkingSetBytes) <= s.ramBudgetMb) return;
      if (Date.now() - lastAutoTrim.current < AUTO_TRIM_COOLDOWN_MS) return;
      lastAutoTrim.current = Date.now();
      void runTrim(true);
    });
  }, RAM_POLL_MS, enabled);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent): void => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown, true);
    return () => window.removeEventListener('mousedown', onDown, true);
  }, [open]);

  if (!enabled) return null;
  const nf = new Intl.NumberFormat(LANG_TAGS[lang]);
  const totalMb = report ? megabytes(report.totalWorkingSetBytes) : null;
  const over = totalMb !== null && totalMb > settings.ramBudgetMb;
  const sumRole = (roles: string[]): number => megabytes(
    (report?.processes ?? []).filter((p) => roles.includes(p.role)).reduce((sum, p) => sum + p.workingSetBytes, 0),
  );
  const blancMb = sumRole(['blanc']);
  const studyOsMb = sumRole(['study-os', 'popout']);
  const chipLabel = totalMb === null
    ? t('blanc.mech.ram.unknown')
    : t(over ? 'blanc.mech.ram.chipOver' : 'blanc.mech.ram.chip', { mb: nf.format(totalMb), budget: nf.format(settings.ramBudgetMb) });
  const loaded = warm.loaded;
  const pinned = new Set(settings.keepWarm);

  return (
    <div className="blanc-ram" ref={wrapRef}>
      <button
        type="button"
        className={`blanc-mech-chip blanc-ram-chip${over ? ' is-over' : ''}`}
        aria-expanded={open}
        aria-controls={open ? 'blanc-ram-panel' : undefined}
        aria-label={chipLabel}
        title={chipLabel}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="monitor" size={13} />
        <span>{totalMb === null ? '—' : t('blanc.mech.ram.mb', { mb: nf.format(totalMb) })}</span>
      </button>
      {open && (
        <div
          id="blanc-ram-panel"
          className="blanc-ram-panel"
          role="region"
          aria-label={t('blanc.mech.ram.panel')}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              setOpen(false);
            }
          }}
        >
          <p className="blanc-ram-total">
            {totalMb === null
              ? t('blanc.mech.ram.unknown')
              : t('blanc.mech.ram.total', { mb: nf.format(totalMb), budget: nf.format(settings.ramBudgetMb) })}
          </p>
          {report && (
            <p className="blanc-note">
              {t('blanc.mech.ram.split', { blanc: nf.format(blancMb), studyOs: nf.format(studyOsMb) })}
            </p>
          )}
          {over && studyOsMb > 0 && <p className="blanc-note">{t('blanc.mech.ram.studyOsHint')}</p>}
          <h3>{t('blanc.mech.ram.loadedTools', { count: loaded.length })}</h3>
          {loaded.length === 0 ? (
            <p className="blanc-note">{t('blanc.mech.ram.noneLoaded')}</p>
          ) : (
            <ul className="blanc-ram-tools">
              {loaded.map((id) => {
                const label = blancToolLabel(t, id);
                const state = id === activeTool
                  ? t('blanc.mech.warm.active')
                  : pinned.has(id) ? t('blanc.mech.warm.pinned') : t('blanc.mech.warm.warm');
                return (
                  <li key={id}>
                    <span>{label}</span>
                    <span className="blanc-note">{state}</span>
                    {id !== activeTool && (
                      <button
                        type="button"
                        className="blanc-small-btn"
                        aria-label={t('blanc.mech.ram.unloadTool', { name: label })}
                        onClick={() => unloadWarmTool(id)}
                      >
                        {t('blanc.mech.ram.unload')}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="blanc-note">{t('blanc.mech.ram.budgetNote', { count: settings.warmToolLimit })}</p>
          <div className="blanc-row-actions">
            <button type="button" className="blanc-primary-action" onClick={() => void runTrim(false)}>
              {t('blanc.mech.ram.trim')}
            </button>
            <button type="button" onClick={() => void measure()}>{t('blanc.mech.ram.refresh')}</button>
          </div>
          <p className="blanc-note" role="status">{note}</p>
        </div>
      )}
    </div>
  );
}
