/**
 * The Screen Recorder's launcher (Blanc's toolbox tool): start a recording and
 * see the recent ones. Everything happens in main and in the recorder's own
 * windows; this is only the button and the list.
 */
import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { formatRecorderClock, recordedMs, type RecorderState } from '../../shared/regionRecorder';

export default function RecorderLauncherPanel() {
  const { t } = useT();
  const [state, setState] = useState<RecorderState | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (typeof window.api?.recorderGetState !== 'function') return undefined;
    let alive = true;
    void window.api.recorderGetState().then((s) => alive && s && setState(s)).catch(() => undefined);
    const off = window.api.onRecorderState((s) => setState(s));
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      off();
      window.clearInterval(timer);
    };
  }, []);

  const busy = state?.phase === 'recording' || state?.phase === 'paused' || state?.phase === 'starting';
  return (
    <section className="blanc-panel" aria-label={t('recorder.tool')}>
      <p className="muted">{t('recorder.tool.desc')}</p>
      <div className="blanc-row">
        <button type="button" className="blanc-btn" onClick={() => void window.api.recorderStart('select')}>
          {busy ? t('recorder.pill.stop') : t('recorder.settings.start')}
        </button>
        <button type="button" className="blanc-btn" disabled={busy || !state?.settings.lastRegion} onClick={() => void window.api.recorderStart('repeat')}>
          {t('recorder.settings.repeat')}
        </button>
        <button type="button" className="blanc-btn" disabled={busy} onClick={() => void window.api.recorderStart('full')}>
          {t('recorder.settings.full')}
        </button>
      </div>
      {busy && state?.startedAt && (
        <p>{t('recorder.tool.recording', { time: formatRecorderClock(recordedMs(state.startedAt, now, state.pausedTotalMs, state.pausedSince)) })}</p>
      )}
      {state?.jobs.length ? (
        <ul className="blanc-list">
          {[...state.jobs].reverse().map((job) => (
            <li key={job.id}>
              <span>{job.title}</span>
              {job.outputPath && (
                <button type="button" className="blanc-btn" onClick={() => void window.api.recorderJobAction(job.id, 'open')}>
                  {t('recorder.job.open')}
                </button>
              )}
              <button type="button" className="blanc-btn" onClick={() => void window.api.recorderJobAction(job.id, 'show')}>
                {t('recorder.job.show')}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
