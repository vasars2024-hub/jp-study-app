import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import {
  idleVisualNovelCaptureState,
  visualNovelErrorKey,
  type VisualNovelCaptureSource,
  type VisualNovelCaptureState,
  type VisualNovelSessionState,
} from '../../../shared/visualNovelCapture';
import {
  visualNovelSettings,
  type VisualNovelDatabase,
  type VisualNovelEntry,
  type VisualNovelTextCapture,
} from '../../../shared/visualNovel';
import { vn5SessionStats } from '../../../shared/visualNovelStudy5';
import { LANG_TAGS } from '../../../shared/i18n/core';
import VisualNovelLineFilters from './VisualNovelLineFilters';

/**
 * Live capture state, owned by main (`main/immersion/visualNovelCaptureSession.ts`)
 * and mirrored here. Every window that shows capture reads the same session,
 * so the panel, the reader window and a second pop-out can never disagree
 * about whether lines are being captured.
 */
export function useVisualNovelCapture(): VisualNovelCaptureState {
  const [state, setState] = useState<VisualNovelCaptureState>(idleVisualNovelCaptureState);
  useEffect(() => {
    let active = true;
    const api = window.api;
    if (typeof api?.visualNovelCaptureState === 'function') {
      void api.visualNovelCaptureState().then((next) => {
        if (active && next) setState(next);
      }).catch(() => undefined);
    }
    const off = typeof api?.onVisualNovelCaptureChanged === 'function'
      ? api.onVisualNovelCaptureChanged((next) => setState(next))
      : () => undefined;
    return () => {
      active = false;
      off();
    };
  }, []);
  return state;
}

const SOURCE_KEYS: Record<VisualNovelCaptureSource, string> = {
  clipboard: 'vnCapture.source.clipboard',
  websocket: 'vnCapture.source.websocket',
  hook: 'vnCapture.source.hook',
};

export const TRACKING_KEYS: Record<NonNullable<VisualNovelSessionState['tracking']>, string> = {
  child: 'vnCapture.tracking.child',
  'process-name': 'vnCapture.tracking.processName',
  idle: 'vnCapture.tracking.idle',
  manual: 'vnCapture.tracking.manual',
};

function websocketLabel(state: VisualNovelCaptureState, t: (key: string, vars?: Record<string, string | number>) => string): string {
  switch (state.websocket) {
    case 'connecting':
      return t('vnCapture.ws.connecting', { url: state.websocketUrl });
    case 'connected':
      return t('vnCapture.ws.connected');
    case 'error':
      return t('vnCapture.ws.error', { url: state.websocketUrl });
    default:
      return t('vnCapture.ws.off');
  }
}

/**
 * This capture session's reading in one line — lines, characters and an
 * AFK-aware characters-per-hour, the number texthooker pages keep on screen —
 * plus how many lines the filters threw away. Ticks every 15 s so the speed
 * moves while the player reads a long line.
 */
export function Vn5SessionStatsLine({
  captures,
  state,
}: {
  captures: readonly Pick<VisualNovelTextCapture, 'japanese' | 'capturedAt' | 'source'>[];
  state: VisualNovelCaptureState;
}) {
  const { t, lang } = useT();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!state.active || !state.startedAt) return undefined;
    const id = window.setInterval(() => setTick((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, [state.active, state.startedAt]);
  if (!state.active || state.test || !state.startedAt) return null;
  const stats = vn5SessionStats(captures, state.startedAt, Date.now());
  const nf = new Intl.NumberFormat(LANG_TAGS[lang]);
  const parts = [
    t('vn5.session.lines', { count: stats.lines }),
    t('vn5.session.chars', { chars: nf.format(stats.chars) }),
    stats.charsPerHour != null ? t('vn5.session.speed', { speed: nf.format(stats.charsPerHour) }) : '',
    state.filtered ? t('vn5.session.filtered', { count: state.filtered }) : '',
  ].filter(Boolean);
  return (
    <small className="vn5-session-stats" data-vn5-session-stats="" title={t('vn5.session.title')}>
      {parts.join(' · ')}
    </small>
  );
}

/**
 * The capture strip at the top of the Read tab: is text arriving, from where,
 * what came last, and the three actions that matter while playing.
 */
export function VisualNovelCaptureBar({
  entry,
  captures = [],
}: {
  entry: VisualNovelEntry;
  /** The novel's lines, for this session's reading speed. */
  captures?: readonly VisualNovelTextCapture[];
}) {
  const { t } = useT();
  const state = useVisualNovelCapture();
  const [error, setError] = useState('');
  const mine = state.visualNovelId === entry.id || (!state.active && state.test);
  const capturing = state.active && state.visualNovelId === entry.id && !state.test;
  const testing = state.active && state.test && state.visualNovelId === entry.id;
  const testEnded = !state.active && state.test && mine;
  // A real capture is running (for this novel or another). Test would replace
  // it, and main refuses that ('capture-running'), so the button says why it is off.
  const liveCapture = state.active && !state.test;
  const testBlockedKey = liveCapture ? 'vnCapture.test.busy' : '';

  const start = async (test: boolean): Promise<void> => {
    setError('');
    const response = await window.api.visualNovelCaptureStart(entry.id, { test });
    // The key, not main's English `error` text.
    if (!response.ok) setError(visualNovelErrorKey(response, 'vnCapture.startFailed'));
  };

  let headline = t('vnCapture.status.off');
  if (capturing) headline = t('vnCapture.status.on');
  if (testing) headline = t('vnCapture.status.test');

  return (
    <section className="vn-capture-bar" aria-label={t('vnCapture.aria')} data-state={capturing ? 'on' : testing ? 'test' : 'off'}>
      <div className="vn-capture-bar-status" aria-live="polite">
        <span className="vn-capture-dot" aria-hidden="true" />
        <strong>{headline}</strong>
        {(capturing || testing) && (
          <small>
            {state.clipboard === 'listening' ? t('vnCapture.clipboard.listening') : t('vnCapture.clipboard.off')}
            {' · '}
            {websocketLabel(state, t)}
            {state.websocket !== 'off' && state.websocket !== 'connected' && (state.reconnectAttempt ?? 0) > 0
              ? ` · ${t('vn5.ws.retry', { count: state.reconnectAttempt ?? 0 })}`
              : ''}
            {capturing ? ` · ${t('vnCapture.lines', { count: state.lines })}` : ''}
          </small>
        )}
        {capturing && <Vn5SessionStatsLine captures={captures} state={state} />}
      </div>
      {testing && !state.lastLine && <p className="muted">{t('vnCapture.test.waiting')}</p>}
      {(testing || testEnded) && state.lastLine && (
        <p className="vn-capture-test-ok">
          {t('vnCapture.test.received', { source: t(SOURCE_KEYS[state.lastLine.source]) })}
        </p>
      )}
      {testEnded && !state.lastLine && <p className="media-error">{t('vnCapture.test.none')}</p>}
      {mine && state.lastLine && (
        <p className="vn-capture-last" lang="ja">
          {state.lastLine.speaker && <b>{state.lastLine.speaker}</b>}
          <span>{state.lastLine.japanese}</span>
        </p>
      )}
      {(capturing || testing) && state.lastErrorCode && (
        <p className="media-error" data-vn-capture-error={state.lastErrorCode}>{t(visualNovelErrorKey(state, 'vnCapture.lineFailed'))}</p>
      )}
      {error && <p className="media-error">{t(error)}</p>}
      <div className="vn-capture-bar-actions">
        {capturing ? (
          <button type="button" onClick={() => void window.api.visualNovelCaptureStop()}>{t('vnCapture.stop')}</button>
        ) : (
          <button type="button" className="primary" onClick={() => void start(false)}>{t('vnCapture.start')}</button>
        )}
        <button type="button" onClick={() => void window.api.visualNovelReaderOpen(entry.id)}>{t('vnCapture.openReader')}</button>
        <button
          type="button"
          disabled={testing || liveCapture}
          title={testBlockedKey ? t(testBlockedKey) : undefined}
          data-vn-capture-test=""
          onClick={() => void start(true)}
        >
          {t('vnCapture.test')}
        </button>
      </div>
    </section>
  );
}

/**
 * The Capture setup tab: how to get the game's text here, in the fewest steps
 * that are honest about what the app does and does not do. The app never
 * injects into a game and never ships a hooker; the user installs one.
 */
export function VisualNovelCaptureSetup({
  entry,
  database,
  onDatabase,
}: {
  entry: VisualNovelEntry;
  database: VisualNovelDatabase;
  onDatabase: (database: VisualNovelDatabase) => void;
}) {
  const { t } = useT();
  const settings = visualNovelSettings(database);
  const [urlDraft, setUrlDraft] = useState(settings.websocketUrl);
  useEffect(() => setUrlDraft(settings.websocketUrl), [settings.websocketUrl]);

  const update = async (patch: Parameters<typeof window.api.visualNovelUpdateSettings>[0]): Promise<void> => {
    onDatabase(await window.api.visualNovelUpdateSettings(patch));
  };

  const chooseLocaleEmulator = async (): Promise<void> => {
    const response = await window.api.visualNovelPickLocaleEmulator();
    if (response.ok && response.database) onDatabase(response.database);
  };

  const setClipboard = async (enabled: boolean): Promise<void> => {
    const response = await window.api.visualNovelUpdateMetadata(entry.id, { clipboardCapture: enabled });
    if (response.ok && response.database) onDatabase(response.database);
  };

  return (
    <section className="vn-capture-setup" aria-label={t('vnCapture.setup.aria')}>
      <p className="muted">{t('vnCapture.setup.intro')}</p>
      <ol className="vn-capture-steps">
        <li>{t('vnCapture.setup.step1')}</li>
        <li>{t('vnCapture.setup.step2')}</li>
        <li>{t('vnCapture.setup.step3')}</li>
        <li>{t('vnCapture.setup.step4')}</li>
      </ol>
      <p className="muted">{t('vnCapture.setup.fullscreen')}</p>
      <div className="vn-capture-options">
        <label>
          <input type="checkbox" checked={entry.clipboardCapture !== false} onChange={(event) => void setClipboard(event.target.checked)} />
          {t('vnCapture.clipboardToggle')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.websocketEnabled}
            onChange={(event) => void update({ websocketEnabled: event.target.checked })}
          />
          {t('vnCapture.wsToggle')}
        </label>
        <label className="vn-capture-url">
          {t('vnCapture.wsUrl')}
          <input
            value={urlDraft}
            spellCheck={false}
            onChange={(event) => setUrlDraft(event.target.value)}
            onBlur={() => {
              if (urlDraft.trim() !== settings.websocketUrl) void update({ websocketUrl: urlDraft });
            }}
          />
        </label>
        <small className="muted">{t('vnCapture.wsHint')}</small>
        <label>
          <input
            type="checkbox"
            checked={settings.reader.autoShow}
            onChange={(event) => void update({ reader: { autoShow: event.target.checked } })}
          />
          {t('vnCapture.reader.autoShow')}
        </label>
      </div>
      <VisualNovelLineFilters entry={entry} database={database} onDatabase={onDatabase} />
      <div className="vn-capture-le">
        <strong>{t('vnCapture.le.title')}</strong>
        <p className="muted">{t('vnCapture.le.desc')}</p>
        <div>
          <code title={settings.localeEmulatorPath || undefined}>{settings.localeEmulatorPath || t('vnCapture.le.none')}</code>
          <button type="button" onClick={() => void chooseLocaleEmulator()}>{t('vnCapture.le.choose')}</button>
          {settings.localeEmulatorPath && (
            <button type="button" onClick={() => void update({ localeEmulatorPath: '' })}>{t('vnCapture.le.clear')}</button>
          )}
        </div>
      </div>
    </section>
  );
}
