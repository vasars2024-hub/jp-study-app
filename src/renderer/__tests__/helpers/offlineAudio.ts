/**
 * A small offline Web Audio renderer for tests (snd2).
 *
 * The repo has no Web Audio implementation for Node, and the Soundscape engine
 * builds its whole sound from Web Audio nodes, so "does it clip, does a loop
 * click" could only ever be answered by ear — and nobody had listened. This
 * implements the subset the engine uses, sample by sample, so a test can render
 * a few seconds of any mix and measure it.
 *
 * Fidelity, stated so a number is not over-read:
 *  - MONO. A panner passes its input through unchanged, which is the loud case
 *    (a centred source); stereo buffers are read from channel 0.
 *  - AudioParam automation follows the spec's curves (set, linear, exponential,
 *    setTarget) closely enough for envelopes; a-rate modulation (`connect` to a
 *    param) is summed per sample, as in the browser.
 *  - Biquads use the RBJ cookbook — the same formulas the spec cites.
 *  - The convolver is an energy-normalised exponential decay, NOT the impulse.
 *    The browser normalises a convolver's impulse by default, so its energy
 *    gain is ~1; the shape of the tail does not matter for a peak or RMS check.
 *  - The compressor is a feed-forward peak limiter with the node's threshold,
 *    knee, ratio, attack and release, and the browser's automatic make-up gain
 *    (Chromium: (1 / gain at 0 dBFS)^0.6). Close, not identical.
 */

type Target = FNode | FParam;

let renderIndex = -1;

export class FParam {
  /** The value automation starts from (the spec's "intrinsic" default). */
  private base: number;
  readonly mods: FNode[] = [];
  private events: Array<{ kind: 'set' | 'linear' | 'exp' | 'target'; t: number; v: number; tc?: number }> = [];

  constructor(private readonly ctx: FakeAudioContext, initial: number) {
    this.base = initial;
  }

  /** Reading `.value` gives the current automated value, as in the browser. */
  get value(): number {
    return this.intrinsic(this.ctx.currentTime);
  }

  /** Writing `.value` is `setValueAtTime(v, currentTime)`, as in the browser. */
  set value(v: number) {
    if (this.events.length === 0 && this.ctx.currentTime === 0) this.base = v;
    else this.setValueAtTime(v, this.ctx.currentTime);
  }

  setValueAtTime(v: number, t: number): this {
    this.insert({ kind: 'set', t, v });
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.insert({ kind: 'linear', t, v });
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    this.insert({ kind: 'exp', t, v });
    return this;
  }
  setTargetAtTime(v: number, t: number, tc: number): this {
    this.insert({ kind: 'target', t, v, tc });
    return this;
  }
  cancelScheduledValues(t: number): this {
    this.events = this.events.filter((e) => e.t < t);
    return this;
  }

  private insert(event: { kind: 'set' | 'linear' | 'exp' | 'target'; t: number; v: number; tc?: number }): void {
    let i = this.events.length;
    while (i > 0 && this.events[i - 1].t > event.t) i -= 1;
    this.events.splice(i, 0, event);
  }

  /** Time at which `value` was established by the last folded event. */
  private baseT = 0;

  /** The intrinsic (automation) value at time t. */
  private intrinsic(t: number): number {
    let value = this.base;
    let lastT = this.baseT;
    // Events before `foldable` are entirely in the past and not a running target.
    let foldable = 0;
    for (let i = 0; i < this.events.length; i += 1) {
      const e = this.events[i];
      if (e.kind === 'target') {
        if (e.t > t) break;
        const next = this.events[i + 1];
        const end = next && next.t <= t ? next.t : t;
        value = e.v + (value - e.v) * Math.exp(-(end - e.t) / Math.max(1e-6, e.tc ?? 0.1));
        lastT = end;
        if (!(next && next.t <= t)) break;
        continue;
      }
      if (e.t <= t) {
        value = e.v;
        lastT = e.t;
        foldable = i + 1;
        continue;
      }
      // A ramp in progress: from (lastT, value) to (e.t, e.v).
      const span = Math.max(1e-9, e.t - lastT);
      const x = Math.min(1, Math.max(0, (t - lastT) / span));
      if (e.kind === 'linear') {
        value = value + (e.v - value) * x;
      } else if (e.kind === 'exp') {
        const from = Math.abs(value) < 1e-6 ? 1e-6 : value;
        const to = Math.abs(e.v) < 1e-6 ? 1e-6 : e.v;
        value = from * Math.pow(to / from, x);
      }
      break;
    }
    // Fold a settled prefix that ends on a plain value, so long renders stay
    // cheap. A target in the prefix is folded only when an event after it is
    // already past — then its contribution is fixed.
    if (foldable > 0) {
      const last = this.events[foldable - 1];
      this.base = last.v;
      this.baseT = last.t;
      this.events.splice(0, foldable);
    }
    return value;
  }

  at(i: number): number {
    let v = this.intrinsic(i / this.ctx.sampleRate);
    for (const mod of this.mods) v += mod.out(i);
    return v;
  }
}

export abstract class FNode {
  readonly inputs: FNode[] = [];
  private readonly targets: Target[] = [];
  private cacheIndex = -1;
  private cache = 0;
  onended: (() => void) | null = null;

  constructor(readonly ctx: FakeAudioContext) {}

  connect<T extends Target>(dest: T): T {
    if (dest instanceof FParam) dest.mods.push(this);
    else dest.inputs.push(this);
    this.targets.push(dest);
    return dest;
  }

  disconnect(dest?: Target): void {
    const drop = (target: Target): void => {
      const list = target instanceof FParam ? target.mods : target.inputs;
      const at = list.indexOf(this);
      if (at >= 0) list.splice(at, 1);
    };
    if (dest) {
      const at = this.targets.indexOf(dest);
      if (at < 0) throw new Error('InvalidAccessError: not connected');
      this.targets.splice(at, 1);
      drop(dest);
      return;
    }
    for (const target of this.targets) drop(target);
    this.targets.length = 0;
  }

  protected inputSum(i: number): number {
    let sum = 0;
    for (const input of this.inputs) sum += input.out(i);
    return sum;
  }

  out(i: number): number {
    if (this.cacheIndex === i) return this.cache;
    // Mark first: a cycle through this node reads the previous sample, which is
    // what a delay line in the loop guarantees in the real graph.
    this.cacheIndex = i;
    this.cache = this.compute(i);
    return this.cache;
  }

  protected abstract compute(i: number): number;
}

class FGain extends FNode {
  readonly gain: FParam;
  constructor(ctx: FakeAudioContext) {
    super(ctx);
    this.gain = new FParam(ctx, 1);
  }
  protected compute(i: number): number {
    return this.inputSum(i) * this.gain.at(i);
  }
}

class FPanner extends FNode {
  readonly pan: FParam;
  constructor(ctx: FakeAudioContext) {
    super(ctx);
    this.pan = new FParam(ctx, 0);
  }
  protected compute(i: number): number {
    return this.inputSum(i);
  }
}

class FBiquad extends FNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency: FParam;
  readonly Q: FParam;
  readonly gain: FParam;
  readonly detune: FParam;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  private key = '';
  private c = [1, 0, 0, 0, 0];
  constructor(ctx: FakeAudioContext) {
    super(ctx);
    this.frequency = new FParam(ctx, 350);
    this.Q = new FParam(ctx, 1);
    this.gain = new FParam(ctx, 0);
    this.detune = new FParam(ctx, 0);
  }
  private coefficients(f: number, q: number): number[] {
    const sr = this.ctx.sampleRate;
    const freq = Math.min(Math.max(10, f), sr / 2 - 10);
    const w0 = (2 * Math.PI * freq) / sr;
    const alpha = Math.sin(w0) / (2 * Math.max(1e-4, q));
    const cos = Math.cos(w0);
    let b0: number; let b1: number; let b2: number;
    if (this.type === 'highpass') {
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2;
    } else if (this.type === 'bandpass') {
      b0 = alpha; b1 = 0; b2 = -alpha;
    } else {
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2;
    }
    const a0 = 1 + alpha;
    return [b0 / a0, b1 / a0, b2 / a0, (-2 * cos) / a0, (1 - alpha) / a0];
  }
  protected compute(i: number): number {
    const x = this.inputSum(i);
    const f = this.frequency.at(i);
    const q = this.Q.at(i);
    const key = `${f.toFixed(1)}|${q.toFixed(3)}`;
    if (key !== this.key) {
      this.key = key;
      this.c = this.coefficients(f, q);
    }
    const [b0, b1, b2, a1, a2] = this.c;
    const y = b0 * x + b1 * this.x1 + b2 * this.x2 - a1 * this.y1 - a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** Install as `globalThis.PeriodicWave`: the engine tests `instanceof PeriodicWave`. */
export class FakePeriodicWave {
  constructor(readonly imag: Float32Array, readonly scale: number) {}
}

export class FakeBuffer {
  readonly channels: Float32Array[];
  constructor(numberOfChannels: number, readonly length: number, readonly sampleRate: number) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  get numberOfChannels(): number {
    return this.channels.length;
  }
  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
  }
}

abstract class FScheduled extends FNode {
  protected startAt = Infinity;
  protected stopAt = Infinity;
  private ended = false;
  start(when = 0): void {
    this.startAt = Math.max(0, when);
  }
  stop(when = 0): void {
    this.stopAt = Math.max(0, when);
  }
  protected live(i: number): boolean {
    const t = i / this.ctx.sampleRate;
    if (t < this.startAt) return false;
    if (t >= this.stopAt) {
      if (!this.ended) {
        this.ended = true;
        this.onended?.();
      }
      return false;
    }
    return true;
  }
}

class FBufferSource extends FScheduled {
  buffer: FakeBuffer | null = null;
  loop = false;
  readonly playbackRate: FParam;
  private pos = 0;
  constructor(ctx: FakeAudioContext) {
    super(ctx);
    this.playbackRate = new FParam(ctx, 1);
  }
  start(when = 0, offset = 0): void {
    super.start(when);
    this.pos = offset * (this.buffer?.sampleRate ?? this.ctx.sampleRate);
  }
  protected compute(i: number): number {
    const buffer = this.buffer;
    if (!buffer || !this.live(i)) return 0;
    const data = buffer.channels[0];
    let index = Math.floor(this.pos);
    if (index >= data.length) {
      if (!this.loop) return 0;
      index %= data.length;
      this.pos %= data.length;
    }
    this.pos += this.playbackRate.at(i);
    return data[index];
  }
}

class FOscillator extends FScheduled {
  type: OscillatorType = 'sine';
  readonly frequency: FParam;
  readonly detune: FParam;
  private phase = 0;
  private wave: FakePeriodicWave | null = null;
  constructor(ctx: FakeAudioContext) {
    super(ctx);
    this.frequency = new FParam(ctx, 440);
    this.detune = new FParam(ctx, 0);
  }
  setPeriodicWave(wave: FakePeriodicWave): void {
    this.type = 'custom';
    this.wave = wave;
  }
  protected compute(i: number): number {
    if (!this.live(i)) return 0;
    const f = this.frequency.at(i) * Math.pow(2, this.detune.at(i) / 1200);
    const p = this.phase;
    this.phase = (p + f / this.ctx.sampleRate) % 1;
    switch (this.type) {
      case 'square': return p < 0.5 ? 1 : -1;
      case 'sawtooth': return 2 * p - 1;
      case 'triangle': return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
      case 'custom': {
        const w = this.wave;
        if (!w) return 0;
        let s = 0;
        for (let k = 1; k < w.imag.length; k += 1) s += w.imag[k] * Math.sin(2 * Math.PI * k * p);
        return s * w.scale;
      }
      default: return Math.sin(2 * Math.PI * p);
    }
  }
}

class FDelay extends FNode {
  readonly delayTime: FParam;
  private readonly line: Float32Array;
  constructor(ctx: FakeAudioContext, maxSeconds: number) {
    super(ctx);
    this.delayTime = new FParam(ctx, 0);
    this.line = new Float32Array(Math.ceil(maxSeconds * ctx.sampleRate) + 2);
    ctx.delays.push(this);
  }
  protected compute(i: number): number {
    const d = Math.max(1, Math.round(this.delayTime.at(i) * this.ctx.sampleRate));
    const j = i - d;
    return j < 0 ? 0 : this.line[j % this.line.length];
  }
  /** After the sample is rendered: record this sample's input. */
  write(i: number): void {
    this.line[i % this.line.length] = this.inputSum(i);
  }
}

class FConvolver extends FNode {
  buffer: FakeBuffer | null = null;
  normalize = true;
  private y = 0;
  private readonly a: number;
  constructor(ctx: FakeAudioContext) {
    super(ctx);
    this.a = Math.exp(-1 / (0.35 * ctx.sampleRate));
  }
  protected compute(i: number): number {
    // Unit-energy one-pole decay standing in for the normalised impulse.
    this.y = Math.sqrt(1 - this.a * this.a) * this.inputSum(i) + this.a * this.y;
    return this.y;
  }
}

class FCompressor extends FNode {
  readonly threshold: FParam;
  readonly knee: FParam;
  readonly ratio: FParam;
  readonly attack: FParam;
  readonly release: FParam;
  private env = 0;
  constructor(ctx: FakeAudioContext) {
    super(ctx);
    this.threshold = new FParam(ctx, -24);
    this.knee = new FParam(ctx, 30);
    this.ratio = new FParam(ctx, 12);
    this.attack = new FParam(ctx, 0.003);
    this.release = new FParam(ctx, 0.25);
  }
  private curveDb(inDb: number, thr: number, knee: number, ratio: number): number {
    if (inDb <= thr - knee / 2) return inDb;
    if (inDb >= thr + knee / 2) return thr + (inDb - thr) / ratio;
    const over = inDb - thr + knee / 2;
    return inDb + ((1 / ratio - 1) * over * over) / (2 * Math.max(1e-6, knee));
  }
  protected compute(i: number): number {
    const x = this.inputSum(i);
    const sr = this.ctx.sampleRate;
    const thr = this.threshold.at(i);
    const knee = this.knee.at(i);
    const ratio = this.ratio.at(i);
    const level = Math.abs(x);
    const coeff = level > this.env
      ? Math.exp(-1 / (Math.max(1e-4, this.attack.at(i)) * sr))
      : Math.exp(-1 / (Math.max(1e-4, this.release.at(i)) * sr));
    this.env = level + coeff * (this.env - level);
    const envDb = 20 * Math.log10(Math.max(1e-9, this.env));
    const reductionDb = this.curveDb(envDb, thr, knee, ratio) - envDb;
    const fullRange = Math.pow(10, this.curveDb(0, thr, knee, ratio) / 20);
    const makeup = Math.pow(1 / fullRange, 0.6);
    return x * Math.pow(10, reductionDb / 20) * makeup;
  }
}

class FDestination extends FNode {
  protected compute(i: number): number {
    return this.inputSum(i);
  }
}

export class FakeAudioContext {
  static lastCreated: FakeAudioContext | null = null;
  readonly sampleRate: number;
  readonly destination: FDestination;
  readonly delays: FDelay[] = [];
  readonly buffers: FakeBuffer[] = [];
  state: 'running' | 'suspended' = 'running';
  private rendered = 0;

  constructor(options?: { sampleRate?: number }) {
    this.sampleRate = options?.sampleRate ?? FakeAudioContext.defaultSampleRate;
    this.destination = new FDestination(this);
    FakeAudioContext.lastCreated = this;
  }

  static defaultSampleRate = 16000;

  get currentTime(): number {
    return this.rendered / this.sampleRate;
  }
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.state = 'suspended';
    return Promise.resolve();
  }
  createGain(): FGain { return new FGain(this); }
  createStereoPanner(): FPanner { return new FPanner(this); }
  createBiquadFilter(): FBiquad { return new FBiquad(this); }
  createBufferSource(): FBufferSource { return new FBufferSource(this); }
  createOscillator(): FOscillator { return new FOscillator(this); }
  createDelay(max = 1): FDelay { return new FDelay(this, max); }
  createConvolver(): FConvolver { return new FConvolver(this); }
  createDynamicsCompressor(): FCompressor { return new FCompressor(this); }
  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer {
    const buffer = new FakeBuffer(channels, length, sampleRate);
    this.buffers.push(buffer);
    return buffer;
  }
  createPeriodicWave(_real: Float32Array, imag: Float32Array): FakePeriodicWave {
    // The browser normalises a periodic wave to a peak of 1 by default.
    let top = 0;
    for (let n = 0; n < 512; n += 1) {
      let s = 0;
      for (let k = 1; k < imag.length; k += 1) s += imag[k] * Math.sin((2 * Math.PI * k * n) / 512);
      top = Math.max(top, Math.abs(s));
    }
    return new FakePeriodicWave(imag, top > 0 ? 1 / top : 1);
  }

  /**
   * Render `seconds` more of the destination, returning the samples. `probe`
   * is read at every sample too (e.g. the engine's pre-limiter master gain).
   */
  render(seconds: number, probe?: FNode): { out: Float32Array; probe: Float32Array } {
    const n = Math.round(seconds * this.sampleRate);
    const out = new Float32Array(n);
    const probed = new Float32Array(n);
    for (let k = 0; k < n; k += 1) {
      const i = this.rendered;
      renderIndex = i;
      out[k] = this.destination.out(i);
      if (probe) probed[k] = probe.out(i);
      for (const delay of this.delays) delay.write(i);
      this.rendered += 1;
    }
    return { out, probe: probed };
  }
}

/** For debugging a render from a test. */
export function currentRenderIndex(): number {
  return renderIndex;
}

export function peak(samples: Float32Array): number {
  let p = 0;
  for (const s of samples) p = Math.max(p, Math.abs(s));
  return p;
}

export function rms(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / Math.max(1, samples.length));
}
