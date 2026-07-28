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

interface Props {
  cue: VideoCoreStudyCue | null;
  displayText: string;
  source: VideoCoreMiningSource | null;
  video: HTMLVideoElement | null;
  subtitleDelaySec: number;
}

interface CapturedAsset {
  base64: string;
  filename: string;
  mimeType: string;
  bytes: number;
}

type CapturableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

function loadHistory(): VideoCoreMiningHistoryEntry[] {
  try {
    return normalizeVideoCoreMiningHistory(
      JSON.parse(localStorage.getItem(VIDEO_CORE_MINING_HISTORY_KEY) ?? '[]'),
    );
  } catch {
    return [];
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      resolve(value.split(',', 2)[1] ?? '');
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read captured asset.'));
    reader.readAsDataURL(blob);
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The browser could not encode the captured frame.'));
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
    throw new Error('The video frame is not ready yet.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas capture is unavailable.');
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

function waitForSeek(video: HTMLVideoElement, target: number): Promise<void> {
  if (Math.abs(video.currentTime - target) < 0.02) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Timed out while seeking to the cue.'));
    }, 5000);
    const onSeeked = (): void => {
      cleanup();
      resolve();
    };
    const cleanup = (): void => {
      window.clearTimeout(timeout);
      video.removeEventListener('seeked', onSeeked);
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = target;
  });
}

function chooseAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ].find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
}

async function recordCueAudio(
  video: HTMLVideoElement,
  cue: VideoCoreStudyCue,
  subtitleDelaySec: number,
): Promise<CapturedAsset> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Audio capture is unavailable in this browser.');
  }
  const capturable = video as CapturableVideo;
  const capture = capturable.captureStream?.bind(video)
    ?? capturable.mozCaptureStream?.bind(video);
  if (!capture) throw new Error('This browser cannot capture the VideoCore audio stream.');

  const startSec = cuePlaybackStartSec(cue, subtitleDelaySec);
  const endSec = cuePlaybackEndSec(cue, subtitleDelaySec);
  const durationMs = Math.round((endSec - startSec) * 1000);
  if (durationMs < 100 || durationMs > 30_000) {
    throw new Error('The selected cue has an unsupported audio duration.');
  }

  const wasPaused = video.paused;
  const restoreTime = video.currentTime;
  const restoreRate = video.playbackRate;
  let recorder: MediaRecorder | null = null;
  let capturedStream: MediaStream | null = null;
  let timer = 0;
  try {
    video.pause();
    video.playbackRate = 1;
    await waitForSeek(video, startSec);
    const stream = capture();
    capturedStream = stream;
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) throw new Error('The selected VideoCore source has no capturable audio track.');
    const audioStream = new MediaStream(audioTracks);
    const mimeType = chooseAudioMimeType();
    recorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);
    const chunks: BlobPart[] = [];
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    const stopped = new Promise<void>((resolve) => {
      recorder?.addEventListener('stop', () => resolve(), { once: true });
    });
    recorder.start(100);
    await video.play();
    await new Promise<void>((resolve) => {
      timer = window.setTimeout(resolve, durationMs);
    });
    video.pause();
    video.currentTime = endSec;
    recorder.stop();
    await stopped;
    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
    if (!blob.size) throw new Error('The captured cue audio was empty.');
    const extension = blob.type.includes('ogg') ? 'ogg' : 'webm';
    return {
      base64: await blobToBase64(blob),
      filename: `jp-video-cue-${cue.trackNumber}-${cue.index}-${cue.startMs}.${extension}`,
      mimeType: blob.type || `audio/${extension}`,
      bytes: blob.size,
    };
  } finally {
    window.clearTimeout(timer);
    if (recorder?.state === 'recording') recorder.stop();
    capturedStream?.getTracks().forEach((track) => track.stop());
    video.pause();
    video.playbackRate = restoreRate;
    video.currentTime = restoreTime;
    if (!wasPaused) void video.play().catch(() => undefined);
  }
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
}: Props): React.ReactElement {
  const [draft, setDraft] = React.useState<VideoCoreMiningDraft | null>(null);
  const [selectedCue, setSelectedCue] = React.useState<VideoCoreStudyCue | null>(null);
  const [history, setHistory] = React.useState<VideoCoreMiningHistoryEntry[]>(loadHistory);
  const [decks, setDecks] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState<'screenshot' | 'audio' | 'mine' | 'undo' | null>(null);
  const [message, setMessage] = React.useState('');

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
      setMessage(`Screenshot attached · ${Math.round(captured.bytes / 1024)} KB`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Screenshot capture failed.');
    } finally {
      setBusy(null);
    }
  };

  const onAudio = async (): Promise<void> => {
    if (!draft || !selectedCue || !video) return;
    setBusy('audio');
    setMessage('Recording the exact cue range…');
    try {
      const captured = await recordCueAudio(video, selectedCue, subtitleDelaySec);
      setDraft((current) => current
        ? withVideoCoreMiningAsset(current, 'audio', {
            base64: captured.base64,
            asset: captured,
          })
        : current);
      setMessage(`Audio attached · ${Math.round(captured.bytes / 1024)} KB`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Cue audio capture failed.');
    } finally {
      setBusy(null);
    }
  };

  const onMine = async (): Promise<void> => {
    if (!draft || !draft.term.trim()) {
      setMessage('Add a term or sentence before mining.');
      return;
    }
    if (typeof window.api?.ankiMineNote !== 'function') {
      setMessage('Mining is available inside the Study OS desktop app.');
      return;
    }
    setBusy('mine');
    setMessage('');
    try {
      const result = await window.api.ankiMineNote(buildVideoCoreMineRequest(draft));
      const entry = createVideoCoreMiningHistoryEntry(draft, result);
      setHistory((current) => appendVideoCoreMiningHistory(current, entry));
      if (result.ok) {
        setMessage(
          `Mined to ${result.profileName ?? (draft.deckName || 'the active Anki destination')}.`,
        );
      } else if (result.error === 'duplicate') {
        setMessage('Duplicate warning: Anki already contains this note.');
      } else {
        setMessage(result.error || 'Anki export failed.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Anki export failed.');
    } finally {
      setBusy(null);
    }
  };

  const onUndo = async (entry: VideoCoreMiningHistoryEntry): Promise<void> => {
    if (!entry.noteId || typeof window.api?.ankiDeleteNotes !== 'function') return;
    const noteId = entry.noteId;
    setBusy('undo');
    setMessage('');
    try {
      const result = await window.api.ankiDeleteNotes([noteId]);
      if (!result.ok) throw new Error(result.error || 'Could not undo the Anki export.');
      setHistory((current) => markVideoCoreMiningHistoryUndone(current, noteId));
      setMessage(`Undid note ${noteId}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not undo the Anki export.');
    } finally {
      setBusy(null);
    }
  };

  const recent = history.slice(-5).reverse();
  if (!draft || !selectedCue || !source) {
    return (
      <section className="study-mining-panel" data-study-mining="waiting">
        <p>Select a real subtitle cue to prepare a card.</p>
      </section>
    );
  }

  return (
    <section
      className="study-mining-panel"
      data-study-mining="ready"
      data-screenshot-bytes={draft.screenshot?.bytes}
      data-audio-bytes={draft.audio?.bytes}
    >
      <div className="study-mining-heading">
        <span>Card preview</span>
        <small>
          Cue {selectedCue.index + 1} · track {selectedCue.trackNumber} · {selectedCue.startMs}–{selectedCue.endMs} ms
        </small>
      </div>
      <div className="study-mining-grid">
        <label>
          Card kind
          <select
            value={draft.cardKind}
            onChange={(event) => update('cardKind', event.currentTarget.value as VideoCoreMiningDraft['cardKind'])}
          >
            <option value="sentence">Sentence</option>
            <option value="word">Word</option>
          </select>
        </label>
        <label>
          Term
          <input value={draft.term} onChange={(event) => update('term', event.currentTarget.value)} />
        </label>
        <label>
          Reading
          <input value={draft.reading} onChange={(event) => update('reading', event.currentTarget.value)} />
        </label>
        <label>
          Meaning
          <input value={draft.meaning} onChange={(event) => update('meaning', event.currentTarget.value)} />
        </label>
        <label className="study-mining-wide">
          Sentence
          <textarea value={draft.sentence} onChange={(event) => update('sentence', event.currentTarget.value)} />
        </label>
        <label className="study-mining-wide">
          Translation
          <textarea value={draft.translation} onChange={(event) => update('translation', event.currentTarget.value)} />
        </label>
        <label className="study-mining-wide">
          Anki destination
          <input
            list="video-core-anki-decks"
            value={draft.deckName}
            placeholder="Mining rules / active profile"
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
          {busy === 'screenshot' ? 'Capturing…' : draft.screenshot ? 'Replace screenshot' : 'Attach screenshot'}
        </button>
        <button
          type="button"
          data-study-action="capture-audio"
          disabled={busy != null}
          onClick={() => void onAudio()}
        >
          {busy === 'audio' ? 'Recording…' : draft.audio ? 'Replace cue audio' : 'Attach cue audio'}
        </button>
        <span>
          {draft.screenshot
            ? `Screenshot ready · ${Math.round(draft.screenshot.bytes / 1024)} KB`
            : 'No screenshot'}
        </span>
        <span>
          {draft.audio
            ? `Audio ready · ${Math.round(draft.audio.bytes / 1024)} KB`
            : 'No audio'}
        </span>
      </div>
      <div className="study-mining-actions">
        <button
          type="button"
          data-study-action="mine-card"
          disabled={busy != null || !draft.term.trim()}
          onClick={() => void onMine()}
        >
          {busy === 'mine' ? 'Mining…' : 'Mine card'}
        </button>
        {message && <output>{message}</output>}
      </div>
      <details className="study-mining-provenance">
        <summary>Provenance</summary>
        <dl>
          <dt>Media</dt><dd>{source.mediaTitle || source.localFilePath || source.playbackId}</dd>
          <dt>Episode</dt><dd>{source.episodeTitle || source.episodeNumber || 'Local file'}</dd>
          <dt>Cue</dt><dd>{selectedCue.trackNumber}:{selectedCue.index} · {selectedCue.startMs}–{selectedCue.endMs} ms</dd>
          <dt>Raw text</dt><dd>{selectedCue.text}</dd>
          <dt>Assets</dt><dd>{draft.screenshot?.filename || 'none'} · {draft.audio?.filename || 'none'}</dd>
        </dl>
      </details>
      {recent.length > 0 && (
        <div className="study-mining-history">
          <span>Mining history</span>
          {recent.map((entry) => (
            <div key={entry.id}>
              <span>{entry.term || entry.sentence}</span>
              <small>{entry.status}{entry.destination ? ` · ${entry.destination}` : ''}</small>
              {entry.status === 'exported' && entry.noteId && (
                <button type="button" disabled={busy != null} onClick={() => void onUndo(entry)}>
                  Undo
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
