import React from 'react';
import {
  appendVideoCoreMiningHistory,
  buildVideoCoreMineRequest,
  createVideoCoreMiningDraft,
  createVideoCoreMiningHistoryEntry,
  markVideoCoreMiningHistoryUndone,
  normalizeVideoCoreMiningHistory,
  VIDEO_CORE_MINING_HISTORY_KEY,
  withVideoCoreMiningAsset,
  type VideoCoreMiningDraft,
  type VideoCoreMiningHistoryEntry,
  type VideoCoreMiningSource,
} from '../shared/videoCoreMining';
import {
  cuePlaybackEndSec,
  cuePlaybackStartSec,
  type VideoCoreStudyCue,
} from '../shared/videoCoreStudy';
import { videoClipFilename } from '../shared/videoClip';
import { findMinedCueEntry } from '../shared/seanimeWatchLoop';
import { MINING_HISTORY_STATUS_KEY } from '../shared/mediaWorkspaceLabels';
import { t as translateUi, useT } from '../renderer/i18n';
// Moved to a module of their own in slice 18, typed on HTMLMediaElement, so the music
// lyrics pane records a cue with this exact implementation rather than a copy of it.
import {
  blobToBase64,
  recordCueAudio,
  type CapturedAsset,
} from './cueAudioCapture';
import MediaLensCaptureButton from './MediaLensCaptureButton';
import MediaCueAgentHandoffButton from './MediaCueAgentHandoffButton';

interface Props {
  cue: VideoCoreStudyCue | null;
  displayText: string;
  source: VideoCoreMiningSource | null;
  video: HTMLVideoElement | null;
  subtitleDelaySec: number;
  /**
   * Incremented by the `video.mineCurrentLine` shortcut. A counter rather than a
   * boolean so mining the same line twice in a row is two events, not one edge
   * that never falls back.
   */
  mineSignal?: number;
}

function loadHistory(): VideoCoreMiningHistoryEntry[] {
  try {
    return normalizeVideoCoreMiningHistory(
      JSON.parse(localStorage.getItem(VIDEO_CORE_MINING_HISTORY_KEY) ?? '[]'),
    );
  } catch {
    return [];
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(translateUi('mediaWorkspace.capture.encodeFailed')));
    }, type);
  });
}

function drawWrappedCue(
  context: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
): void {
  const fontSize = Math.max(24, Math.round(width / 34));
  const maxWidth = width * 0.88;
  const lineHeight = fontSize * 1.25;
  const glyphs = [...text];
  const lines: string[] = [];
  let current = '';
  for (const glyph of glyphs) {
    const candidate = current + glyph;
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = glyph;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  const visible = lines.slice(-3);
  const boxHeight = visible.length * lineHeight + fontSize;
  const top = height - boxHeight - fontSize * 0.5;
  context.fillStyle = 'rgba(7, 7, 12, 0.72)';
  context.fillRect(width * 0.04, top, width * 0.92, boxHeight);
  context.font = `600 ${fontSize}px "Yu Gothic UI", "Meiryo", sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = Math.max(3, fontSize / 8);
  context.strokeStyle = 'rgba(0, 0, 0, 0.95)';
  context.fillStyle = '#fff';
  visible.forEach((line, index) => {
    const y = top + fontSize * 0.65 + index * lineHeight;
    context.strokeText(line, width / 2, y, maxWidth);
    context.fillText(line, width / 2, y, maxWidth);
  });
}

async function captureFrame(
  video: HTMLVideoElement,
  cueText: string,
  cue: VideoCoreStudyCue,
): Promise<CapturedAsset> {
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error(translateUi('mediaWorkspace.capture.frameNotReady'));
  }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error(translateUi('mediaWorkspace.capture.canvasUnavailable'));
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  drawWrappedCue(context, cueText, canvas.width, canvas.height);
  const blob = await canvasBlob(canvas, 'image/png');
  canvas.remove();
  return {
    base64: await blobToBase64(blob),
    filename: `jp-video-cue-${cue.trackNumber}-${cue.index}-${cue.startMs}.png`,
    mimeType: blob.type || 'image/png',
    bytes: blob.size,
  };
}

function sourceKey(source: VideoCoreMiningSource | null): string {
  return source
    ? `${source.playbackId}:${source.mediaId ?? 'local'}:${source.episodeNumber ?? ''}`
    : 'none';
}


export default function VideoCoreMiningPanel({
  cue,
  displayText,
  source,
  video,
  subtitleDelaySec,
  mineSignal = 0,
}: Props): React.ReactElement {
  const { t } = useT();
  const [draft, setDraft] = React.useState<VideoCoreMiningDraft | null>(null);
  const [selectedCue, setSelectedCue] = React.useState<VideoCoreStudyCue | null>(null);
  const [history, setHistory] = React.useState<VideoCoreMiningHistoryEntry[]>(loadHistory);
  const [decks, setDecks] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState<'screenshot' | 'audio' | 'clip' | 'mine' | 'undo' | null>(null);
  const [message, setMessage] = React.useState('');
  // The panel is an absolute overlay on the video. It has always been open, always this
  // tall, and always in the way; collapsing it is the difference between a study player
  // and a form sitting on top of one.
  const [expanded, setExpanded] = React.useState(true);

  React.useEffect(() => {
    if (!source) {
      setDraft(null);
      setSelectedCue(null);
      return;
    }
    if (!cue) return;
    setSelectedCue(cue);
    setDraft((current) => {
      if (
        current
        && current.provenance.cue.index === cue.index
        && current.provenance.cue.trackNumber === cue.trackNumber
        && current.provenance.cue.startMs === cue.startMs
        && current.provenance.source.playbackId === source.playbackId
      ) return current;
      return createVideoCoreMiningDraft(cue, displayText, source);
    });
    setMessage('');
  }, [cue?.endMs, cue?.index, cue?.startMs, cue?.trackNumber, displayText, sourceKey(source)]);

  React.useEffect(() => {
    localStorage.setItem(VIDEO_CORE_MINING_HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  React.useEffect(() => {
    if (typeof window.api?.ankiStatus !== 'function') return;
    void window.api.ankiStatus()
      .then((status) => setDecks(status.decks))
      .catch(() => setDecks([]));
  }, []);

  const update = React.useCallback(<K extends keyof VideoCoreMiningDraft>(
    key: K,
    value: VideoCoreMiningDraft[K],
  ): void => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }, []);

  const onScreenshot = async (): Promise<void> => {
    if (!draft || !selectedCue || !video) return;
    setBusy('screenshot');
    setMessage('');
    try {
      const captured = await captureFrame(
        video,
        draft.provenance.cue.text,
        selectedCue,
      );
      setDraft((current) => current
        ? withVideoCoreMiningAsset(current, 'screenshot', {
            base64: captured.base64,
            asset: captured,
          })
        : current);
      setMessage(t('mediaWorkspace.mining.screenshotAttached', {
        size: Math.round(captured.bytes / 1024),
      }));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t('mediaWorkspace.capture.screenshotFailed'),
      );
    } finally {
      setBusy(null);
    }
  };

  const onAudio = async (): Promise<void> => {
    if (!draft || !selectedCue || !video) return;
    setBusy('audio');
    setMessage(t('mediaWorkspace.capture.recordingCue'));
    try {
      // The cue -> playback-range conversion stays HERE, because the subtitle delay is a
      // video concern. The shared recorder takes a plain range and knows nothing about cues.
      const captured = await recordCueAudio(video, {
        startSec: cuePlaybackStartSec(selectedCue, subtitleDelaySec),
        endSec: cuePlaybackEndSec(selectedCue, subtitleDelaySec),
        filenameStem:
          `jp-video-cue-${selectedCue.trackNumber}-${selectedCue.index}-${selectedCue.startMs}`,
      });
      setDraft((current) => current
        ? withVideoCoreMiningAsset(current, 'audio', {
            base64: captured.base64,
            asset: captured,
          })
        : current);
      setMessage(t('mediaWorkspace.mining.audioAttached', {
        size: Math.round(captured.bytes / 1024),
      }));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t('mediaWorkspace.capture.cueAudioFailed'),
      );
    } finally {
      setBusy(null);
    }
  };

  /*
    A clip is cut from the file by ffmpeg in main, not recorded off the element
    like cue audio: recording is real time and takes the player with it, and
    mining a four-second line should not cost four seconds of hijacked playback.
    Streams have no file to cut, so the control says so rather than failing.
  */
  const onClip = async (): Promise<void> => {
    if (!draft || !selectedCue) return;
    const filePath = draft.provenance.source.localFilePath ?? '';
    if (!filePath) {
      setMessage(t('mediaWorkspace.mining.clipNeedsLocalFile'));
      return;
    }
    setBusy('clip');
    setMessage(t('mediaWorkspace.mining.clipping'));
    try {
      const startSec = cuePlaybackStartSec(selectedCue, subtitleDelaySec);
      const result = await window.api.extractVideoClip({
        filePath,
        startSec,
        endSec: cuePlaybackEndSec(selectedCue, subtitleDelaySec),
      });
      if (!result.ok || !result.base64) {
        setMessage(result.error || t('mediaWorkspace.mining.clipFailed'));
        return;
      }
      const asset = {
        filename: videoClipFilename(
          `${selectedCue.trackNumber}-${selectedCue.index}`,
          startSec,
        ),
        mimeType: result.mimeType ?? 'video/mp4',
        bytes: result.bytes ?? 0,
      };
      setDraft((current) => current
        ? withVideoCoreMiningAsset(current, 'clip', { base64: result.base64 ?? '', asset })
        : current);
      setMessage(t('mediaWorkspace.mining.clipAttached', {
        size: Math.round((result.bytes ?? 0) / 1024),
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('mediaWorkspace.mining.clipFailed'));
    } finally {
      setBusy(null);
    }
  };

  const onMine = async (): Promise<void> => {
    if (!draft || !draft.term.trim()) {
      setMessage(t('mediaWorkspace.mining.missingText'));
      return;
    }
    if (typeof window.api?.ankiMineNote !== 'function') {
      setMessage(t('mediaWorkspace.mining.desktopOnly'));
      return;
    }
    setBusy('mine');
    setMessage('');
    try {
      const result = await window.api.ankiMineNote(buildVideoCoreMineRequest(draft));
      const entry = createVideoCoreMiningHistoryEntry(draft, result);
      setHistory((current) => appendVideoCoreMiningHistory(current, entry));
      if (result.ok) {
        const destination = result.deckName
          ?? draft.deckName
          ?? result.profileName
          ?? t('mediaWorkspace.mining.activeDestination');
        // A matched mining rule owns its profile's deck, so a typed destination is
        // deliberately ignored. Saying so beats letting the card appear somewhere else.
        setMessage(result.deckOverriddenByRule
          ? t('mediaWorkspace.mining.minedRule', {
              destination,
              rule: result.matchedRuleLabel || '—',
              requested: draft.deckName || '—',
            })
          : t('mediaWorkspace.mining.minedTo', { destination }));
      } else if (result.error === 'duplicate') {
        setMessage(t('mediaWorkspace.mining.duplicate'));
      } else {
        setMessage(result.error || t('mediaWorkspace.mining.exportFailed'));
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t('mediaWorkspace.mining.exportFailed'),
      );
    } finally {
      setBusy(null);
    }
  };

  /*
    The shortcut fires into a ref rather than into the effect's closure: `onMine`
    is rebuilt on every render, so an effect that depended on it would re-run —
    and re-mine — every time the draft changed. Depending on the signal alone
    with a stale `onMine` would instead export whatever the draft was when the
    shortcut was first registered. The ref is the only version that mines the
    line actually on screen.
  */
  const onMineRef = React.useRef(onMine);
  onMineRef.current = onMine;
  React.useEffect(() => {
    if (mineSignal > 0) void onMineRef.current();
  }, [mineSignal]);

  const onUndo = async (entry: VideoCoreMiningHistoryEntry): Promise<void> => {
    if (!entry.noteId || typeof window.api?.ankiDeleteNotes !== 'function') return;
    const noteId = entry.noteId;
    setBusy('undo');
    setMessage('');
    try {
      const result = await window.api.ankiDeleteNotes(
        [noteId],
        entry.mediaFilenames ?? [],
      );
      if (!result.ok) {
        throw new Error(result.error || t('mediaWorkspace.mining.undoFailed'));
      }
      setHistory((current) => markVideoCoreMiningHistoryUndone(current, noteId));
      const deletedAssets = result.deletedMediaFilenames?.length ?? 0;
      const retainedAssets = result.retainedMediaFilenames?.length ?? 0;
      setMessage(result.warning ?? t('mediaWorkspace.mining.undoSummary', {
        noteId,
        deleted: deletedAssets,
        retained: retainedAssets,
      }));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t('mediaWorkspace.mining.undoFailed'),
      );
    } finally {
      setBusy(null);
    }
  };

  const recent = history.slice(-5).reverse();
  if (!draft || !selectedCue || !source) {
    return (
      <section
        className="study-mining-panel"
        data-study-mining="waiting"
        aria-label={t('mediaWorkspace.mining.cardPreview')}
      >
        <p>{t('mediaWorkspace.mining.waiting')}</p>
      </section>
    );
  }

  /**
   * Have I already mined this exact line — in this session or any earlier one?
   *
   * Pure lookup over history already in state: no Anki call, no I/O, nothing that could
   * stutter playback. Deliberately computed from `selectedCue` rather than the live `cue`
   * so it tracks the card actually being previewed.
   */
  const alreadyMined = findMinedCueEntry(history, source, selectedCue);

  const cueMeta = t('mediaWorkspace.mining.cueMeta', {
    cue: selectedCue.index + 1,
    track: selectedCue.trackNumber,
    start: selectedCue.startMs,
    end: selectedCue.endMs,
  });
  const missingTerm = !draft.term.trim();

  return (
    <section
      className="study-mining-panel"
      data-study-mining="ready"
      data-study-mining-expanded={expanded ? 'true' : 'false'}
      data-screenshot-bytes={draft.screenshot?.bytes}
      data-audio-bytes={draft.audio?.bytes}
      aria-label={t('mediaWorkspace.mining.cardPreview')}
    >
      <h2 className="study-mining-heading">
        <button
          type="button"
          className="study-mining-toggle"
          data-study-action="toggle-mining-panel"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="study-mining-chevron" aria-hidden="true" />
          <span>{t('mediaWorkspace.mining.cardPreview')}</span>
        </button>
        {/* Collapsed, the attachment dots are the only way to see what is armed. */}
        <span className="study-mining-armed" aria-hidden="true">
          <span data-armed={draft.screenshot ? 'true' : 'false'} />
          <span data-armed={draft.audio ? 'true' : 'false'} />
        </span>
        <small>{cueMeta}</small>
      </h2>

      {/* Outside the collapsible body and outside the scroll container: the mine result
          is the one thing that must never be scrolled or collapsed out of sight. */}
      <output className="study-mining-message" role="status" aria-live="polite">
        {message}
      </output>

      {/* Same rule, and the reason it sits beside the result rather than inside the form:
          finding out from Anki's duplicate warning means the framing, the screenshot and
          the audio clip were all captured first. Say it before that work is done. */}
      {alreadyMined ? (
        <p className="study-mining-mined" role="status">
          {t('mediaWorkspace.mining.alreadyMined', {
            term: alreadyMined.term || draft.term,
            destination: alreadyMined.destination
              || t('mediaWorkspace.mining.unknownDeck'),
          })}
        </p>
      ) : null}

      {!expanded ? null : (
      // Own scroll container, so the heading and the result message stay pinned instead
      // of scrolling away with the form.
      <div className="study-mining-body">
      <div className="study-mining-grid">
        <label>
          {t('mediaWorkspace.mining.cardKind')}
          <select
            value={draft.cardKind}
            onChange={(event) => update('cardKind', event.currentTarget.value as VideoCoreMiningDraft['cardKind'])}
          >
            <option value="sentence">{t('mediaWorkspace.mining.sentence')}</option>
            <option value="word">{t('mediaWorkspace.mining.word')}</option>
          </select>
        </label>
        <label>
          {t('mediaWorkspace.mining.term')}
          <input value={draft.term} onChange={(event) => update('term', event.currentTarget.value)} />
        </label>
        <label>
          {t('mediaWorkspace.mining.reading')}
          <input value={draft.reading} onChange={(event) => update('reading', event.currentTarget.value)} />
        </label>
        <label>
          {t('mediaWorkspace.mining.meaning')}
          <input value={draft.meaning} onChange={(event) => update('meaning', event.currentTarget.value)} />
        </label>
        <label className="study-mining-wide">
          {t('mediaWorkspace.mining.sentence')}
          <textarea value={draft.sentence} onChange={(event) => update('sentence', event.currentTarget.value)} />
        </label>
        <label className="study-mining-wide">
          {t('mediaWorkspace.mining.translation')}
          <textarea value={draft.translation} onChange={(event) => update('translation', event.currentTarget.value)} />
        </label>
        <label className="study-mining-wide">
          {t('mediaWorkspace.mining.destination')}
          <input
            list="video-core-anki-decks"
            value={draft.deckName}
            placeholder={t('mediaWorkspace.mining.destinationPlaceholder')}
            onChange={(event) => update('deckName', event.currentTarget.value)}
          />
          <datalist id="video-core-anki-decks">
            {decks.map((deck) => <option value={deck} key={deck} />)}
          </datalist>
        </label>
      </div>
      <div className="study-mining-assets">
        <button
          type="button"
          data-study-action="capture-screenshot"
          disabled={busy != null}
          onClick={() => void onScreenshot()}
        >
          {busy === 'screenshot'
            ? t('mediaWorkspace.mining.capturing')
            : draft.screenshot
              ? t('mediaWorkspace.mining.replaceScreenshot')
              : t('mediaWorkspace.mining.attachScreenshot')}
        </button>
        <button
          type="button"
          data-study-action="capture-audio"
          disabled={busy != null}
          onClick={() => void onAudio()}
        >
          {busy === 'audio'
            ? t('mediaWorkspace.mining.recording')
            : draft.audio
              ? t('mediaWorkspace.mining.replaceAudio')
              : t('mediaWorkspace.mining.attachAudio')}
        </button>
        <button
          type="button"
          data-study-action="capture-clip"
          disabled={busy != null}
          onClick={() => void onClip()}
        >
          {busy === 'clip'
            ? t('mediaWorkspace.mining.clipping')
            : draft.clip
              ? t('mediaWorkspace.mining.replaceClip')
              : t('mediaWorkspace.mining.attachClip')}
        </button>
        <span>
          {draft.clip
            ? t('mediaWorkspace.mining.clipReady', {
                size: Math.round(draft.clip.bytes / 1024),
              })
            : t('mediaWorkspace.mining.noClip')}
        </span>
        <span>
          {draft.screenshot
            ? t('mediaWorkspace.mining.screenshotReady', {
                size: Math.round(draft.screenshot.bytes / 1024),
              })
            : t('mediaWorkspace.mining.noScreenshot')}
        </span>
        <span>
          {draft.audio
            ? t('mediaWorkspace.mining.audioReady', {
                size: Math.round(draft.audio.bytes / 1024),
              })
            : t('mediaWorkspace.mining.noAudio')}
        </span>
      </div>

      {/* A byte count is not a preview. Both assets go straight to Anki, so what is
          actually attached has to be inspectable before Mine, not after Undo. */}
      {(draft.screenshotBase64 || draft.audioBase64 || draft.clipBase64) && (
        <div className="study-mining-preview">
          {draft.clipBase64 && (
            <video
              controls
              preload="metadata"
              className="study-mining-clip"
              aria-label={t('mediaWorkspace.mining.clipPreview')}
              src={`data:${draft.clip?.mimeType || 'video/mp4'};base64,${draft.clipBase64}`}
            />
          )}
          {draft.screenshotBase64 && (
            <img
              src={`data:${draft.screenshot?.mimeType || 'image/png'};base64,${draft.screenshotBase64}`}
              alt={t('mediaWorkspace.mining.screenshotPreview')}
            />
          )}
          {draft.audioBase64 && (
            <audio
              controls
              preload="metadata"
              aria-label={t('mediaWorkspace.mining.audioPreview')}
              src={`data:${draft.audio?.mimeType || 'audio/webm'};base64,${draft.audioBase64}`}
            />
          )}
        </div>
      )}

      <div className="study-mining-actions">
        <button
          type="button"
          data-study-action="mine-card"
          disabled={busy != null || missingTerm}
          title={missingTerm ? t('mediaWorkspace.mining.missingText') : undefined}
          onClick={() => void onMine()}
        >
          {busy === 'mine'
            ? t('mediaWorkspace.mining.mining')
            : t('mediaWorkspace.mining.mine')}
        </button>
        {/* Beside Mine rather than among the capture buttons: this is a second thing to
            *do* with the line, not a third asset to arm. It makes its own bounded frame,
            so it neither needs nor consumes whatever the screenshot button attached. */}
        <MediaCueAgentHandoffButton
          line={draft.sentence.trim() || draft.provenance.cue.text}
          mediaTitle={source.mediaTitle || source.localFilePath || source.playbackId}
          video={video}
        />
        {/* Beside the other two for the same reason: a third thing to *do* when
            the line in front of you is not the text you wanted. It reads pixels,
            so it is the only one of the three that can reach a burned-in sign. */}
        <MediaLensCaptureButton source={source} video={video} />
        {missingTerm && (
          <small className="study-mining-hint">{t('mediaWorkspace.mining.missingText')}</small>
        )}
      </div>
      <details className="study-mining-provenance">
        <summary>{t('mediaWorkspace.mining.provenance')}</summary>
        <dl>
          <dt>{t('mediaWorkspace.mining.media')}</dt>
          <dd>{source.mediaTitle || source.localFilePath || source.playbackId}</dd>
          <dt>{t('mediaWorkspace.mining.episodeLabel')}</dt>
          <dd>{source.episodeTitle || source.episodeNumber || t('mediaWorkspace.mining.localFile')}</dd>
          <dt>{t('mediaWorkspace.mining.cue')}</dt>
          <dd>
            {t('mediaWorkspace.mining.cueMeta', {
              cue: selectedCue.index,
              track: selectedCue.trackNumber,
              start: selectedCue.startMs,
              end: selectedCue.endMs,
            })}
          </dd>
          <dt>{t('mediaWorkspace.mining.rawText')}</dt><dd>{selectedCue.text}</dd>
          <dt>{t('mediaWorkspace.mining.assets')}</dt>
          <dd>
            {draft.screenshot?.filename || t('mediaWorkspace.mining.none')}
            {' · '}
            {draft.audio?.filename || t('mediaWorkspace.mining.none')}
          </dd>
        </dl>
      </details>
      {recent.length > 0 && (
        <div className="study-mining-history">
          <span>{t('mediaWorkspace.mining.history')}</span>
          {recent.map((entry) => {
            const label = entry.term || entry.sentence;
            return (
              <div key={entry.id} data-history-status={entry.status}>
                <span title={label}>{label}</span>
                <small>
                  {t(MINING_HISTORY_STATUS_KEY[entry.status])}
                  {entry.destination ? ` · ${entry.destination}` : ''}
                </small>
                {entry.status === 'exported' && entry.noteId && (
                  <button
                    type="button"
                    disabled={busy != null}
                    // "Undo" repeated down a list gives a screen reader nothing to
                    // choose between; name each one by the card it removes.
                    aria-label={t('mediaWorkspace.mining.undoNote', { term: label })}
                    onClick={() => void onUndo(entry)}
                  >
                    {t('mediaWorkspace.mining.undo')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>
      )}
    </section>
  );
}
