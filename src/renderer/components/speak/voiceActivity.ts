/**
 * Hands-free voice for the conversation partner (docs/SCORECARD.md "Conversation /
 * shadowing / writing"): an energy-based voice-activity detector on the
 * microphone, so the learner just talks — the end of what they said is found by
 * the pause after it, and talking while the partner's voice plays interrupts it.
 *
 * Web Audio only, no model and no dependency: a short window's RMS level against
 * a noise floor that follows the room while nobody speaks. Two pieces:
 *
 * - `EnergyVad` — the decision, pure and synchronous (unit-tested on synthetic
 *   levels): speech starts after the level stays above the floor for a moment,
 *   and ends after it stays below for `endSilenceMs`. Too short a burst (a cough,
 *   a click) is discarded, never sent.
 * - `startVoiceLoop` — the microphone (echo cancellation and noise suppression
 *   on), a pre-roll so the first syllable is not clipped, and each utterance
 *   handed over as 16 kHz mono PCM for the LOCAL Whisper model. Audio never
 *   leaves this computer.
 *
 * Loaded only with the conversation partner (lazy).
 */
import { SPEECH_SAMPLE_RATE } from '../../speechCapture';

export interface VadTuning {
  /** Speech starts once the level is this many times the noise floor… */
  startRatio: number;
  /** …and stays there this long. */
  minStartMs: number;
  /** Speech is over once the level stays below `floor × endRatio` this long. */
  endRatio: number;
  endSilenceMs: number;
  /** Shorter utterances are discarded (a cough, a click, a chair). */
  minSpeechMs: number;
  /** An utterance is cut (and sent) after this long. */
  maxSpeechMs: number;
  /** The quietest the floor may be (RMS, 0..1): below it, every breath would count. */
  floorMin: number;
  /** An absolute start level, whatever the floor. */
  startMin: number;
  /**
   * In barge-in mode (the partner's voice is playing through the speakers) the
   * start needs this much more level and twice the time, so the partner's own
   * voice leaking into the microphone does not interrupt itself.
   */
  bargeInFactor: number;
}

export const DEFAULT_VAD_TUNING: VadTuning = {
  startRatio: 3,
  minStartMs: 120,
  endRatio: 2,
  endSilenceMs: 900,
  minSpeechMs: 300,
  maxSpeechMs: 30_000,
  floorMin: 0.004,
  startMin: 0.012,
  bargeInFactor: 2.5,
};

export type VadEvent = 'speech-start' | 'speech-end' | 'speech-discard';

/** The detector: feed it one level per audio window, in order. */
export class EnergyVad {
  readonly tuning: VadTuning;
  /** The room's level while nobody speaks (RMS). */
  floor: number;
  speaking = false;
  private aboveMs = 0;
  private speechMs = 0;
  private silentMs = 0;

  constructor(tuning: Partial<VadTuning> = {}) {
    this.tuning = { ...DEFAULT_VAD_TUNING, ...tuning };
    this.floor = this.tuning.floorMin;
  }

  /** The level speech has to reach to start, in the current mode. */
  startLevel(bargeIn = false): number {
    const base = Math.max(this.floor * this.tuning.startRatio, this.tuning.startMin);
    return bargeIn ? base * this.tuning.bargeInFactor : base;
  }

  /**
   * One window: its RMS level (0..1) and length. Returns what changed, if
   * anything. `bargeIn` makes the start stricter (see `VadTuning.bargeInFactor`).
   */
  feed(rms: number, ms: number, bargeIn = false): VadEvent | null {
    const level = Number.isFinite(rms) && rms > 0 ? rms : 0;
    const t = this.tuning;
    if (!this.speaking) {
      if (level >= this.startLevel(bargeIn)) {
        this.aboveMs += ms;
        if (this.aboveMs >= t.minStartMs * (bargeIn ? 2 : 1)) {
          this.speaking = true;
          this.speechMs = this.aboveMs;
          this.silentMs = 0;
          this.aboveMs = 0;
          return 'speech-start';
        }
        return null;
      }
      this.aboveMs = 0;
      // The floor follows the room only while it is quiet: slowly up (a fan
      // starting), quickly down (a door closed).
      const rate = level > this.floor ? 0.02 : 0.1;
      this.floor = Math.max(t.floorMin, this.floor + (level - this.floor) * rate);
      return null;
    }
    this.speechMs += ms;
    if (level < Math.max(this.floor * t.endRatio, t.startMin * 0.6)) this.silentMs += ms;
    else this.silentMs = 0;
    const capped = this.speechMs >= t.maxSpeechMs;
    if (this.silentMs >= t.endSilenceMs || capped) {
      const voiced = this.speechMs - this.silentMs;
      this.speaking = false;
      this.speechMs = 0;
      this.silentMs = 0;
      return voiced >= t.minSpeechMs || capped ? 'speech-end' : 'speech-discard';
    }
    return null;
  }

  /** Forget the utterance in progress (the loop was paused). The floor is kept. */
  reset(): void {
    this.speaking = false;
    this.aboveMs = 0;
    this.speechMs = 0;
    this.silentMs = 0;
  }
}

/** Root-mean-square level of one window of samples. */
export function rmsLevel(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

/** Float PCM resampled linearly to `to` Hz: plenty for speech recognition, and synchronous. */
function resampleFloatPcm(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to || !input.length) return input;
  const length = Math.max(1, Math.round((input.length * to) / from));
  const out = new Float32Array(length);
  const step = from / to;
  for (let i = 0; i < length; i += 1) {
    const pos = i * step;
    const left = Math.floor(pos);
    const right = Math.min(input.length - 1, left + 1);
    const frac = pos - left;
    out[i] = input[left] * (1 - frac) + input[right] * frac;
  }
  return out;
}

/**
 * What the loop listens for:
 * - `listen`: a new utterance;
 * - `barge-in`: the partner is talking; speech (stricter, see `bargeInFactor`)
 *   interrupts it and is then captured as the next utterance;
 * - `paused`: nothing is captured (a reply is being transcribed or written); the
 *   level meter keeps moving so the microphone is visibly still open.
 */
export type VoiceLoopMode = 'listen' | 'barge-in' | 'paused';

export interface VoiceLoopHandlers {
  /** 0..1, roughly perceptual, about 20 times a second. */
  onLevel?: (level: number) => void;
  /** Speech began (in `barge-in` mode: the learner interrupted). */
  onSpeechStart?: (interrupted: boolean) => void;
  /** A complete utterance, 16 kHz mono. */
  onUtterance: (pcm: Float32Array, seconds: number) => void;
  /** A burst too short to be speech was dropped. */
  onDiscard?: () => void;
}

export interface VoiceLoop {
  setMode(mode: VoiceLoopMode): void;
  readonly mode: VoiceLoopMode;
  /** Closes the microphone (and the OS indicator with it). */
  stop(): void;
}

type AudioContextCtor = new () => AudioContext;

/** How much audio before the detected start is kept, so the first syllable survives. */
const PRE_ROLL_MS = 350;
const FRAME = 2048;

/**
 * Opens the microphone and runs the loop until `stop()`. Throws `mic-unsupported`
 * where Web Audio or `getUserMedia` is missing; the browser's permission decides
 * the rest (a refusal rejects).
 */
export async function startVoiceLoop(handlers: VoiceLoopHandlers, tuning: Partial<VadTuning> = {}): Promise<VoiceLoop> {
  const Ctx = (window as unknown as { AudioContext?: AudioContextCtor }).AudioContext;
  if (!Ctx || !navigator.mediaDevices?.getUserMedia) throw new Error('mic-unsupported');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  let context: AudioContext;
  try {
    context = new Ctx();
  } catch (error) {
    for (const track of stream.getTracks()) track.stop();
    throw error;
  }
  const source = context.createMediaStreamSource(stream);
  // ScriptProcessor rather than an AudioWorklet: one small window at a time is all
  // an energy detector needs, and it needs no separate module file to load.
  const processor = context.createScriptProcessor(FRAME, 1, 1);
  const silent = context.createGain();
  silent.gain.value = 0;
  source.connect(processor);
  processor.connect(silent);
  silent.connect(context.destination);

  const vad = new EnergyVad(tuning);
  const rate = context.sampleRate;
  const frameMs = (FRAME / rate) * 1000;
  const preRollFrames = Math.max(1, Math.ceil(PRE_ROLL_MS / frameMs));
  const preRoll: Float32Array[] = [];
  let captured: Float32Array[] = [];
  let mode: VoiceLoopMode = 'listen';
  let stopped = false;
  let levelAt = 0;

  const finish = (): void => {
    const total = captured.reduce((n, part) => n + part.length, 0);
    const joined = new Float32Array(total);
    let offset = 0;
    for (const part of captured) {
      joined.set(part, offset);
      offset += part.length;
    }
    captured = [];
    const pcm = resampleFloatPcm(joined, rate, SPEECH_SAMPLE_RATE);
    handlers.onUtterance(pcm, total / rate);
  };

  processor.onaudioprocess = (event) => {
    if (stopped) return;
    const samples = new Float32Array(event.inputBuffer.getChannelData(0));
    const level = rmsLevel(samples);
    const now = performance.now();
    if (now - levelAt >= 50) {
      levelAt = now;
      // A perceptual-ish 0..1: -60 dBFS is empty, -10 dBFS is full.
      const db = 20 * Math.log10(Math.max(level, 1e-6));
      handlers.onLevel?.(Math.min(1, Math.max(0, (db + 60) / 50)));
    }
    if (mode === 'paused') return;
    const wasSpeaking = vad.speaking;
    const verdict = vad.feed(level, frameMs, mode === 'barge-in');
    if (verdict === 'speech-start') {
      captured = [...preRoll, samples];
      preRoll.length = 0;
      const interrupted = mode === 'barge-in';
      mode = 'listen';
      handlers.onSpeechStart?.(interrupted);
      return;
    }
    if (wasSpeaking) {
      captured.push(samples);
      if (verdict === 'speech-end') finish();
      else if (verdict === 'speech-discard') {
        captured = [];
        handlers.onDiscard?.();
      }
      return;
    }
    preRoll.push(samples);
    if (preRoll.length > preRollFrames) preRoll.shift();
  };

  return {
    get mode() {
      return mode;
    },
    setMode(next: VoiceLoopMode) {
      if (next === mode) return;
      // Leaving a capture behind (paused mid-utterance) throws it away.
      if (next === 'paused') {
        vad.reset();
        captured = [];
      }
      mode = next;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      processor.onaudioprocess = null;
      try {
        source.disconnect();
        processor.disconnect();
        silent.disconnect();
      } catch {
        // Already disconnected.
      }
      for (const track of stream.getTracks()) track.stop();
      void context.close().catch(() => undefined);
    },
  };
}
