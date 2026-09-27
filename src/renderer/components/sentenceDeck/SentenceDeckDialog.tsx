/**
 * "Make a sentence deck from this video" — the one dialog every entry point
 * opens (the player's Study sheet, the Files app on a video or its subtitle,
 * the Watch library's episode menu).
 *
 * Choose the text (the player's own track, the library's tracks incl. a Whisper
 * transcript, sidecars, streams in the file), see what it becomes before
 * anything is written, then cut the audio and file the deck in one step. Every
 * line that does not become a card is counted by reason. Nothing is written
 * until Make is pressed; Undo takes the whole batch back.
 *
 * Mounted through `openSentenceDeckDialog` on a root of its own — the same
 * pattern as `confirmDialog` — so it works from any window without each host
 * mounting it.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  SENTENCE_DECK_DEFAULTS,
  borrowCueStyles,
  planSentenceDeck,
  sentenceDeckNameFromPath,
  sentenceTimeLabel,
  type SentenceDeckCue,
  type SentenceDeckOptions,
  type SentenceDeckSources,
  type SentenceDeckTrack,
  type SentencePlan,
} from '../../../shared/sentenceDeck';
import { existingDeckKeys } from '../../../shared/filesApp/mining';
import { subtitleLangMatches } from '../../../shared/subtitleDiscoveryPick';
import { STUDY_LANG_NAME_KEY, type StudyLang } from '../../../shared/studyLang';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { formatBytes } from '../../../shared/assetRegistry';
import { WHISPER_MODEL_SPECS } from '../../../shared/whisperModels';
import { isDownloadedIn, loadDownloaded } from '../../whisperModelCache';
import { loadWhisperDevice, loadWhisperModelTier } from '../../whisperSettings';
import { loadDeck, type FlashcardTextProvenance } from '../../flashcardDeck';
import { useT } from '../../i18n';
import { getStudyLang, studyContentLang } from '../../studyEnvironment';
import { requestFlashcardsFocus } from '../../openIntents';
import { MEDIA_WORKSPACE_CLOSE_EVENT, mediaWorkspaceIsOpen } from '../../../shared/mediaWorkspace';
import {
  buildSentenceDeck,
  undoSentenceDeck,
  type SentenceDeckBuildResult,
  type SentenceDeckDone,
  type SentenceDeckProgressState,
} from '../../sentenceDeckBuild';
import { Button, Dialog, Group, Input, Progress, Select, SwitchRow, ControlRow } from '../ui';
import './sentenceDeck.css';

export interface SentenceDeckPlayerTrack {
  label: string;
  cues: SentenceDeckCue[];
  secondary?: { label: string; cues: SentenceDeckCue[] };
}

export interface SentenceDeckRequest {
  /** The episode. Optional when `subtitlePath` is given: its video is found beside it. */
  videoPath?: string;
  /** Opened on a subtitle file (Files app): that file is the default text. */
  subtitlePath?: string;
  /** The track the player is showing right now, delay applied. */
  playerTrack?: SentenceDeckPlayerTrack;
}

const PLAYER_ID = 'player';
const PLAYER_SECONDARY_ID = 'player-secondary';
const PREVIEW_ROWS = 6;

type CueState = { status: 'loading' } | { status: 'ready'; cues: SentenceDeckCue[] } | { status: 'error'; reasonKey: string };

type Stage =
  | { kind: 'loading' }
  | { kind: 'setup' }
  | { kind: 'building'; progress: SentenceDeckProgressState }
  | { kind: 'done'; result: SentenceDeckDone }
  | { kind: 'undone'; count: number }
  | { kind: 'refused'; reasonKey: string; detail?: string }
  | { kind: 'cancelled' };

/** `1:05`, `01:05`, `1:02:05` or plain seconds, as milliseconds. `null` when unreadable. */
export function parseClock(text: string): number | null {
  const value = text.trim();
  if (!value) return null;
  if (/^\d+(?:\.\d+)?$/.test(value)) return Math.round(Number(value) * 1000);
  const parts = value.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+(?:\.\d+)?$/.test(p))) return null;
  const nums = parts.map(Number);
  const seconds = nums.length === 3 ? nums[0] * 3600 + nums[1] * 60 + nums[2] : nums[0] * 60 + nums[1];
  return Math.round(seconds * 1000);
}

function provenanceFor(kind: SentenceDeckTrack['kind'] | 'player'): FlashcardTextProvenance | undefined {
  if (kind === 'transcript') return 'transcript';
  if (kind === 'downloaded' || kind === 'embedded' || kind === 'sidecar') return 'human-subs';
  // A player track, a loose file, a machine translation: not known, so not claimed.
  return undefined;
}

/** A language tag by name, in the interface language (`ja` → 日本語 / Japanese / 日语). */
function languageName(code: string, uiTag: string): string {
  try {
    return new Intl.DisplayNames([uiTag], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Bytes the Whisper model for `lang` still has to download before a transcript
 * can start, or null when it is already on this computer. "Transcribe" queues at
 * once, and a first transcript quietly pulls a model of a few hundred megabytes.
 */
function whisperDownloadBytes(lang: StudyLang): number | null {
  try {
    const tier = loadWhisperModelTier(lang);
    if (isDownloadedIn(loadDownloaded(), tier, loadWhisperDevice())) return null;
    return WHISPER_MODEL_SPECS.find((spec) => spec.id === tier)?.sizeBytes ?? null;
  } catch {
    return null;
  }
}

function newJobId(): string {
  return `sd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function SentenceDeckDialog({ request, onClose }: { request: SentenceDeckRequest; onClose: () => void }) {
  const { t, lang } = useT();
  const studyLang = useMemo(() => getStudyLang(), []);
  const contentLang = studyContentLang(studyLang);
  const [stage, setStage] = useState<Stage>({ kind: 'loading' });
  const [sources, setSources] = useState<SentenceDeckSources | null>(null);
  const [deckName, setDeckName] = useState('');
  const [primaryId, setPrimaryId] = useState('');
  const [secondaryId, setSecondaryId] = useState('');
  const [cues, setCues] = useState<Record<string, CueState>>({});
  const [mergeShort, setMergeShort] = useState(SENTENCE_DECK_DEFAULTS.mergeShort);
  const [splitLong, setSplitLong] = useState(SENTENCE_DECK_DEFAULTS.splitLong);
  const [skipNonDialogue, setSkipNonDialogue] = useState(SENTENCE_DECK_DEFAULTS.skipNonDialogue);
  const [skipExisting, setSkipExisting] = useState(SENTENCE_DECK_DEFAULTS.skipExisting);
  const [minSec, setMinSec] = useState(String(SENTENCE_DECK_DEFAULTS.minDurationMs / 1000));
  const [maxSec, setMaxSec] = useState(String(SENTENCE_DECK_DEFAULTS.maxDurationMs / 1000));
  const [wholeEpisode, setWholeEpisode] = useState(true);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [withStill, setWithStill] = useState(false);
  const [sendToAnki, setSendToAnki] = useState(false);
  const [transcribeNote, setTranscribeNote] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const jobIdRef = useRef('');
  const existingKeys = useMemo(() => existingDeckKeys(loadDeck().map((card) => card.sentence || card.word)), []);

  // Load the tracks once.
  useEffect(() => {
    let alive = true;
    void (async () => {
      let found: SentenceDeckSources;
      try {
        found = await window.api.sentenceDeckSources({
          videoPath: request.videoPath,
          subtitlePath: request.subtitlePath,
        });
      } catch {
        found = { ok: false, reasonKey: 'sentenceDeck.error.noFile', tracks: [] };
      }
      if (!alive) return;
      if (!found.ok || !found.videoPath) {
        setStage({ kind: 'refused', reasonKey: found.reasonKey ?? 'sentenceDeck.error.noFile' });
        return;
      }
      setSources(found);
      setDeckName(sentenceDeckNameFromPath(found.videoPath));
      if (request.playerTrack) {
        setPrimaryId(PLAYER_ID);
        setCues({ [PLAYER_ID]: { status: 'ready', cues: request.playerTrack.cues } });
        if (request.playerTrack.secondary) {
          setSecondaryId(PLAYER_SECONDARY_ID);
          setCues((prev) => ({
            ...prev,
            [PLAYER_SECONDARY_ID]: { status: 'ready', cues: request.playerTrack?.secondary?.cues ?? [] },
          }));
        } else {
          setSecondaryId(found.secondaryId ?? '');
        }
      } else {
        setPrimaryId(found.primaryId ?? found.tracks[0]?.id ?? '');
        setSecondaryId(found.secondaryId ?? '');
      }
      setStage({ kind: 'setup' });
    })();
    return () => { alive = false; };
  }, [request]);

  // The player's cues carry no ASS style, so a deck made from them could not skip
  // signs the way one made from the file does. Read the same track from its
  // source and borrow the styles; a track that does not match changes nothing.
  useEffect(() => {
    const videoPath = sources?.videoPath;
    const player = request.playerTrack;
    if (!videoPath || !player?.cues.length || player.cues.some((cue) => cue.style)) return;
    const candidates = (sources?.tracks ?? [])
      .filter((track) => track.kind !== 'transcript' && track.kind !== 'translation')
      .filter((track) => !track.lang || subtitleLangMatches(track.lang, studyLang))
      .slice(0, 4);
    let alive = true;
    void (async () => {
      for (const track of candidates) {
        let read: Awaited<ReturnType<typeof window.api.sentenceDeckReadTrack>>;
        try {
          read = await window.api.sentenceDeckReadTrack(videoPath, track.id);
        } catch {
          continue;
        }
        if (!alive) return;
        const styled = read.ok ? borrowCueStyles(player.cues, read.cues) : null;
        if (!styled) continue;
        setCues((prev) => ({
          ...prev,
          [PLAYER_ID]: { status: 'ready', cues: styled },
          [track.id]: prev[track.id] ?? { status: 'ready', cues: read.cues },
        }));
        return;
      }
    })();
    return () => { alive = false; };
  }, [sources, request.playerTrack, studyLang]);

  // Read a chosen track the first time it is chosen.
  useEffect(() => {
    const videoPath = sources?.videoPath;
    if (!videoPath) return;
    for (const id of [primaryId, secondaryId]) {
      if (!id || cues[id]) continue;
      setCues((prev) => ({ ...prev, [id]: { status: 'loading' } }));
      void window.api.sentenceDeckReadTrack(videoPath, id)
        .then((read) => setCues((prev) => ({
          ...prev,
          [id]: read.ok ? { status: 'ready', cues: read.cues } : { status: 'error', reasonKey: read.reasonKey ?? 'sentenceDeck.error.trackUnreadable' },
        })))
        .catch(() => setCues((prev) => ({ ...prev, [id]: { status: 'error', reasonKey: 'sentenceDeck.error.trackUnreadable' } })));
    }
  }, [sources, primaryId, secondaryId, cues]);

  const primaryState = primaryId ? cues[primaryId] : undefined;
  const secondaryState = secondaryId ? cues[secondaryId] : undefined;
  const minMs = Math.max(0, Math.round((Number(minSec) || 0) * 1000));
  const maxMs = Math.max(minMs + 100, Math.round((Number(maxSec) || SENTENCE_DECK_DEFAULTS.maxDurationMs / 1000) * 1000));
  const fromMs = wholeEpisode ? null : parseClock(rangeFrom);
  const toMs = wholeEpisode ? null : parseClock(rangeTo);

  const plan: SentencePlan | null = useMemo(() => {
    if (primaryState?.status !== 'ready') return null;
    const options: SentenceDeckOptions = {
      studyLang,
      mergeShort,
      splitLong,
      skipNonDialogue,
      skipExisting,
      minDurationMs: minMs,
      maxDurationMs: maxMs,
      ...(fromMs != null ? { rangeStartMs: fromMs } : {}),
      ...(toMs != null ? { rangeEndMs: toMs } : {}),
    };
    return planSentenceDeck(primaryState.cues, options, {
      secondary: secondaryState?.status === 'ready' ? secondaryState.cues : undefined,
      existingKeys,
    });
  }, [primaryState, secondaryState, studyLang, mergeShort, splitLong, skipNonDialogue, skipExisting, minMs, maxMs, fromMs, toMs, existingKeys]);

  const trackKind = (id: string): SentenceDeckTrack['kind'] | 'player' => (
    id === PLAYER_ID || id === PLAYER_SECONDARY_ID
      ? 'player'
      : sources?.tracks.find((track) => track.id === id)?.kind ?? 'file'
  );

  const trackOptions = useMemo(() => {
    const out: Array<{ value: string; label: string }> = [];
    if (request.playerTrack) {
      out.push({ value: PLAYER_ID, label: t('sentenceDeck.track.player', { label: request.playerTrack.label }) });
    }
    for (const track of sources?.tracks ?? []) {
      const language = track.lang ? languageName(track.lang, LANG_TAGS[lang] ?? 'en') : t('sentenceDeck.track.langUnknown');
      const name = track.label || (track.streamNumber
        ? t('sentenceDeck.track.stream', { n: track.streamNumber })
        : t(`sentenceDeck.kind.${track.kind}`));
      out.push({
        value: track.id,
        label: t('sentenceDeck.track.option', { label: name, lang: language, kind: t(`sentenceDeck.kind.${track.kind}`) }),
      });
    }
    return out;
    // `lang`, not `t`: t's identity is stable across a language switch.
  }, [sources, request.playerTrack, lang]);

  const secondaryOptions = useMemo(() => {
    const out = [{ value: '', label: t('sentenceDeck.translation.none') }];
    if (request.playerTrack?.secondary) {
      out.push({ value: PLAYER_SECONDARY_ID, label: t('sentenceDeck.track.player', { label: request.playerTrack.secondary.label }) });
    }
    return [...out, ...trackOptions.filter((option) => option.value !== primaryId && option.value !== PLAYER_ID)];
  }, [trackOptions, primaryId, request.playerTrack, lang]);

  const building = stage.kind === 'building';
  const buildingRef = useRef(building);
  buildingRef.current = building;
  // Stable: `Dialog` re-runs its focus effect whenever `onClose` changes, and a
  // new function per render would pull focus out of the field being typed in.
  const close = useCallback((): void => {
    if (buildingRef.current) return;
    onClose();
  }, [onClose]);

  async function make(): Promise<void> {
    if (!plan || !sources?.videoPath || !plan.segments.length) return;
    cancelledRef.current = false;
    jobIdRef.current = newJobId();
    setStage({ kind: 'building', progress: { phase: 'audio', done: 0, total: plan.segments.length, failed: 0 } });
    const result: SentenceDeckBuildResult = await buildSentenceDeck(
      {
        videoPath: sources.videoPath,
        deckName,
        studyLang,
        segments: plan.segments,
        textProvenance: provenanceFor(trackKind(primaryId)),
        mediaId: sources.mediaId,
        withStill,
        sendToAnki,
      },
      {
        jobId: jobIdRef.current,
        isCancelled: () => cancelledRef.current,
        onProgress: (progress) => setStage((prev) => (prev.kind === 'building' ? { kind: 'building', progress } : prev)),
      },
    );
    if (result.status === 'done') setStage({ kind: 'done', result });
    else if (result.status === 'cancelled') setStage({ kind: 'cancelled' });
    else setStage({ kind: 'refused', reasonKey: result.reasonKey, detail: result.detail });
  }

  function cancelBuild(): void {
    cancelledRef.current = true;
    if (jobIdRef.current) void window.api.sentenceDeckCancel(jobIdRef.current).catch(() => undefined);
  }

  async function transcribe(): Promise<void> {
    if (!sources?.videoPath) return;
    try {
      let mediaId = sources.mediaId;
      if (!mediaId) {
        const added = await window.api.addMediaPaths([sources.videoPath]);
        const wanted = sources.videoPath.replace(/\\/g, '/').toLowerCase();
        mediaId = added.find((item) => (item.path ?? '').replace(/\\/g, '/').toLowerCase() === wanted)?.id;
      }
      if (!mediaId) {
        setTranscribeNote(t('sentenceDeck.noText.transcribeFailed'));
        return;
      }
      const queued = await window.api.enqueueTranscription({
        mediaId,
        lang: studyLang,
        cardOptions: { createCards: false, translateToEnglish: false, includeAudio: false },
      });
      setTranscribeNote(queued.ok === false
        ? t('sentenceDeck.noText.transcribeFailed')
        : t('sentenceDeck.noText.transcribeQueued'));
    } catch {
      setTranscribeNote(t('sentenceDeck.noText.transcribeFailed'));
    }
  }

  function listenNow(result: SentenceDeckDone): void {
    // From the player: close it first, or Flashcards opens behind the full-screen view.
    if (mediaWorkspaceIsOpen()) window.dispatchEvent(new CustomEvent(MEDIA_WORKSPACE_CLOSE_EVENT));
    requestFlashcardsFocus({ folder: result.folder, cardId: null, review: 'listening' });
    onClose();
  }

  const hasText = Boolean(request.playerTrack) || (sources?.tracks.length ?? 0) > 0;
  const planCount = plan?.segments.length ?? 0;
  const skipped = plan?.skipped;

  let body: ReactNode = null;
  let footer: ReactNode = null;

  if (stage.kind === 'loading') {
    body = (
      <div className="sd-status" role="status">
        <Progress />
        <p className="sd-muted">{t('sentenceDeck.loading')}</p>
      </div>
    );
    footer = <Button onClick={close}>{t('common.cancel')}</Button>;
  } else if (stage.kind === 'refused') {
    body = (
      <div className="sd-status" role="alert">
        <p>{t(stage.reasonKey)}</p>
        {stage.detail && <p className="sd-muted sd-detail">{stage.detail}</p>}
      </div>
    );
    footer = (
      <>
        {sources && <Button onClick={() => setStage({ kind: 'setup' })}>{t('sentenceDeck.back')}</Button>}
        <Button variant="primary" onClick={close}>{t('common.close')}</Button>
      </>
    );
  } else if (stage.kind === 'setup' && !hasText) {
    const downloadBytes = whisperDownloadBytes(studyLang);
    body = (
      <div className="sd-status">
        <p>{t('sentenceDeck.noText.body')}</p>
        <p className="sd-muted">{t('sentenceDeck.noText.hint', { language: t(STUDY_LANG_NAME_KEY[studyLang]) })}</p>
        {downloadBytes != null && (
          <p className="sd-muted" data-sd-model-download>
            {t('sentenceDeck.noText.modelDownload', { size: formatBytes(downloadBytes) })}
          </p>
        )}
        {transcribeNote && <p className="sd-note" role="status">{transcribeNote}</p>}
      </div>
    );
    footer = (
      <>
        <Button onClick={close}>{t('common.close')}</Button>
        <Button variant="primary" onClick={() => void transcribe()} disabled={Boolean(transcribeNote)}>
          {t('sentenceDeck.noText.transcribe')}
        </Button>
      </>
    );
  } else if (stage.kind === 'setup') {
    body = (
      <div className="sd-setup">
        <Input
          label={t('sentenceDeck.deckName')}
          value={deckName}
          onChange={(event) => setDeckName(event.currentTarget.value)}
          hint={t('sentenceDeck.deckName.hint')}
          data-sd-field="deck-name"
        />
        <Group title={t('sentenceDeck.group.text')}>
          <label className="ui-field">
            <span className="ui-field__label">{t('sentenceDeck.sentencesFrom')}</span>
            <Select
              value={primaryId}
              data-sd-field="primary"
              onChange={(event) => {
                const value = event.currentTarget.value;
                setPrimaryId(value);
                if (value === secondaryId) setSecondaryId('');
              }}
              options={trackOptions}
            />
          </label>
          <label className="ui-field">
            <span className="ui-field__label">{t('sentenceDeck.translationFrom')}</span>
            <Select
              value={secondaryId}
              data-sd-field="secondary"
              onChange={(event) => setSecondaryId(event.currentTarget.value)}
              options={secondaryOptions}
            />
          </label>
          {primaryState?.status === 'error' && <p className="sd-note" role="status">{t(primaryState.reasonKey)}</p>}
        </Group>
        <Group title={t('sentenceDeck.group.cleanup')}>
          <SwitchRow
            title={t('sentenceDeck.opt.merge')}
            description={t('sentenceDeck.opt.merge.desc')}
            checked={mergeShort}
            onChange={(event) => setMergeShort(event.currentTarget.checked)}
          />
          <SwitchRow
            title={t('sentenceDeck.opt.split')}
            description={t('sentenceDeck.opt.split.desc')}
            checked={splitLong}
            onChange={(event) => setSplitLong(event.currentTarget.checked)}
          />
          <SwitchRow
            title={t('sentenceDeck.opt.dialogueOnly')}
            description={t('sentenceDeck.opt.dialogueOnly.desc')}
            checked={skipNonDialogue}
            onChange={(event) => setSkipNonDialogue(event.currentTarget.checked)}
          />
          <SwitchRow
            title={t('sentenceDeck.opt.skipExisting')}
            description={t('sentenceDeck.opt.skipExisting.desc')}
            checked={skipExisting}
            onChange={(event) => setSkipExisting(event.currentTarget.checked)}
          />
        </Group>
        <Group title={t('sentenceDeck.group.length')}>
          <ControlRow className="sd-row">
            <Input
              label={t('sentenceDeck.minSec')}
              type="number"
              min={0}
              step={0.1}
              value={minSec}
              onChange={(event) => setMinSec(event.currentTarget.value)}
            />
            <Input
              label={t('sentenceDeck.maxSec')}
              type="number"
              min={1}
              max={30}
              step={0.5}
              value={maxSec}
              onChange={(event) => setMaxSec(event.currentTarget.value)}
            />
          </ControlRow>
          <SwitchRow
            title={t('sentenceDeck.opt.whole')}
            description={t('sentenceDeck.opt.whole.desc')}
            checked={wholeEpisode}
            onChange={(event) => setWholeEpisode(event.currentTarget.checked)}
          />
          {!wholeEpisode && (
            <ControlRow className="sd-row">
              <Input
                label={t('sentenceDeck.from')}
                placeholder="00:00"
                value={rangeFrom}
                onChange={(event) => setRangeFrom(event.currentTarget.value)}
                aria-invalid={rangeFrom.trim() !== '' && fromMs == null}
              />
              <Input
                label={t('sentenceDeck.to')}
                placeholder="24:00"
                value={rangeTo}
                onChange={(event) => setRangeTo(event.currentTarget.value)}
                aria-invalid={rangeTo.trim() !== '' && toMs == null}
              />
            </ControlRow>
          )}
        </Group>
        <Group title={t('sentenceDeck.group.extras')}>
          <SwitchRow
            title={t('sentenceDeck.opt.still')}
            description={t('sentenceDeck.opt.still.desc')}
            checked={withStill}
            onChange={(event) => setWithStill(event.currentTarget.checked)}
          />
          <SwitchRow
            title={t('sentenceDeck.opt.anki')}
            description={t('sentenceDeck.opt.anki.desc')}
            checked={sendToAnki}
            onChange={(event) => setSendToAnki(event.currentTarget.checked)}
          />
        </Group>
        <section className="sd-preview" aria-live="polite" data-sd-plan-count={planCount}>
          {primaryState?.status === 'loading' || !plan ? (
            <p className="sd-muted">{t('sentenceDeck.reading')}</p>
          ) : (
            <>
              <p className="sd-summary">
                {t('sentenceDeck.plan.summary', { count: planCount, read: plan.read })}
              </p>
              {skipped && (
                <ul className="sd-skips">
                  {(Object.entries(skipped) as Array<[keyof typeof skipped, number]>)
                    .filter(([, value]) => value > 0)
                    .map(([reason, value]) => (
                      <li key={reason}>{t(`sentenceDeck.skip.${reason}`, { count: value })}</li>
                    ))}
                  {plan.merged > 0 && <li>{t('sentenceDeck.plan.merged', { count: plan.merged })}</li>}
                  {plan.split > 0 && <li>{t('sentenceDeck.plan.split', { count: plan.split })}</li>}
                </ul>
              )}
              {planCount > 0 && (
                <ol className="sd-lines">
                  {plan.segments.slice(0, PREVIEW_ROWS).map((segment) => (
                    <li key={segment.index}>
                      <span className="sd-time">{sentenceTimeLabel(segment.startMs)}</span>
                      <span className="sd-text" lang={contentLang}>{segment.text}</span>
                      {segment.translation && <span className="sd-translation">{segment.translation}</span>}
                    </li>
                  ))}
                </ol>
              )}
              {planCount > PREVIEW_ROWS && (
                <p className="sd-muted">{t('sentenceDeck.plan.more', { count: planCount - PREVIEW_ROWS })}</p>
              )}
            </>
          )}
        </section>
      </div>
    );
    footer = (
      <>
        <Button onClick={close}>{t('common.cancel')}</Button>
        <Button
          variant="primary"
          data-sd-action="make"
          disabled={!planCount || !deckName.trim()}
          onClick={() => void make()}
        >
          {planCount ? t('sentenceDeck.make', { count: planCount }) : t('sentenceDeck.makeNone')}
        </Button>
      </>
    );
  } else if (stage.kind === 'building') {
    const { phase, done, total, failed } = stage.progress;
    body = (
      <div className="sd-status" role="status" data-sd-phase={phase}>
        <Progress value={total ? done / total : undefined} />
        <p>{t(`sentenceDeck.phase.${phase}`, { done, total })}</p>
        {failed > 0 && <p className="sd-muted">{t('sentenceDeck.phase.failed', { count: failed })}</p>}
      </div>
    );
    footer = (
      <Button onClick={cancelBuild} disabled={cancelledRef.current} data-sd-action="cancel">
        {t('common.cancel')}
      </Button>
    );
  } else if (stage.kind === 'cancelled') {
    body = <p className="sd-status" role="status">{t('sentenceDeck.cancelled')}</p>;
    footer = (
      <>
        <Button onClick={() => setStage({ kind: 'setup' })}>{t('sentenceDeck.back')}</Button>
        <Button variant="primary" onClick={close}>{t('common.close')}</Button>
      </>
    );
  } else if (stage.kind === 'done') {
    const { result } = stage;
    body = (
      <div className="sd-status" role="status" data-sd-added={result.added} data-sd-folder={result.folder}>
        <p className="sd-summary">{t('sentenceDeck.done.added', { count: result.added, deck: result.folder })}</p>
        {result.failedClips.length > 0 && (
          <details className="sd-failed">
            <summary>{t('sentenceDeck.done.noAudio', { count: result.failedClips.length })}</summary>
            <ul>
              {result.failedClips.slice(0, 20).map((clip) => (
                <li key={clip.index}>
                  <span lang={contentLang}>{clip.text}</span>
                  <span className="sd-muted sd-detail">{t(clip.reasonKey)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {result.anki && (
          <p className="sd-muted">
            {t('sentenceDeck.done.anki', {
              added: result.anki.added,
              queued: result.anki.queued,
              other: result.anki.duplicate + result.anki.failed + result.anki.local,
            })}
          </p>
        )}
      </div>
    );
    footer = (
      <>
        <Button
          variant="ghost"
          data-sd-action="undo"
          onClick={() => setStage({ kind: 'undone', count: undoSentenceDeck(result) })}
        >
          {t('sentenceDeck.undo')}
        </Button>
        <Button onClick={close}>{t('common.close')}</Button>
        <Button variant="primary" data-sd-action="listen" onClick={() => listenNow(result)}>
          {t('sentenceDeck.listenNow')}
        </Button>
      </>
    );
  } else if (stage.kind === 'undone') {
    body = (
      <div className="sd-status" role="status">
        <p>{t('sentenceDeck.undone', { count: stage.count })}</p>
        {sendToAnki && <p className="sd-muted">{t('sentenceDeck.undone.anki')}</p>}
      </div>
    );
    footer = <Button variant="primary" onClick={close}>{t('common.close')}</Button>;
  }

  return (
    <Dialog
      open
      onClose={close}
      dismissable={!building}
      className="sd-dialog"
      title={t('sentenceDeck.title')}
      footer={footer}
    >
      {body}
    </Dialog>
  );
}

/** Open the dialog on a root of its own; resolves when it closes. */
export function openSentenceDeckDialog(request: SentenceDeckRequest): Promise<void> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.className = 'sd-host';
    document.body.appendChild(host);
    const root = createRoot(host);
    let closed = false;
    const done = (): void => {
      if (closed) return;
      closed = true;
      resolve();
      window.setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
    };
    root.render(<SentenceDeckDialog request={request} onClose={done} />);
  });
}
