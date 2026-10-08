/**
 * The Region Recorder's hidden recording window (`?regionRecorder=host`).
 *
 * Main (`main/regionRecorder.ts`) calls `window.__gumRecorderStart(config)`
 * with a user gesture. This asks for the display (main's display-media broker
 * grants the chosen monitor, plus the Windows loopback when system audio was
 * asked for), optionally the microphone, mixes the audio in an AudioContext
 * with a gain per source, crops the video live where Chromium's insertable
 * streams exist (else main crops with ffmpeg afterwards), and records WebM
 * with MediaRecorder. Every second's chunk goes to main with a sequence number
 * so main can append them in order whatever order the IPC delivers them in.
 */
import {
  isFullFrameCrop,
  pickRecorderMime,
  recorderWantsMic,
  regionToCropPx,
  type CropPx,
  type RecorderHostCommand,
  type RecorderHostConfig,
  type RecorderHostStartResult,
} from '../../shared/regionRecorder';
import type { GumInsertableStreams } from './insertableStreams';

declare global {
  interface Window {
    __gumRecorderStart?: (config: RecorderHostConfig) => Promise<RecorderHostStartResult>;
  }
}

interface Running {
  recorder: MediaRecorder;
  tracks: MediaStreamTrack[];
  context: AudioContext | null;
  levelTimer: number | null;
  stopCrop: (() => void) | null;
}

let running: Running | null = null;
let nextSeq = 0;
let sendChain: Promise<void> = Promise.resolve();

function rms(analyser: AnalyserNode | null, buffer: Float32Array): number {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
  return Math.min(1, Math.sqrt(sum / buffer.length) * 3);
}

/**
 * Crop `track` to `crop` frame by frame. Resolves to the cropped track, or
 * null when this engine cannot (no insertable streams, or the first frame
 * refuses the crop) — the caller then records the full monitor.
 */
async function liveCrop(track: MediaStreamTrack, crop: CropPx): Promise<{ track: MediaStreamTrack; stop: () => void } | null> {
  const api = window as unknown as GumInsertableStreams;
  const Processor = api.MediaStreamTrackProcessor;
  const Generator = api.MediaStreamTrackGenerator;
  const Frame = api.VideoFrame;
  if (!Processor || !Generator || !Frame) return null;
  const source = track.clone();
  try {
    const reader = new Processor({ track: source }).readable.getReader();
    const generator = new Generator({ kind: 'video' });
    const writer = generator.writable.getWriter();
    const cropFrame = (frame: VideoFrame): VideoFrame => new Frame(frame, {
      visibleRect: { x: crop.x, y: crop.y, width: crop.width, height: crop.height },
      displayWidth: crop.width,
      displayHeight: crop.height,
    });
    const first = await reader.read();
    if (first.done || !first.value) throw new Error('no frame');
    let cropped: VideoFrame;
    try {
      cropped = cropFrame(first.value);
    } finally {
      first.value.close();
    }
    await writer.write(cropped);
    let stopped = false;
    void (async () => {
      while (!stopped) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        try {
          await writer.write(cropFrame(value));
        } catch {
          stopped = true;
        } finally {
          value.close();
        }
      }
      try {
        await writer.close();
      } catch {
        /* already closed */
      }
    })();
    return {
      track: generator,
      stop: () => {
        stopped = true;
        void reader.cancel().catch(() => undefined);
        source.stop();
        generator.stop();
      },
    };
  } catch {
    source.stop();
    return null;
  }
}

function cleanup(): void {
  const r = running;
  running = null;
  if (!r) return;
  if (r.levelTimer !== null) window.clearInterval(r.levelTimer);
  r.stopCrop?.();
  for (const track of r.tracks) track.stop();
  void r.context?.close().catch(() => undefined);
}

async function start(config: RecorderHostConfig): Promise<RecorderHostStartResult> {
  if (running) return { ok: false, errorKey: 'recorder.error.busy' };
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
    return { ok: false, errorKey: 'recorder.error.unsupported' };
  }
  let display: MediaStream;
  try {
    display = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: config.fps },
      audio: config.systemAudioGranted,
    });
  } catch (err) {
    return { ok: false, errorKey: 'recorder.error.streamFailed', error: err instanceof Error ? err.message : String(err) };
  }
  const tracks: MediaStreamTrack[] = [...display.getTracks()];
  const fail = (errorKey: string, error?: string): RecorderHostStartResult => {
    for (const track of tracks) track.stop();
    return { ok: false, errorKey, error };
  };
  const video = display.getVideoTracks()[0];
  if (!video) return fail('recorder.error.streamFailed', 'no video track');
  const settings = video.getSettings();
  const frameSize = {
    width: Number(settings.width) || Math.round(config.displaySize.width * window.devicePixelRatio),
    height: Number(settings.height) || Math.round(config.displaySize.height * window.devicePixelRatio),
  };
  const crop = regionToCropPx(config.region, config.displaySize, frameSize);
  if (!crop) return fail('recorder.error.regionTooSmall');
  const full = isFullFrameCrop(crop, frameSize);
  const cropped = full ? null : await liveCrop(video, crop);

  // Audio: the loopback from the display stream, the microphone, mixed with a gain each.
  const systemTracks = display.getAudioTracks();
  let micStream: MediaStream | null = null;
  if (recorderWantsMic(config.audio)) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(config.micDeviceId ? { deviceId: { exact: config.micDeviceId } } : {}),
          // A recording wants the room as it was, not a call-cleaned voice.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      tracks.push(...micStream.getTracks());
    } catch {
      micStream = null;
    }
  }
  let context: AudioContext | null = null;
  let mixed: MediaStreamTrack[] = [];
  let micAnalyser: AnalyserNode | null = null;
  let systemAnalyser: AnalyserNode | null = null;
  if (systemTracks.length || micStream) {
    const ctx = new AudioContext();
    context = ctx;
    const destination = ctx.createMediaStreamDestination();
    const connect = (stream: MediaStream, gainValue: number): AnalyserNode => {
      const node = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = gainValue;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      node.connect(gain);
      gain.connect(destination);
      gain.connect(analyser);
      return analyser;
    };
    if (systemTracks.length) systemAnalyser = connect(new MediaStream(systemTracks), config.systemGain);
    if (micStream) micAnalyser = connect(micStream, config.micGain);
    if (context.state === 'suspended') await context.resume().catch(() => undefined);
    mixed = destination.stream.getAudioTracks();
  }

  const mime = pickRecorderMime((m) => MediaRecorder.isTypeSupported(m));
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(new MediaStream([cropped?.track ?? video, ...mixed]), {
      ...(mime ? { mimeType: mime } : {}),
      videoBitsPerSecond: config.videoBitsPerSecond,
      ...(mixed.length ? { audioBitsPerSecond: 160_000 } : {}),
    });
  } catch (err) {
    cropped?.stop();
    void context?.close();
    return fail('recorder.error.encoder', err instanceof Error ? err.message : String(err));
  }
  nextSeq = 0;
  sendChain = Promise.resolve();
  recorder.ondataavailable = (event) => {
    const blob = event.data;
    if (!blob || !blob.size) return;
    // The number is taken now, in production order; the bytes follow when read.
    const seq = nextSeq;
    nextSeq += 1;
    sendChain = sendChain.then(async () => {
      window.api.recorderHostChunk(seq, new Uint8Array(await blob.arrayBuffer()));
    }).catch(() => undefined);
  };
  recorder.onstop = () => {
    const lastSeq = nextSeq - 1;
    void sendChain.then(() => {
      window.api.recorderHostEvent({ type: 'stopped', lastSeq });
      cleanup();
    });
  };
  recorder.onerror = (event) => {
    window.api.recorderHostEvent({ type: 'error', message: String((event as unknown as { error?: Error }).error?.message ?? 'recorder error') });
  };
  video.addEventListener('ended', () => window.api.recorderHostEvent({ type: 'ended', reason: 'track-ended' }));

  const buffer = new Float32Array(1024);
  const levelTimer = mixed.length
    ? window.setInterval(() => {
      window.api.recorderHostEvent({ type: 'levels', mic: rms(micAnalyser, buffer), system: rms(systemAnalyser, buffer) });
    }, 200)
    : null;
  running = { recorder, tracks, context, levelTimer, stopCrop: cropped?.stop ?? null };
  recorder.start(config.chunkMs);
  return {
    ok: true,
    mime: recorder.mimeType || mime,
    frameSize,
    liveCrop: full || !!cropped,
    crop: full || cropped ? null : crop,
    hasAudio: mixed.length > 0,
    systemAudio: systemTracks.length > 0,
    mic: !!micStream,
  };
}

function onCommand(command: RecorderHostCommand): void {
  const r = running;
  if (command.type === 'stop') {
    if (r && r.recorder.state !== 'inactive') r.recorder.stop();
    else window.api.recorderHostEvent({ type: 'stopped', lastSeq: nextSeq - 1 });
  } else if (command.type === 'pause' && r?.recorder.state === 'recording') {
    r.recorder.pause();
  } else if (command.type === 'resume' && r?.recorder.state === 'paused') {
    r.recorder.resume();
  }
}

export function installRegionRecorderHost(): void {
  window.__gumRecorderStart = start;
  window.api.onRecorderHostCommand(onCommand);
  window.addEventListener('beforeunload', cleanup);
}
