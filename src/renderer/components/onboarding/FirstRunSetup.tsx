/**
 * First-run setup (onb2): from a fresh install to studying in a few minutes.
 *
 *   1. Study language (and UI language)
 *   2. Level self-estimate, optionally marking the most common words known
 *   3. Dictionary, plus optional OCR and Whisper downloads with live progress
 *   4. Optional Anki connection check
 *   5. Look: Study OS, Aero, WIRED or Blanc
 *   6. Summary, then the guided tour or straight to studying
 *
 * Lazy-loaded by `App.tsx` only when `firstRunSetupPending()` says so, so the
 * Study OS boot graph never carries it. Every step persists, so a restart (or
 * "Later") resumes where the user was; "Skip setup" never asks again. The
 * downloads belong to main's download manager (or, for Whisper, a module-level
 * job) — closing the dialog does not cancel them.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { setUiLang, useT } from '../../i18n';
import { LANG_LABELS, LANG_TAGS, UI_LANGS } from '../../../shared/i18n/core';
import { STUDY_LANGS, type StudyLang } from '../../../shared/studyLang';
import { assetDependencyClosure, formatBytes, type AssetSpec } from '../../../shared/assetRegistry';
import { whisperSpec } from '../../../shared/whisperModels';
import { getStudyLang, setStudyLang } from '../../studyEnvironment';
import { useAssets } from '../../assetStore';
import { loadWhisperDevice, loadWhisperModelTier } from '../../whisperSettings';
import { isDownloadedIn, loadDownloaded, onDownloadedChanged, prefetchWhisperModel } from '../../whisperModelCache';
import { markTourComplete } from '../../onboardingStore';
import {
  FIRST_RUN_STEPS,
  FIRST_RUN_THEMES,
  LEVEL_BANDS,
  closeFirstRunSetup,
  deferFirstRunSetup,
  loadFirstRun,
  patchFirstRun,
  type FirstRunStepId,
  type FirstRunTheme,
  type LevelBand,
} from '../../firstRunSetup';
import { seedKnownWords, seedWordsFor } from '../../firstRunSeed';
import { trapTab } from '../ui/focusTrap';
import { useFocusReturn } from '../shell/focusReturn';
import { currentDeckSize } from '../../firstStepsTracker';
import { setBlancModeEnabled } from '../../blancMode';
import {
  bundleProgress,
  dictionaryAssetFor,
  ocrAssetFor,
  onWhisperJobsChanged,
  percentOf,
  startWhisperJob,
  whisperJob,
} from './firstRunDownloads';
import HelpLink from './HelpLink';
import Icon, { type IconName } from '../Icons';
import './firstRun.css';

type Outcome = 'done' | 'skipped' | 'later';

export interface FirstRunSetupProps {
  /** The dialog closed; `tour` asks the shell to run the guided tour next. */
  onClose?: (outcome: Outcome, tour: boolean) => void;
}

const STEP_ICON: Record<FirstRunStepId, IconName> = {
  language: 'globe',
  level: 'chart-bar',
  downloads: 'download',
  anki: 'anki',
  theme: 'brush',
  finish: 'check',
};

/**
 * Apply the look the user picked. Aero and WIRED play their own boot, through
 * the same doors the rest of the app uses (imported on demand: both modules
 * carry boot-time side effects this dialog has no business running).
 */
export function applyFirstRunTheme(theme: FirstRunTheme | null): void {
  if (theme === 'blanc') {
    void setBlancModeEnabled(true).catch(() => undefined);
  } else if (theme === 'aero') {
    void import('../../theme/SecretAeroTrigger')
      .then(({ SECRET_AERO_ENTER_EVENT }) => window.dispatchEvent(new CustomEvent(SECRET_AERO_ENTER_EVENT)))
      .catch(() => undefined);
  } else if (theme === 'wired') {
    void import('../../wiredArchiveLifecycle')
      .then(({ requestWiredArchiveEntry }) => requestWiredArchiveEntry())
      .catch(() => undefined);
  }
}

export default function FirstRunSetup({ onClose }: FirstRunSetupProps) {
  const { t } = useT();
  const [step, setStep] = useState<FirstRunStepId>(() => loadFirstRun().step);
  const [studyLang, setStudyLangState] = useState<StudyLang>(() => getStudyLang());
  const [level, setLevel] = useState<LevelBand>(() => loadFirstRun().level ?? 'beginner');
  const [seed, setSeed] = useState(true);
  const [theme, setTheme] = useState<FirstRunTheme>(() => loadFirstRun().theme ?? 'study-os');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // a11y3: setup reopened from Help (Restart setup) hands focus back to that
  // button when it closes, instead of dropping it on <body>.
  useFocusReturn(true, cardRef);
  const index = FIRST_RUN_STEPS.indexOf(step);

  // A new step announces itself: focus moves to its heading (the dialog is
  // modal, so this is where a keyboard or screen-reader user expects to be).
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const goTo = useCallback((next: FirstRunStepId) => {
    patchFirstRun({ step: next });
    setStep(next);
  }, []);

  const close = useCallback(
    (outcome: Outcome, tour = false) => {
      if (outcome === 'later') {
        deferFirstRunSetup();
      } else {
        // Skipping setup is a request to be left alone; the tour stays one
        // click away in Start and in Help.
        if (outcome === 'skipped' || !tour) markTourComplete();
        closeFirstRunSetup(outcome, currentDeckSize());
        if (outcome === 'done') applyFirstRunTheme(theme);
      }
      onClose?.(outcome, tour);
    },
    [onClose, theme],
  );

  const next = useCallback(async () => {
    if (step === 'level') {
      patchFirstRun({ level });
      if (seed && seedWordsFor(studyLang, level).length > 0) {
        const changed = await seedKnownWords(studyLang, level).catch(() => 0);
        patchFirstRun({ seededKnown: loadFirstRun().seededKnown + changed });
      }
    }
    if (step === 'theme') patchFirstRun({ theme });
    const following = FIRST_RUN_STEPS[index + 1];
    if (following) goTo(following);
  }, [step, level, seed, studyLang, theme, index, goTo]);

  const back = useCallback(() => {
    const previous = FIRST_RUN_STEPS[index - 1];
    if (previous) goTo(previous);
  }, [index, goTo]);

  // Escape = "Later": nothing is lost, the next launch resumes here. A simple
  // focus loop keeps Tab inside the modal card.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close('later');
      return;
    }
    // a11y3: each step focuses its heading (tabIndex -1), and Shift+Tab from
    // there used to leave the modal; the shared trap wraps from any position.
    trapTab(event, cardRef.current);
  };

  const chooseStudyLang = (value: StudyLang): void => {
    setStudyLangState(value);
    if (value !== getStudyLang()) setStudyLang(value);
  };

  const stepTitle = t(`onb2.step.${step}.title`);

  return (
    <div className="frs-root" data-first-run-step={step}>
      <div
        ref={cardRef}
        className="frs-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="frs-step-title"
        aria-describedby="frs-step-intro"
        onKeyDown={onKeyDown}
      >
        <header className="frs-head">
          <p className="frs-progress" aria-live="polite">
            {t('onb2.progress', { current: index + 1, total: FIRST_RUN_STEPS.length })}
          </p>
          <ol className="frs-steps" aria-label={t('onb2.stepsLabel')}>
            {FIRST_RUN_STEPS.map((id, i) => (
              <li
                key={id}
                className={`frs-step-dot${i < index ? ' is-done' : ''}${i === index ? ' is-current' : ''}`}
                aria-current={i === index ? 'step' : undefined}
              >
                <Icon name={STEP_ICON[id]} size={14} />
                <span className="frs-sr">{t(`onb2.step.${id}.title`)}</span>
              </li>
            ))}
          </ol>
          <h2 id="frs-step-title" className="frs-title" tabIndex={-1} ref={headingRef}>
            {stepTitle}
          </h2>
          <p id="frs-step-intro" className="frs-intro">
            {t(`onb2.step.${step}.intro`)}
          </p>
        </header>

        <div className="frs-body">
          {step === 'language' && (
            <LanguageStep studyLang={studyLang} onStudyLang={chooseStudyLang} />
          )}
          {step === 'level' && (
            <LevelStep
              studyLang={studyLang}
              level={level}
              onLevel={setLevel}
              seed={seed}
              onSeed={setSeed}
              seededKnown={loadFirstRun().seededKnown}
            />
          )}
          {step === 'downloads' && <DownloadsStep studyLang={studyLang} />}
          {step === 'anki' && <AnkiStep />}
          {step === 'theme' && <ThemeStep theme={theme} onTheme={setTheme} />}
          {step === 'finish' && <FinishStep studyLang={studyLang} level={level} theme={theme} />}
        </div>

        <footer className="frs-foot">
          <div className="frs-foot-left">
            <button type="button" className="btn frs-quiet" onClick={() => close('skipped')}>
              {t('onb2.skip')}
            </button>
            <button type="button" className="btn frs-quiet" onClick={() => close('later')}>
              {t('onb2.later')}
            </button>
          </div>
          <div className="frs-foot-right">
            {index > 0 && (
              <button type="button" className="btn" onClick={back}>
                {t('onb2.back')}
              </button>
            )}
            {step === 'finish' ? (
              <>
                <button type="button" className="btn" onClick={() => close('done', true)}>
                  {t('onb2.finish.tour')}
                </button>
                <button type="button" className="btn primary" onClick={() => close('done', false)}>
                  {t('onb2.finish.start')}
                </button>
              </>
            ) : (
              <button type="button" className="btn primary" onClick={() => void next()}>
                {step === 'anki' || step === 'downloads' ? t('onb2.continue') : t('onb2.next')}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function LanguageStep({ studyLang, onStudyLang }: { studyLang: StudyLang; onStudyLang: (lang: StudyLang) => void }) {
  const { t, lang } = useT();
  return (
    <>
      <fieldset className="frs-fieldset">
        <legend className="frs-legend">{t('onb2.language.study')}</legend>
        <div className="frs-choice-grid" role="radiogroup" aria-label={t('onb2.language.study')}>
          {STUDY_LANGS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={studyLang === id}
              className={`frs-choice${studyLang === id ? ' is-selected' : ''}`}
              onClick={() => onStudyLang(id)}
            >
              <span className="frs-choice-title" lang={LANG_TAGS[id]}>
                {LANG_LABELS[id]}
              </span>
              <span className="frs-choice-desc">{t(`onb2.language.${id}`)}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="frs-fieldset">
        <legend className="frs-legend">{t('onb2.language.ui')}</legend>
        <div className="sp-seg" role="group" aria-label={t('onb2.language.ui')}>
          {UI_LANGS.map((id) => (
            <button
              key={id}
              type="button"
              lang={LANG_TAGS[id]}
              className={`sp-seg-btn ${lang === id ? 'active' : ''}`}
              aria-pressed={lang === id}
              onClick={() => setUiLang(id)}
            >
              {LANG_LABELS[id]}
            </button>
          ))}
        </div>
      </fieldset>
    </>
  );
}

function LevelStep({
  studyLang,
  level,
  onLevel,
  seed,
  onSeed,
  seededKnown,
}: {
  studyLang: StudyLang;
  level: LevelBand;
  onLevel: (level: LevelBand) => void;
  seed: boolean;
  onSeed: (on: boolean) => void;
  seededKnown: number;
}) {
  const { t } = useT();
  const seedCount = useMemo(() => seedWordsFor(studyLang, level).length, [studyLang, level]);
  return (
    <>
      <div className="frs-choice-list" role="radiogroup" aria-label={t('onb2.step.level.title')}>
        {LEVEL_BANDS.map((band) => (
          <button
            key={band}
            type="button"
            role="radio"
            aria-checked={level === band}
            className={`frs-choice frs-choice--row${level === band ? ' is-selected' : ''}`}
            onClick={() => onLevel(band)}
          >
            <span className="frs-choice-title">{t(`onb2.level.${studyLang}.${band}`)}</span>
            <span className="frs-choice-desc">{t(`onb2.level.desc.${band}`)}</span>
          </button>
        ))}
      </div>
      <label className={`frs-check${seedCount === 0 ? ' is-disabled' : ''}`}>
        <input
          type="checkbox"
          checked={seed && seedCount > 0}
          disabled={seedCount === 0}
          onChange={(event) => onSeed(event.currentTarget.checked)}
        />
        <span>
          {seedCount > 0 ? t('onb2.level.seed', { count: seedCount }) : t('onb2.level.seedNone')}
        </span>
      </label>
      <p className="frs-note">{t('onb2.level.seedHint')}</p>
      {seededKnown > 0 && (
        <p className="frs-note" role="status">
          {t('onb2.level.seeded', { count: seededKnown })}
        </p>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

interface RowModel {
  id: string;
  label: string;
  name: string;
  desc: string;
  optional: boolean;
  /** 0..100 while busy. */
  percent: number;
  state: 'ready' | 'available' | 'busy' | 'paused' | 'failed' | 'unknown';
  sizeLabel: string;
  error: string | null;
  onStart?: () => void;
  onPause?: () => void;
}

function DownloadsStep({ studyLang }: { studyLang: StudyLang }) {
  const { t, lang } = useT();
  const { views, freeSpace, loading, start, pause } = useAssets();
  const [builtInDict, setBuiltInDict] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [whisperDone, setWhisperDone] = useState(() => loadDownloaded());

  useEffect(() => onWhisperJobsChanged(() => setTick((n) => n + 1)), []);
  useEffect(() => onDownloadedChanged(setWhisperDone), []);

  // Japanese ships its JMdict pack and provisions it on first boot; say so
  // rather than offering a download the user does not need.
  useEffect(() => {
    if (studyLang !== 'ja') {
      setBuiltInDict(false);
      return;
    }
    let alive = true;
    const list = window.api?.dictListYomitan;
    if (typeof list !== 'function') {
      setBuiltInDict(false);
      return;
    }
    void list()
      .then((dicts) => {
        if (alive) setBuiltInDict(Array.isArray(dicts) && dicts.length > 0);
      })
      .catch(() => {
        if (alive) setBuiltInDict(false);
      });
    return () => {
      alive = false;
    };
  }, [studyLang]);

  const specs = useMemo(() => views.map((view) => view.spec), [views]);
  const statusOf = useCallback((id: string) => views.find((view) => view.spec.id === id)?.status, [views]);

  const onStart = useCallback(
    async (id: string) => {
      setNotice(null);
      const result = await start(id);
      if (!result.ok && result.error) setNotice(t(result.error.key, result.error.vars));
    },
    [start, t],
  );

  const assetRow = (id: string, label: string, optional: boolean): RowModel | null => {
    const spec: AssetSpec | undefined = specs.find((entry) => entry.id === id);
    if (!spec) return null;
    const closure = assetDependencyClosure(specs, id);
    const progress = bundleProgress(closure, statusOf);
    const state: RowModel['state'] =
      progress.state === 'installed'
        ? 'ready'
        : progress.state === 'failed'
          ? 'failed'
          : progress.state === 'paused'
            ? 'paused'
            : progress.state === 'not-installed'
              ? 'available'
              : 'busy';
    return {
      id,
      label,
      name: spec.name,
      desc: spec.descriptionKey ? t(spec.descriptionKey) : spec.description,
      optional,
      percent: percentOf(progress.received, progress.total),
      state,
      sizeLabel: formatBytes(progress.total),
      error: progress.error ? t(progress.error.key, progress.error.vars) : null,
      onStart: () => void onStart(id),
      onPause: () => void pause(id),
    };
  };

  const rows: RowModel[] = [];
  if (studyLang === 'ja' && builtInDict) {
    rows.push({
      id: 'dictionary-builtin',
      label: t('onb2.dl.dictionary'),
      name: t('onb2.dl.builtInName'),
      desc: t('onb2.dl.builtInDesc'),
      optional: false,
      percent: 100,
      state: 'ready',
      sizeLabel: '',
      error: null,
    });
  } else {
    const dict = assetRow(dictionaryAssetFor(studyLang), t('onb2.dl.dictionary'), false);
    if (dict) rows.push(dict);
  }
  const ocr = assetRow(ocrAssetFor(studyLang), t('onb2.dl.ocr'), true);
  if (ocr) rows.push(ocr);

  const tier = loadWhisperModelTier(studyLang);
  const device = loadWhisperDevice();
  const job = whisperJob(tier);
  const whisperReady = isDownloadedIn(whisperDone, tier, device);
  rows.push({
    id: `whisper:${tier}`,
    label: t('onb2.dl.whisper'),
    name: t(`media.model.${tier}`),
    desc: t('onb2.dl.whisperDesc'),
    optional: true,
    percent: job?.percent ?? (whisperReady ? 100 : 0),
    state: whisperReady ? 'ready' : job?.error ? 'failed' : job?.running ? 'busy' : 'available',
    sizeLabel: formatBytes(whisperSpec(tier).sizeBytes),
    error: job?.error ? t('settings.transcription.downloadFailed', { detail: job.error }) : null,
    onStart: () => startWhisperJob(tier, (onProgress) => prefetchWhisperModel(tier, device, onProgress)),
    onPause: job?.running ? () => job.cancel() : undefined,
  });

  return (
    <>
      <ul className="frs-dl-list" aria-busy={loading}>
        {rows.map((row) => (
          <DownloadRow key={row.id} row={row} />
        ))}
      </ul>
      <p className="frs-note">
        {t('onb2.dl.background')}
        {freeSpace !== null && Number.isFinite(freeSpace) ? ` ${t('storage.freeSpace', { size: formatBytes(freeSpace) })}` : ''}
        {' '}
        <HelpLink topic="downloads" />
      </p>
      {notice && (
        <p className="frs-note frs-note--error" role="alert" lang={LANG_TAGS[lang]}>
          {notice}
        </p>
      )}
    </>
  );
}

function DownloadRow({ row }: { row: RowModel }) {
  const { t } = useT();
  const statusText =
    row.state === 'ready'
      ? t('onb2.dl.ready')
      : row.state === 'busy'
        ? t('onb2.dl.progress', { percent: row.percent })
        : row.state === 'paused'
          ? t('onb2.dl.paused', { percent: row.percent })
          : row.state === 'failed'
            ? (row.error ?? t('storage.state.failed'))
            : row.optional
              ? t('onb2.dl.optional')
              : t('onb2.dl.recommended');
  return (
    <li className={`frs-dl-row is-${row.state}`} data-download={row.id}>
      <div className="frs-dl-main">
        <span className="frs-dl-label">{row.label}</span>
        <span className="frs-dl-name">{row.name}</span>
        <span className="frs-dl-desc">{row.desc}</span>
        <span className={`frs-dl-status${row.state === 'failed' ? ' is-error' : ''}`} aria-live="polite">
          {statusText}
        </span>
        {(row.state === 'busy' || row.state === 'paused') && (
          <span
            className="frs-dl-bar"
            role="progressbar"
            aria-label={t('onb2.dl.progressLabel', { name: row.name })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={row.percent}
          >
            <span className="frs-dl-fill" style={{ width: `${row.percent}%` }} />
          </span>
        )}
      </div>
      <div className="frs-dl-actions">
        {row.state === 'ready' && <Icon name="success" size={18} />}
        {(row.state === 'available' || row.state === 'failed' || row.state === 'paused') && row.onStart && (
          <button type="button" className="btn" onClick={row.onStart}>
            {row.state === 'failed'
              ? t('common.tryAgain')
              : row.state === 'paused'
                ? t('common.resume')
                : row.sizeLabel
                  ? t('common.downloadSize', { size: row.sizeLabel })
                  : t('onb2.dl.download')}
          </button>
        )}
        {row.state === 'busy' && row.onPause && (
          <button type="button" className="btn small" onClick={row.onPause}>
            {row.id.startsWith('whisper:') ? t('common.cancel') : t('common.pause')}
          </button>
        )}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */

type AnkiCheck =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok'; decks: number }
  | { kind: 'missing'; error: string };

function AnkiStep() {
  const { t } = useT();
  const [check, setCheck] = useState<AnkiCheck>({ kind: 'idle' });
  const run = async (): Promise<void> => {
    setCheck({ kind: 'checking' });
    try {
      const status = await window.api.ankiStatus();
      setCheck(status.connected ? { kind: 'ok', decks: status.decks.length } : { kind: 'missing', error: status.error ?? '' });
    } catch (err) {
      setCheck({ kind: 'missing', error: err instanceof Error ? err.message : String(err) });
    }
  };
  return (
    <>
      <ul className="frs-points">
        <li>{t('onb2.anki.point.local')}</li>
        <li>{t('onb2.anki.point.addon')}</li>
        <li>{t('onb2.anki.point.later')}</li>
      </ul>
      <div className="frs-row">
        <button type="button" className="btn" onClick={() => void run()} disabled={check.kind === 'checking'}>
          {check.kind === 'checking' ? t('onb2.anki.checking') : t('onb2.anki.check')}
        </button>
        <HelpLink topic="anki" />
      </div>
      {check.kind === 'ok' && (
        <p className="frs-note frs-note--ok" role="status">
          {t('onb2.anki.ok', { count: check.decks })}
        </p>
      )}
      {check.kind === 'missing' && (
        <p className="frs-note" role="status">
          {t('onb2.anki.missing')}
          {check.error ? ` (${check.error})` : ''}
        </p>
      )}
    </>
  );
}

function ThemeStep({ theme, onTheme }: { theme: FirstRunTheme; onTheme: (theme: FirstRunTheme) => void }) {
  const { t } = useT();
  return (
    <>
      <div className="frs-theme-grid" role="radiogroup" aria-label={t('onb2.step.theme.title')}>
        {FIRST_RUN_THEMES.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={theme === id}
            className={`frs-theme${theme === id ? ' is-selected' : ''}`}
            onClick={() => onTheme(id)}
          >
            <span className={`frs-theme-preview frs-theme-preview--${id}`} aria-hidden="true">
              <span className="frs-tp-window" />
              <span className="frs-tp-window frs-tp-window--back" />
              <span className="frs-tp-bar" />
            </span>
            <span className="frs-choice-title">{t(`onb2.theme.${id}`)}</span>
            <span className="frs-choice-desc">{t(`onb2.theme.${id}.desc`)}</span>
          </button>
        ))}
      </div>
      {(theme === 'aero' || theme === 'wired') && <p className="frs-note">{t('onb2.theme.bootNote')}</p>}
      {theme === 'blanc' && <p className="frs-note">{t('onb2.theme.blancNote')}</p>}
    </>
  );
}

function FinishStep({ studyLang, level, theme }: { studyLang: StudyLang; level: LevelBand; theme: FirstRunTheme }) {
  const { t } = useT();
  const seeded = loadFirstRun().seededKnown;
  return (
    <>
      <dl className="frs-summary">
        <dt>{t('onb2.summary.language')}</dt>
        <dd lang={LANG_TAGS[studyLang]}>{LANG_LABELS[studyLang]}</dd>
        <dt>{t('onb2.summary.level')}</dt>
        <dd>{t(`onb2.level.${studyLang}.${level}`)}</dd>
        <dt>{t('onb2.summary.known')}</dt>
        <dd>{seeded > 0 ? t('onb2.level.seeded', { count: seeded }) : t('onb2.summary.knownNone')}</dd>
        <dt>{t('onb2.summary.look')}</dt>
        <dd>{t(`onb2.theme.${theme}`)}</dd>
      </dl>
      <p className="frs-legend">{t('onb2.checklist.title')}</p>
      <ul className="frs-points">
        <li>{t('onb2.checklist.lookup')}</li>
        <li>{t('onb2.checklist.mine')}</li>
        <li>{t('onb2.checklist.review')}</li>
        <li>{t('onb2.checklist.media')}</li>
      </ul>
      <p className="frs-note">{t('onb2.finish.note')}</p>
    </>
  );
}
