/**
 * The Region Recorder's always-on-top panel (`?regionRecorder=panel`).
 *
 * While recording it is the pill: red dot, timer, mic level, Pause and Stop.
 * After Stop it is the job card for each recording — converting (with
 * progress), importing, transcribing, ready (Open / Show in folder), or what
 * failed and what to do about it — and it offers recordings a crash left
 * unfinished. It is excluded from screen capture by main.
 *
 * It also answers main's "is the Whisper model downloaded?" question (the
 * model cache lives in this origin's storage) and can download the model
 * when a job is waiting for it.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { isStudyLang } from '../../shared/studyLang';
import { formatRecorderClock, recordedMs, type RecorderJob, type RecorderState } from '../../shared/regionRecorder';
import './recorder.css';

async function whisperModelReady(lang: string): Promise<boolean> {
  const [{ isDownloadedIn, loadDownloaded }, { loadWhisperDevice, loadWhisperModelTier }] = await Promise.all([
    import('../whisperModelCache'),
    import('../whisperSettings'),
  ]);
  const study = isStudyLang(lang) ? lang : 'ja';
  return isDownloadedIn(loadDownloaded(), loadWhisperModelTier(study), loadWhisperDevice());
}

async function downloadWhisperModel(lang: string, onProgress: (pct: number) => void): Promise<void> {
  const [{ prefetchWhisperModel }, { loadWhisperDevice, loadWhisperModelTier }] = await Promise.all([
    import('../whisperModelCache'),
    import('../whisperSettings'),
  ]);
  const study = isStudyLang(lang) ? lang : 'ja';
  await prefetchWhisperModel(loadWhisperModelTier(study), loadWhisperDevice(), onProgress).done;
}

function JobRow({ job, studyLang }: { job: RecorderJob; studyLang: string }) {
  const { t } = useT();
  const [download, setDownload] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState('');
  const act = (action: Parameters<typeof window.api.recorderJobAction>[1]): void => {
    void window.api.recorderJobAction(job.id, action);
  };
  let status: string;
  if (job.phase === 'finalizing') status = t('recorder.job.finalizing', { pct: Math.round(job.progress * 100) });
  else if (job.phase === 'importing') status = t('recorder.job.importing');
  else if (job.phase === 'transcribing') {
    status = job.transcript === 'running' && job.transcriptTotal
      ? t('recorder.job.transcribingProgress', { done: job.transcriptDone ?? 0, total: job.transcriptTotal })
      : t('recorder.job.transcribing');
  } else if (job.phase === 'error') status = t(job.errorKey || 'recorder.job.error.failed');
  else status = t('recorder.job.ready');

  return (
    <div className={`rr-job rr-job--${job.phase}`} data-testid="rr-job">
      <div className="rr-job-title" title={job.outputPath ?? job.partialPath}>{job.title}</div>
      <div className="rr-job-status">{status}</div>
      {job.phase === 'finalizing' && (
        <div className="rr-progress" role="progressbar" aria-valuenow={Math.round(job.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${Math.round(job.progress * 100)}%` }} />
        </div>
      )}
      {job.stopReasonKey && <div className="rr-job-note">{t(job.stopReasonKey)}</div>}
      {job.phase === 'ready' && job.errorKey && <div className="rr-job-note">{t(job.errorKey)}</div>}
      {job.transcript === 'no-audio' && <div className="rr-job-note">{t('recorder.job.noAudio')}</div>}
      {job.transcript === 'failed' && <div className="rr-job-note">{t('recorder.job.transcriptFailed')}</div>}
      {job.transcript === 'done' && <div className="rr-job-note">{t('recorder.job.transcriptDone')}</div>}
      {job.playedDirect && <div className="rr-job-note">{t('recorder.job.playedDirect')}</div>}
      {job.transcript === 'model-missing' && (
        <div className="rr-job-note">
          {download === null ? t('recorder.job.modelMissing') : t('recorder.job.modelDownloading', { pct: download })}
          {downloadError && <span className="rr-error"> {downloadError}</span>}
        </div>
      )}
      <div className="rr-job-actions">
        {job.transcript === 'model-missing' && download === null && (
          <button
            type="button"
            className="rr-btn rr-btn--primary"
            onClick={() => {
              setDownload(0);
              setDownloadError('');
              void downloadWhisperModel(studyLang, (pct) => setDownload(pct))
                .then(() => act('transcribe'))
                .catch((err: unknown) => setDownloadError(err instanceof Error ? err.message : String(err)))
                .finally(() => setDownload(null));
            }}
          >
            {t('recorder.job.downloadModel')}
          </button>
        )}
        {job.outputPath && job.phase !== 'finalizing' && (
          <button type="button" className="rr-btn rr-btn--primary" onClick={() => act('open')}>{t('recorder.job.open')}</button>
        )}
        <button type="button" className="rr-btn" onClick={() => act('show')}>{t('recorder.job.show')}</button>
        {job.phase === 'error' && <button type="button" className="rr-btn" onClick={() => act('retry')}>{t('recorder.job.retry')}</button>}
        {job.phase !== 'finalizing' && job.phase !== 'importing' && (
          <button type="button" className="rr-btn" onClick={() => act('dismiss')}>{t('recorder.job.dismiss')}</button>
        )}
      </div>
    </div>
  );
}

export default function RecorderPanel() {
  const { t } = useT();
  const [state, setState] = useState<RecorderState | null>(null);
  const [levels, setLevels] = useState({ mic: 0, system: 0 });
  const [now, setNow] = useState(Date.now());
  const [studyLang, setStudyLang] = useState('ja');
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    void window.api.recorderGetState().then((s) => alive && s && setState(s)).catch(() => undefined);
    const offs = [
      window.api.onRecorderState((s) => setState(s)),
      window.api.onRecorderLevels((l) => setLevels(l)),
      window.api.onRecorderModelCheck(({ requestId, lang }) => {
        setStudyLang(lang);
        void whisperModelReady(lang)
          .then((ready) => window.api.recorderModelCheckReply({ requestId, ready }))
          .catch(() => window.api.recorderModelCheckReply({ requestId, ready: false }));
      }),
    ];
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => {
      alive = false;
      offs.forEach((off) => off());
      window.clearInterval(timer);
    };
  }, []);

  useLayoutEffect(() => {
    const el = root.current;
    if (el) window.api.recorderPanelResize(Math.ceil(el.getBoundingClientRect().height) + 2);
  });

  if (!state) return null;
  const live = state.phase === 'recording' || state.phase === 'paused' || state.phase === 'starting';
  const clock = state.startedAt ? formatRecorderClock(recordedMs(state.startedAt, now, state.pausedTotalMs, state.pausedSince)) : '0:00';

  return (
    <div className="rr-panel" ref={root}>
      {live && (
        <div className="rr-pill" role="group" aria-label={t('recorder.pill.label')}>
          <span className={`rr-dot${state.phase === 'paused' ? ' rr-dot--paused' : ''}`} aria-hidden="true" />
          <span className="rr-clock" aria-live="off">{state.phase === 'starting' ? t('recorder.pill.starting') : clock}</span>
          {state.mic && (
            <span className="rr-level" title={t('recorder.pill.micLevel')} aria-label={t('recorder.pill.micLevel')}>
              <span style={{ width: `${Math.round(levels.mic * 100)}%` }} />
            </span>
          )}
          <button
            type="button"
            className="rr-btn"
            disabled={state.phase === 'starting'}
            onClick={() => void window.api.recorderPause(state.phase !== 'paused')}
          >
            {state.phase === 'paused' ? t('recorder.pill.resume') : t('recorder.pill.pause')}
          </button>
          <button type="button" className="rr-btn rr-btn--stop" onClick={() => void window.api.recorderStop()}>
            {t('recorder.pill.stop')}
          </button>
        </div>
      )}
      {live && state.systemAudio === 'unsupported' && <div className="rr-note">{t('recorder.pill.noLoopback')}</div>}
      {state.phase === 'error' && (
        <div className="rr-job rr-job--error">
          <div className="rr-job-status">{t(state.errorKey || 'recorder.error.streamFailed')}</div>
          {state.errorDetail && <div className="rr-job-note">{state.errorDetail}</div>}
          <div className="rr-job-actions">
            <button type="button" className="rr-btn" onClick={() => void window.api.recorderStop()}>{t('recorder.job.dismiss')}</button>
          </div>
        </div>
      )}
      {[...state.jobs].reverse().map((job) => <JobRow key={job.id} job={job} studyLang={studyLang} />)}
      {state.recoverable.map((item) => (
        <div key={item.id} className="rr-job">
          <div className="rr-job-title">{t('recorder.recovery.title')}</div>
          <div className="rr-job-note">{t('recorder.recovery.desc', { mb: Math.max(1, Math.round(item.bytes / (1024 * 1024))) })}</div>
          <div className="rr-job-actions">
            <button type="button" className="rr-btn rr-btn--primary" onClick={() => void window.api.recorderRecoveryAction(item.id, 'finish')}>
              {t('recorder.recovery.finish')}
            </button>
            <button type="button" className="rr-btn" onClick={() => void window.api.recorderRecoveryAction(item.id, 'show')}>
              {t('recorder.job.show')}
            </button>
            <button type="button" className="rr-btn" onClick={() => void window.api.recorderRecoveryAction(item.id, 'dismiss')}>
              {t('recorder.job.dismiss')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
