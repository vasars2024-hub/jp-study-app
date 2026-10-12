/**
 * Soundscape engine — every sound is synthesized here with Web Audio.
 *
 * No audio files: the ambience layers are shaped noise plus scheduled events
 * (drops, crackles, chirps), and the music styles are small generative bands that
 * write their own bars from chord progressions. That keeps the feature offline,
 * tiny, and free of anything to license.
 *
 * Timing: one interval wakes every TICK_MS and lets each voice schedule what falls
 * inside the next LOOKAHEAD seconds on the audio clock. The lookahead is generous
 * on purpose — a hidden or throttled window fires timers about once a second, and
 * the sound has to keep flowing through that.
 */

import {
  AMBIENT_PROGRESSIONS,
  DUCK_GAIN,
  HARMONIC_MINOR,
  JAZZ_PROGRESSIONS,
  LOFI_PROGRESSIONS,
  MAJOR_PENTATONIC,
  MIYAKO_BUSHI,
  NATURAL_MINOR,
  PIANO_PROGRESSIONS,
  bassRoot,
  chordTones,
  createMotif,
  keyNotes,
  midiToHz,
  nearestNote,
  realizeMotif,
  scaleNotes,
  voiceChord,
  walkingBassBar,
  type Chord,
  type Motif,
  type MusicStyleId,
  type SoundLayerId,
} from './soundscapeModel';

const TICK_MS = 200;
const LOOKAHEAD = 1.4;

type NoiseColor = 'white' | 'pink' | 'brown';
type Tick = (now: number, horizon: number) => void;

// Looked up on every call, not captured: a captured `Math.random` ignores a test's
// seeded spy, which left the offline render tests random despite their seed (snd5).
const rand = (): number => Math.random();
const between = (low: number, high: number): number => low + rand() * (high - low);
const pickOne = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];

interface Voice {
  out: GainNode;
  tick?: Tick;
  dispose(): void;
}

/** What the engine should be sounding. Gains are final linear gains, 0..1. */
export interface SoundscapeTarget {
  master: number;
  layers: Partial<Record<SoundLayerId, number>>;
  music: MusicStyleId;
  musicGain: number;
  ducked: boolean;
}

// ---------------------------------------------------------------------------
// Rig: the nodes one voice owns, so it can be torn down in one call.
// ---------------------------------------------------------------------------

class Rig {
  readonly out: GainNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly nodes: AudioNode[] = [];

  constructor(
    readonly ctx: AudioContext,
    private readonly noiseBuffer: (color: NoiseColor) => AudioBuffer,
  ) {
    this.out = ctx.createGain();
  }

  /** Remember a node so dispose() disconnects it. */
  keep<T extends AudioNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  /** Remember a source that keeps running, so dispose() stops it. */
  keepSource<T extends AudioScheduledSourceNode>(source: T): T {
    this.sources.push(source);
    return this.keep(source);
  }

  buffer(color: NoiseColor): AudioBuffer {
    return this.noiseBuffer(color);
  }

  /** A looping noise source, already started at a random point in its buffer. */
  noise(color: NoiseColor, rate = 1): AudioBufferSourceNode {
    const source = this.ctx.createBufferSource();
    const buffer = this.noiseBuffer(color);
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = rate;
    source.start(0, rand() * buffer.duration);
    this.sources.push(source);
    return this.keep(source);
  }

  osc(type: OscillatorType, frequency: number): OscillatorNode {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.start();
    this.sources.push(osc);
    return this.keep(osc);
  }

  gain(value: number): GainNode {
    const node = this.ctx.createGain();
    node.gain.value = value;
    return this.keep(node);
  }

  filter(type: BiquadFilterType, frequency: number, q = 0.707): BiquadFilterNode {
    const node = this.ctx.createBiquadFilter();
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    return this.keep(node);
  }

  pan(value: number): StereoPannerNode {
    const node = this.ctx.createStereoPanner();
    node.pan.value = value;
    return this.keep(node);
  }

  /** Connect nodes in series and return the last one. */
  chain<T extends AudioNode>(...nodes: [...AudioNode[], T]): T {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[nodes.length - 1] as T;
  }

  /**
   * Add a slow random drift of about +/- `depth` to a parameter. Noise played far
   * below audio rate is a smooth random curve, which is cheaper and less regular
   * than stacking oscillators.
   */
  drift(target: AudioParam, depth: number, changesPerSecond: number): void {
    const source = this.noise('white', changesPerSecond / this.ctx.sampleRate);
    const amount = this.gain(depth);
    source.connect(amount);
    amount.connect(target);
  }

  /** A short pitched tone: drops, chirps, bells, thumps. */
  blip(options: {
    t: number;
    freq: number;
    freqEnd?: number;
    dur: number;
    gain: number;
    type?: OscillatorType;
    pan?: number;
    attack?: number;
    dest?: AudioNode;
  }): void {
    const { t, freq, freqEnd, dur, gain, type = 'sine', pan = 0, attack = 0.004 } = options;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;
    osc.connect(env);
    env.connect(panner);
    panner.connect(options.dest ?? this.out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** A short filtered noise burst: crackles, hats, snares. */
  burst(options: {
    t: number;
    color: NoiseColor;
    dur: number;
    gain: number;
    filter: BiquadFilterType;
    freq: number;
    q?: number;
    pan?: number;
    attack?: number;
    dest?: AudioNode;
  }): void {
    const { t, color, dur, gain, filter, freq, q = 0.707, pan = 0, attack = 0.002 } = options;
    const buffer = this.noiseBuffer(color);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const shape = this.ctx.createBiquadFilter();
    shape.type = filter;
    shape.frequency.value = freq;
    shape.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;
    source.connect(shape);
    shape.connect(env);
    env.connect(panner);
    panner.connect(options.dest ?? this.out);
    source.start(t, rand() * Math.max(0.01, buffer.duration - dur - 0.1));
    source.stop(t + dur + 0.05);
  }

  dispose(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    }
    for (const node of this.nodes) node.disconnect();
    this.out.disconnect();
  }
}

// ---------------------------------------------------------------------------
// Ambience layers
// ---------------------------------------------------------------------------

type LayerBuilder = (rig: Rig, reverb: () => AudioNode) => Tick | void;

/** Run `emit` for every event time in (now, horizon], keeping its own clock. */
function scheduler(firstDelay: number, emit: (t: number) => number): Tick {
  let next = -1;
  return (now, horizon) => {
    if (next < 0) next = now + firstDelay;
    if (next < now) next = now;
    while (next < horizon) next += Math.max(0.005, emit(next));
  };
}

const LAYERS: Record<SoundLayerId, LayerBuilder> = {
  white: (rig) => {
    rig.chain(rig.noise('white'), rig.gain(0.16), rig.out);
  },

  pink: (rig) => {
    rig.chain(rig.noise('pink'), rig.gain(0.32), rig.out);
  },

  brown: (rig) => {
    rig.chain(rig.noise('brown'), rig.filter('lowpass', 900), rig.gain(0.55), rig.out);
  },

  rain: (rig) => {
    rig.chain(rig.noise('pink'), rig.filter('highpass', 650), rig.filter('lowpass', 7200), rig.gain(0.5), rig.out);
    const hiss = rig.gain(0.05);
    rig.chain(rig.noise('white'), rig.filter('bandpass', 5200, 0.6), hiss, rig.out);
    rig.drift(hiss.gain, 0.025, 0.5);
    // Individual drops landing close by, on top of the steady wash.
    return scheduler(0, (t) => {
      const freq = between(1300, 3800);
      rig.blip({ t, freq, freqEnd: freq * 0.72, dur: between(0.025, 0.06), gain: between(0.012, 0.04), pan: between(-1, 1) });
      return between(0.04, 0.24);
    });
  },

  thunder: (rig) => {
    return scheduler(between(3, 8), (t) => {
      const dur = between(3.5, 7);
      const peak = between(0.35, 0.8);
      const source = rig.ctx.createBufferSource();
      source.buffer = rig.buffer('brown');
      source.loop = true;
      const env = rig.ctx.createGain();
      const low = rig.ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.setValueAtTime(between(180, 320), t);
      low.frequency.exponentialRampToValueAtTime(60, t + dur);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(peak, t + 0.18);
      // A few rolling swells before the long tail.
      let at = t + 0.18;
      for (let i = 0; i < 3; i++) {
        at += between(0.3, 0.9);
        env.gain.linearRampToValueAtTime(peak * between(0.35, 0.85), at);
      }
      env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const panner = rig.ctx.createStereoPanner();
      panner.pan.value = between(-0.6, 0.6);
      source.connect(low);
      low.connect(env);
      env.connect(panner);
      panner.connect(rig.out);
      source.start(t, rand() * 3);
      source.stop(t + dur + 0.1);
      // A near strike opens with a sharp crack.
      if (rand() < 0.3) {
        rig.burst({ t, color: 'white', dur: 0.16, gain: 0.22, filter: 'highpass', freq: 1400, pan: panner.pan.value });
      }
      return dur + between(12, 36);
    });
  },

  wind: (rig) => {
    const body = rig.filter('bandpass', 420, 1.1);
    const bodyGain = rig.gain(0.85);
    rig.chain(rig.noise('pink'), body, bodyGain, rig.out);
    rig.drift(body.frequency, 240, 0.35);
    rig.drift(bodyGain.gain, 0.35, 0.22);
    // The thin whistle through a gap, rising and falling on its own.
    const whistle = rig.filter('bandpass', 1150, 6);
    const whistleGain = rig.gain(0.1);
    rig.chain(rig.noise('pink'), whistle, whistleGain, rig.out);
    rig.drift(whistle.frequency, 380, 0.4);
    rig.drift(whistleGain.gain, 0.09, 0.3);
  },

  ocean: (rig) => {
    const swellFilter = rig.filter('lowpass', 450);
    const swell = rig.gain(0.16);
    const mix = rig.gain(1);
    rig.chain(rig.noise('brown'), mix);
    rig.chain(rig.noise('white'), rig.gain(0.1), mix);
    rig.chain(mix, swellFilter, swell, rig.gain(0.95), rig.out);
    const foam = rig.gain(0);
    rig.chain(rig.noise('white'), rig.filter('highpass', 3200), foam, rig.out);
    return scheduler(0.2, (t) => {
      const rise = between(2.2, 3.6);
      const fall = between(3.6, 6);
      const peak = between(0.7, 1);
      swell.gain.setValueAtTime(0.16, t);
      swell.gain.linearRampToValueAtTime(peak, t + rise);
      swell.gain.linearRampToValueAtTime(0.16, t + rise + fall);
      swellFilter.frequency.setValueAtTime(450, t);
      swellFilter.frequency.exponentialRampToValueAtTime(between(1500, 2200), t + rise);
      swellFilter.frequency.exponentialRampToValueAtTime(450, t + rise + fall);
      // The wash of foam peaks just after the wave breaks.
      foam.gain.setValueAtTime(0, t + rise * 0.6);
      foam.gain.linearRampToValueAtTime(0.06 * peak, t + rise + 0.4);
      foam.gain.linearRampToValueAtTime(0, t + rise + fall * 0.8);
      return rise + fall + between(0.4, 1.8);
    });
  },

  stream: (rig) => {
    const source = rig.chain(rig.noise('white'), rig.filter('highpass', 420));
    const mix = rig.gain(0.78);
    const bands: [number, number, number, number, number][] = [
      // centre, Q, gain, frequency drift, drift speed
      [620, 1, 0.4, 180, 4],
      [1150, 1.6, 0.5, 480, 6],
      [2400, 2.6, 0.34, 900, 9],
    ];
    for (const [freq, q, level, wobble, speed] of bands) {
      const band = rig.filter('bandpass', freq, q);
      const gain = rig.gain(level);
      rig.chain(source, band, gain, mix);
      rig.drift(band.frequency, wobble, speed);
      rig.drift(gain.gain, level * 0.4, speed * 0.8);
    }
    mix.connect(rig.out);
  },

  fire: (rig) => {
    const rumble = rig.gain(0.6);
    rig.chain(rig.noise('brown'), rig.filter('lowpass', 240), rumble, rig.out);
    rig.drift(rumble.gain, 0.22, 2.2);
    const flutter = rig.gain(0.09);
    rig.chain(rig.noise('pink'), rig.filter('bandpass', 900, 0.4), flutter, rig.out);
    rig.drift(flutter.gain, 0.05, 3);
    return scheduler(0, (t) => {
      // Mostly tiny ticks; now and then a log pops.
      const loud = rand();
      rig.burst({
        t,
        color: 'white',
        dur: between(0.006, 0.03),
        gain: 0.03 + loud * loud * loud * 0.36,
        filter: 'bandpass',
        freq: between(1200, 5500),
        q: between(3, 8),
        pan: between(-0.6, 0.6),
      });
      return 0.02 - Math.log(1 - rand()) * 0.11;
    });
  },

  birds: (rig) => {
    rig.chain(rig.noise('pink'), rig.filter('highpass', 220), rig.filter('lowpass', 1500), rig.gain(0.06), rig.out);
    return scheduler(0.4, (t) => {
      const pan = between(-0.9, 0.9);
      const kind = rand();
      if (kind < 0.4) {
        // A run of rising tweets.
        const base = between(3100, 4400);
        let at = t;
        for (let i = 0, n = 2 + Math.floor(rand() * 4); i < n; i++) {
          rig.blip({ t: at, freq: base, freqEnd: base * between(1.18, 1.32), dur: 0.075, gain: 0.13, pan, attack: 0.008 });
          at += between(0.11, 0.16);
        }
      } else if (kind < 0.75) {
        // A two-note warble.
        const base = between(2300, 3200);
        let at = t;
        for (let i = 0, n = 4 + Math.floor(rand() * 6); i < n; i++) {
          rig.blip({ t: at, freq: i % 2 ? base * 1.18 : base, dur: 0.055, gain: 0.11, pan, attack: 0.006 });
          at += 0.07;
        }
      } else {
        // A slow falling whistle.
        const base = between(1800, 2600);
        rig.blip({ t, freq: base, freqEnd: base * 0.84, dur: between(0.26, 0.42), gain: 0.1, pan, attack: 0.03 });
      }
      return between(1.2, 5.5);
    });
  },

  crickets: (rig) => {
    rig.chain(rig.noise('brown'), rig.filter('lowpass', 320), rig.gain(0.18), rig.out);
    // One sustained tone per cricket, gated into chirps: no node churn.
    const crickets = [0, 1, 2].map(() => {
      const tone = rig.osc('sine', between(4100, 5200));
      const gate = rig.gain(0);
      rig.chain(tone, gate, rig.pan(between(-0.8, 0.8)), rig.out);
      return { gate, period: between(0.42, 0.7), level: between(0.04, 0.075), next: -1 };
    });
    return (now, horizon) => {
      for (const cricket of crickets) {
        if (cricket.next < 0) cricket.next = now + rand() * cricket.period;
        if (cricket.next < now) cricket.next = now;
        while (cricket.next < horizon) {
          let at = cricket.next;
          for (let pulse = 0; pulse < 4; pulse++) {
            cricket.gate.gain.setValueAtTime(0, at);
            cricket.gate.gain.linearRampToValueAtTime(cricket.level, at + 0.005);
            cricket.gate.gain.linearRampToValueAtTime(0, at + 0.018);
            at += 0.028;
          }
          // Crickets pause together now and then.
          cricket.next += cricket.period * (rand() < 0.06 ? between(3, 7) : between(0.95, 1.05));
        }
      }
    };
  },

  cafe: (rig) => {
    rig.chain(rig.noise('brown'), rig.filter('lowpass', 380), rig.gain(0.2), rig.out);
    const bed = rig.filter('lowpass', 2800);
    rig.chain(bed, rig.gain(0.95), rig.out);
    // Six overlapping "voices": band-limited noise whose level moves at syllable rate.
    for (let i = 0; i < 6; i++) {
      const voice = rig.gain(0);
      rig.chain(rig.noise('pink'), rig.filter('bandpass', between(280, 1300), 1.4), voice, rig.pan(between(-0.8, 0.8)), bed);
      rig.drift(voice.gain, 0.3, between(3.2, 6));
    }
    return scheduler(between(2, 6), (t) => {
      const pan = between(-0.7, 0.7);
      if (rand() < 0.7) {
        // A cup meeting a saucer.
        const freq = between(2300, 3200);
        rig.blip({ t, freq, dur: 0.13, gain: 0.05, pan });
        rig.blip({ t: t + 0.004, freq: freq * 1.48, dur: 0.09, gain: 0.025, pan });
      } else {
        // Something set down on a table.
        rig.blip({ t, freq: 190, freqEnd: 90, dur: 0.07, gain: 0.09, pan });
      }
      return between(4, 16);
    });
  },

  train: (rig) => {
    const rumble = rig.gain(0.62);
    rig.chain(rig.noise('brown'), rig.filter('lowpass', 165), rumble, rig.out);
    rig.drift(rumble.gain, 0.15, 0.8);
    rig.chain(rig.noise('pink'), rig.filter('highpass', 1900), rig.gain(0.035), rig.out);
    // Two axles at each end of the carriage crossing a rail joint.
    return scheduler(0.3, (t) => {
      for (const offset of [0, 0.17, 0.66, 0.83]) {
        const at = t + offset;
        rig.blip({ t: at, freq: 86, freqEnd: 54, dur: 0.075, gain: 0.24 });
        rig.burst({ t: at, color: 'brown', dur: 0.05, gain: 0.2, filter: 'lowpass', freq: 420 });
      }
      return between(1.36, 1.46);
    });
  },

  chimes: (rig, reverb) => {
    const wet = rig.gain(0.5);
    wet.connect(reverb());
    const notes = [72, 74, 76, 79, 81, 84, 86, 88];
    return scheduler(between(0.5, 2), (t) => {
      let at = t;
      for (let i = 0, n = 1 + Math.floor(rand() * 3); i < n; i++) {
        const freq = midiToHz(pickOne(notes));
        const pan = between(-0.8, 0.8);
        for (const dest of [rig.out, wet]) {
          // An inharmonic bell: a clear fundamental and two quick metallic partials.
          rig.blip({ t: at, freq, dur: between(2.2, 3.6), gain: 0.12, pan, dest });
          rig.blip({ t: at, freq: freq * 2.76, dur: 1.1, gain: 0.04, pan, dest });
          rig.blip({ t: at, freq: freq * 5.4, dur: 0.45, gain: 0.015, pan, dest });
        }
        at += between(0.08, 0.34);
      }
      return between(1.6, 6.5);
    });
  },

  // ---- snd5: eight more, all from the same primitives (noise beds, blips, bursts) ----

  umbrella: (rig) => {
    // The rain beyond the canopy, muffled by it.
    rig.chain(rig.noise('pink'), rig.filter('highpass', 280), rig.filter('lowpass', 2200), rig.gain(0.32), rig.out);
    // Drops drumming on taut fabric: dense, bright, resonant taps, and now and
    // then a fat one that thuds, or water running off the edge in a heavier drip.
    return scheduler(0, (t) => {
      const fat = rand() < 0.12;
      rig.burst({
        t,
        color: 'white',
        dur: between(0.008, 0.022),
        gain: between(0.05, 0.13) * (fat ? 1.7 : 1),
        filter: 'bandpass',
        freq: between(2000, 3400),
        q: between(4, 9),
        pan: between(-0.5, 0.5),
      });
      if (fat) rig.blip({ t, freq: between(160, 230), freqEnd: 110, dur: 0.06, gain: 0.1, pan: between(-0.4, 0.4) });
      if (rand() < 0.02) {
        rig.blip({ t: t + 0.05, freq: between(700, 1000), freqEnd: 480, dur: 0.05, gain: 0.07, pan: between(-0.9, 0.9) });
      }
      return between(0.025, 0.07);
    });
  },

  cicadas: (rig) => {
    // A field of them far off: in midsummer the chorus never quite stops, so the
    // layer is never silent between the near cicadas' phrases.
    const chorus = rig.gain(0.035);
    rig.chain(rig.noise('white'), rig.filter('bandpass', 4800, 1.5), chorus, rig.out);
    rig.drift(chorus.gain, 0.015, 0.2);
    // Aburazemi: a sizzling band of noise, pulsing fast, that swells and fades
    // in long phrases. Two of them, out of step.
    const sizzlers = [0, 1].map(() => {
      const band = rig.filter('bandpass', between(4200, 5600), 2.5);
      const pulse = rig.gain(1);
      const depth = rig.gain(0.55);
      rig.osc('sine', between(45, 70)).connect(depth);
      depth.connect(pulse.gain);
      const swell = rig.gain(0);
      rig.chain(rig.noise('white'), band, pulse, swell, rig.pan(between(-0.7, 0.7)), rig.out);
      return { swell, level: between(0.05, 0.08), next: -1 };
    });
    // Minminzemi: a pitched "meen" call repeated in runs, then a rest.
    const caller = scheduler(between(2, 6), (t) => {
      const base = between(1600, 2000);
      const pan = between(-0.6, 0.6);
      let at = t;
      for (let i = 0, n = 4 + Math.floor(rand() * 5); i < n; i++) {
        rig.blip({ t: at, freq: base, freqEnd: base * 1.06, dur: 0.32, gain: 0.045, pan, attack: 0.06 });
        at += 0.42;
      }
      return at - t + between(6, 14);
    });
    return (now, horizon) => {
      for (const s of sizzlers) {
        if (s.next < 0) s.next = now + rand() * 4;
        if (s.next < now) s.next = now;
        while (s.next < horizon) {
          const t = s.next;
          const rise = between(1.5, 3);
          const hold = between(4, 10);
          const fall = between(2, 4);
          s.swell.gain.setValueAtTime(0, t);
          s.swell.gain.linearRampToValueAtTime(s.level, t + rise);
          s.swell.gain.setValueAtTime(s.level, t + rise + hold);
          s.swell.gain.linearRampToValueAtTime(0, t + rise + hold + fall);
          s.next = t + rise + hold + fall + between(1, 6);
        }
      }
      caller(now, horizon);
    };
  },

  carriage: (rig, reverb) => {
    // Inside the carriage: the floor's rumble and the air conditioning.
    const rumble = rig.gain(0.55);
    rig.chain(rig.noise('brown'), rig.filter('lowpass', 140), rumble, rig.out);
    rig.drift(rumble.gain, 0.12, 0.6);
    rig.chain(rig.noise('pink'), rig.filter('bandpass', 1800, 0.5), rig.gain(0.025), rig.out);
    // The traction motor's whine: rising as the train pulls away, quiet at speed,
    // falling as it brakes for the next station.
    const motor = rig.osc('triangle', 180);
    const motorGain = rig.gain(0);
    rig.chain(motor, rig.filter('lowpass', 1400), motorGain, rig.out);
    const wet = rig.gain(0.3);
    wet.connect(reverb());
    // Rail joints, muffled by the floor.
    const joints = scheduler(0.5, (t) => {
      for (const offset of [0, 0.16]) {
        rig.blip({ t: t + offset, freq: 70, freqEnd: 48, dur: 0.08, gain: 0.12 });
        rig.burst({ t: t + offset, color: 'brown', dur: 0.05, gain: 0.08, filter: 'lowpass', freq: 260 });
      }
      return between(1.8, 2.6);
    });
    const run = scheduler(0.2, (t) => {
      const accel = between(14, 20);
      const cruise = between(30, 60);
      const brake = between(12, 16);
      const arrive = t + accel + cruise + brake;
      const top = between(820, 980);
      motor.frequency.setValueAtTime(180, t);
      motor.frequency.linearRampToValueAtTime(top, t + accel);
      motor.frequency.setValueAtTime(top, t + accel + cruise);
      motor.frequency.linearRampToValueAtTime(160, arrive);
      motorGain.gain.setValueAtTime(0, t);
      motorGain.gain.linearRampToValueAtTime(0.035, t + 2);
      motorGain.gain.setValueAtTime(0.035, t + accel);
      motorGain.gain.linearRampToValueAtTime(0.012, t + accel + 4);
      motorGain.gain.setValueAtTime(0.012, t + accel + cruise);
      motorGain.gain.linearRampToValueAtTime(0.03, t + accel + cruise + 2);
      motorGain.gain.linearRampToValueAtTime(0, arrive);
      // At the platform: a plain falling two-tone, then the doors open and close.
      [76, 72].forEach((note, i) => {
        for (const dest of [rig.out, wet]) {
          rig.blip({ t: arrive + 1.5 + i * 0.7, freq: midiToHz(note), dur: 1.6, gain: 0.06, dest });
        }
      });
      for (const at of [arrive + 4, arrive + 14]) {
        rig.burst({ t: at, color: 'pink', dur: 0.9, gain: 0.05, filter: 'bandpass', freq: 800, q: 0.8, attack: 0.3 });
      }
      return accel + cruise + brake + between(18, 26);
    });
    return (now, horizon) => {
      joints(now, horizon);
      run(now, horizon);
    };
  },

  konbini: (rig, reverb) => {
    // Refrigerated cases and the air conditioning: a low hum and its harmonic,
    // over a soft room tone; the fluorescent tubes add a faint high buzz.
    rig.chain(rig.osc('sine', 100), rig.gain(0.035), rig.out);
    rig.chain(rig.osc('sine', 200), rig.gain(0.012), rig.out);
    rig.chain(rig.noise('pink'), rig.filter('lowpass', 900), rig.gain(0.12), rig.out);
    rig.chain(rig.noise('white'), rig.filter('bandpass', 7800, 8), rig.gain(0.02), rig.out);
    const wet = rig.gain(0.35);
    wet.connect(reverb());
    // The entry chime: a plain rising arpeggio (deliberately no chain's jingle),
    // and the sliding doors.
    const arpeggios = [[72, 76, 79], [74, 77, 81], [71, 74, 79]];
    const door = scheduler(between(4, 12), (t) => {
      pickOne(arpeggios).forEach((note, i) => {
        for (const dest of [rig.out, wet]) {
          rig.blip({ t: t + i * 0.28, freq: midiToHz(note), dur: 1.1, gain: 0.07, dest });
          rig.blip({ t: t + i * 0.28, freq: midiToHz(note) * 2, dur: 0.5, gain: 0.015, dest });
        }
      });
      rig.burst({ t: t + 0.1, color: 'pink', dur: 1.2, gain: 0.05, filter: 'bandpass', freq: 600, q: 0.8, attack: 0.4 });
      return between(25, 70);
    });
    // The register: a short beep or two as items are scanned.
    const register = scheduler(between(2, 8), (t) => {
      let at = t;
      for (let i = 0, n = 1 + Math.floor(rand() * 3); i < n; i++) {
        rig.blip({ t: at, freq: 2350, dur: 0.09, gain: 0.025, type: 'square', attack: 0.002, pan: 0.3 });
        at += between(0.6, 1.4);
      }
      return between(8, 24);
    });
    return (now, horizon) => {
      door(now, horizon);
      register(now, horizon);
    };
  },

  cityNight: (rig) => {
    // The far-off roar a city keeps all night.
    const roar = rig.gain(0.4);
    rig.chain(rig.noise('brown'), rig.filter('lowpass', 320), roar, rig.out);
    rig.drift(roar.gain, 0.12, 0.15);
    rig.chain(rig.noise('pink'), rig.filter('bandpass', 700, 0.6), rig.gain(0.05), rig.out);
    // A car going by on a wet street: a swell of filtered noise, its pitch
    // falling as it passes from one side to the other.
    const cars = scheduler(between(1, 4), (t) => {
      const dur = between(3, 6);
      const peak = between(0.08, 0.2);
      const source = rig.ctx.createBufferSource();
      source.buffer = rig.buffer('pink');
      source.loop = true;
      const band = rig.ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = 0.9;
      band.frequency.setValueAtTime(between(900, 1300), t);
      band.frequency.exponentialRampToValueAtTime(between(380, 520), t + dur);
      const env = rig.ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(peak, t + dur * 0.5);
      env.gain.linearRampToValueAtTime(0, t + dur);
      const panner = rig.ctx.createStereoPanner();
      const from = rand() < 0.5 ? -0.8 : 0.8;
      panner.pan.setValueAtTime(from, t);
      panner.pan.linearRampToValueAtTime(-from, t + dur);
      source.connect(band);
      band.connect(env);
      env.connect(panner);
      panner.connect(rig.out);
      source.start(t, rand() * 3);
      source.stop(t + dur + 0.1);
      return between(3, 11);
    });
    // Sometimes a horn, blocks away.
    const horns = scheduler(between(10, 30), (t) => {
      if (rand() < 0.5) {
        const freq = between(330, 420);
        const pan = between(-0.7, 0.7);
        const dur = between(0.3, 0.6);
        rig.blip({ t, freq, dur, gain: 0.022, type: 'sawtooth', attack: 0.03, pan });
        rig.blip({ t, freq: freq * 1.26, dur, gain: 0.018, type: 'sawtooth', attack: 0.03, pan });
      }
      return between(20, 60);
    });
    return (now, horizon) => {
      cars(now, horizon);
      horns(now, horizon);
    };
  },

  templeBell: (rig, reverb) => {
    // Morning air around the temple: a little low wind.
    rig.chain(rig.noise('pink'), rig.filter('lowpass', 380), rig.gain(0.07), rig.out);
    const wet = rig.gain(0.6);
    wet.connect(reverb());
    // A large bronze bell (bonshou): a long hum an octave below the strike tone
    // — two hums a few cents apart, which beat into the bell's slow waver — and
    // higher inharmonic partials that die first. [ratio, level, seconds]
    const f0 = between(96, 128);
    const partials: [number, number, number][] = [
      [0.5, 0.06, 26],
      [0.503, 0.05, 24],
      [1, 0.11, 18],
      [1.19, 0.04, 9],
      [2, 0.05, 7],
      [2.74, 0.035, 5],
      [3.84, 0.02, 3.2],
      [5.4, 0.012, 2],
    ];
    return scheduler(between(1, 3), (t) => {
      const strength = between(0.75, 1);
      // The log beam (shumoku) meeting the bronze.
      rig.burst({ t, color: 'brown', dur: 0.09, gain: 0.18 * strength, filter: 'lowpass', freq: 500 });
      for (const [ratio, level, seconds] of partials) {
        rig.blip({ t, freq: f0 * ratio, dur: seconds, gain: level * strength, attack: 0.006 });
        rig.blip({ t, freq: f0 * ratio, dur: seconds, gain: level * strength * 0.6, attack: 0.006, dest: wet });
      }
      return between(22, 40);
    });
  },

  furin: (rig, reverb) => {
    // A breeze just strong enough to move the strip of paper.
    rig.chain(rig.noise('pink'), rig.filter('bandpass', 500, 0.7), rig.gain(0.04), rig.out);
    const wet = rig.gain(0.35);
    wet.connect(reverb());
    // One glass bell has one pitch; a gust sets the clapper going for a few
    // strikes, each softer than the last.
    const f0 = between(2300, 3000);
    return scheduler(between(0.8, 3), (t) => {
      let at = t;
      for (let i = 0, n = 1 + Math.floor(rand() * 4); i < n; i++) {
        const level = 0.06 * Math.pow(0.75, i) * between(0.7, 1);
        const freq = f0 * between(0.997, 1.003);
        const pan = between(-0.3, 0.3);
        for (const dest of [rig.out, wet]) {
          rig.blip({ t: at, freq, dur: between(1.4, 2.2), gain: level, pan, dest, attack: 0.002 });
          rig.blip({ t: at, freq: freq * 2.32, dur: 0.7, gain: level * 0.35, pan, dest, attack: 0.002 });
          rig.blip({ t: at, freq: freq * 4.25, dur: 0.25, gain: level * 0.15, pan, dest, attack: 0.002 });
        }
        at += between(0.12, 0.45);
      }
      return between(2.5, 9);
    });
  },

  shishiOdoshi: (rig, reverb) => {
    // The trickle filling the bamboo.
    const trickle = rig.filter('bandpass', 1500, 1.8);
    const trickleGain = rig.gain(0.12);
    rig.chain(rig.noise('white'), trickle, trickleGain, rig.out);
    rig.drift(trickle.frequency, 500, 5);
    rig.drift(trickleGain.gain, 0.05, 4);
    const wet = rig.gain(0.5);
    wet.connect(reverb());
    return scheduler(between(3, 8), (t) => {
      // The tube tips and pours out…
      rig.burst({ t, color: 'white', dur: 0.45, gain: 0.05, filter: 'bandpass', freq: 900, q: 1.2, attack: 0.08 });
      // …and drops back onto its stone: a hollow knock, then a softer bounce.
      const knock = t + 0.5;
      for (const dest of [rig.out, wet]) {
        rig.blip({ t: knock, freq: 440, freqEnd: 300, dur: 0.22, gain: 0.22, dest, attack: 0.002 });
        rig.blip({ t: knock, freq: 1180, freqEnd: 900, dur: 0.08, gain: 0.06, dest, attack: 0.001 });
      }
      rig.burst({ t: knock, color: 'white', dur: 0.03, gain: 0.12, filter: 'bandpass', freq: 2200, q: 2 });
      rig.blip({ t: knock + 0.16, freq: 420, freqEnd: 310, dur: 0.12, gain: 0.07, attack: 0.002 });
      return between(12, 24);
    });
  },
};

// ---------------------------------------------------------------------------
// Generative music
// ---------------------------------------------------------------------------

/** The instruments the bands share, all writing into `dry` and `wet`. */
class Instruments {
  private readonly pianoWave: PeriodicWave;

  constructor(
    private readonly rig: Rig,
    private readonly dry: AudioNode,
    private readonly wet: AudioNode,
    /** Tape wobble, in cents, applied to pitched instruments when set. */
    private readonly wow: AudioNode | null = null,
  ) {
    // A few falling harmonics: a struck string rather than a pure tone.
    const imag = new Float32Array([0, 1, 0.52, 0.28, 0.15, 0.09, 0.05, 0.03]);
    this.pianoWave = rig.ctx.createPeriodicWave(new Float32Array(imag.length), imag);
  }

  private get ctx(): AudioContext {
    return this.rig.ctx;
  }

  private tone(
    t: number,
    dur: number,
    peak: number,
    decay: number,
    release: number,
    wetAmount: number,
    build: (env: GainNode, stopAt: number) => void,
  ): void {
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.007);
    env.gain.setTargetAtTime(0, t + 0.007, decay);
    env.gain.setTargetAtTime(0, t + dur, release);
    const stopAt = t + dur + release * 6;
    build(env, stopAt);
    env.connect(this.dry);
    if (wetAmount > 0) {
      const send = this.ctx.createGain();
      send.gain.value = wetAmount;
      env.connect(send);
      send.connect(this.wet);
    }
  }

  private oscAt(type: OscillatorType | PeriodicWave, freq: number, t: number, stopAt: number, detune = 0): OscillatorNode {
    const osc = this.ctx.createOscillator();
    if (type instanceof PeriodicWave) osc.setPeriodicWave(type);
    else osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const wow = this.wow;
    if (wow) {
      wow.connect(osc.detune);
      // A finished oscillator stays alive while a live node feeds its parameter.
      // After the rig is disposed `wow` is already disconnected from everything, and
      // disconnect(param) throws InvalidAccessError for a connection that is gone.
      osc.onended = () => {
        try {
          wow.disconnect(osc.detune);
        } catch {
          /* rig already disposed */
        }
      };
    }
    osc.start(t);
    osc.stop(stopAt);
    return osc;
  }

  /** A struck piano string: bright at the hammer, mellowing as it rings. */
  piano(t: number, midi: number, dur: number, vel: number, wet = 0.25): void {
    const freq = midiToHz(midi);
    const decay = Math.min(2.6, Math.max(0.5, 2.4 - (midi - 36) * 0.03));
    this.tone(t, dur, vel * 0.2, decay, 0.16, wet, (env, stopAt) => {
      const tone = this.ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.setValueAtTime(Math.min(11000, freq * (3 + vel * 9)), t);
      tone.frequency.setTargetAtTime(freq * 1.6 + 220, t, 0.3);
      this.oscAt(this.pianoWave, freq, t, stopAt).connect(tone);
      // A second string, a hair sharp, is what makes one note shimmer.
      const second = this.ctx.createGain();
      second.gain.value = 0.5;
      this.oscAt(this.pianoWave, freq, t, stopAt, 4).connect(second);
      second.connect(tone);
      tone.connect(env);
    });
  }

  /** A soft electric piano for chords. */
  keys(t: number, midi: number, dur: number, vel: number, wet = 0.2): void {
    const freq = midiToHz(midi);
    this.tone(t, dur, vel * 0.16, 0.9, 0.14, wet, (env, stopAt) => {
      const tone = this.ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 1500 + vel * 1400;
      this.oscAt('sine', freq, t, stopAt).connect(tone);
      const bell = this.ctx.createGain();
      bell.gain.setValueAtTime(0.22, t);
      bell.gain.setTargetAtTime(0, t, 0.25);
      this.oscAt('sine', freq * 2, t, stopAt).connect(bell);
      bell.connect(tone);
      tone.connect(env);
    });
  }

  /** A rounded lead for lofi melodies. */
  lead(t: number, midi: number, dur: number, vel: number): void {
    this.tone(t, dur, vel * 0.12, 0.7, 0.2, 0.4, (env, stopAt) => {
      const tone = this.ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 1500;
      this.oscAt('triangle', midiToHz(midi), t, stopAt).connect(tone);
      tone.connect(env);
    });
  }

  bass(t: number, midi: number, dur: number, vel: number, plucked: boolean): void {
    this.tone(t, dur, vel * 0.34, plucked ? 0.42 : 0.7, 0.08, 0, (env, stopAt) => {
      const tone = this.ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = plucked ? 520 : 300;
      this.oscAt(plucked ? 'triangle' : 'sine', midiToHz(midi), t, stopAt).connect(tone);
      tone.connect(env);
    });
  }

  /** A slow pad: two detuned saws behind a dark filter. */
  pad(t: number, midi: number, dur: number, vel: number): void {
    const freq = midiToHz(midi);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vel * 0.05, t + 3);
    env.gain.setValueAtTime(vel * 0.05, t + dur);
    env.gain.linearRampToValueAtTime(0, t + dur + 5);
    const tone = this.ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 620;
    const stopAt = t + dur + 5.2;
    this.oscAt('sawtooth', freq, t, stopAt, -7).connect(tone);
    this.oscAt('sawtooth', freq, t, stopAt, 7).connect(tone);
    tone.connect(env);
    env.connect(this.dry);
    const send = this.ctx.createGain();
    send.gain.value = 0.5;
    env.connect(send);
    send.connect(this.wet);
  }

  /**
   * snd5: a plucked koto string — a bright attack from a detuned saw that dies
   * in a few tens of milliseconds, over a triangle body behind a closing
   * filter. `bend` presses the string behind the bridge (oshide), raising the
   * note a little after it sounds.
   */
  koto(t: number, midi: number, dur: number, vel: number, wet = 0.35, bend = false): void {
    const freq = midiToHz(midi);
    this.tone(t, dur, vel * 0.16, 0.55, 0.25, wet, (env, stopAt) => {
      const tone = this.ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.setValueAtTime(Math.min(9000, freq * 8), t);
      tone.frequency.setTargetAtTime(freq * 2.5 + 300, t, 0.12);
      const body = this.oscAt('triangle', freq, t, stopAt);
      if (bend) {
        body.frequency.setValueAtTime(freq, t + 0.12);
        body.frequency.linearRampToValueAtTime(freq * 1.06, t + 0.32);
      }
      body.connect(tone);
      const pluck = this.ctx.createGain();
      pluck.gain.setValueAtTime(0.5, t);
      pluck.gain.setTargetAtTime(0, t, 0.05);
      this.oscAt('sawtooth', freq, t, stopAt, 3).connect(pluck);
      pluck.connect(tone);
      tone.connect(env);
    });
  }

  bell(t: number, midi: number, vel: number): void {
    const freq = midiToHz(midi);
    this.rig.blip({ t, freq, dur: 3.2, gain: vel * 0.05, pan: between(-0.6, 0.6), dest: this.dry });
    this.rig.blip({ t, freq, dur: 3.2, gain: vel * 0.04, dest: this.wet });
    this.rig.blip({ t, freq: freq * 2.01, dur: 1.2, gain: vel * 0.012, dest: this.dry });
  }

  kick(t: number, vel: number): void {
    this.rig.blip({ t, freq: 128, freqEnd: 46, dur: 0.26, gain: vel * 0.55, attack: 0.003, dest: this.dry });
  }

  snare(t: number, vel: number): void {
    this.rig.burst({ t, color: 'white', dur: 0.17, gain: vel * 0.2, filter: 'bandpass', freq: 1900, q: 0.8, dest: this.dry });
    this.rig.blip({ t, freq: 190, freqEnd: 150, dur: 0.09, gain: vel * 0.1, dest: this.dry });
  }

  hat(t: number, vel: number): void {
    this.rig.burst({ t, color: 'white', dur: 0.04, gain: vel * 0.07, filter: 'highpass', freq: 7500, dest: this.dry });
  }

  ride(t: number, vel: number): void {
    this.rig.burst({ t, color: 'white', dur: 0.32, gain: vel * 0.045, filter: 'bandpass', freq: 5600, q: 0.7, pan: 0.25, dest: this.dry });
  }

  brush(t: number, dur: number, vel: number): void {
    this.rig.burst({ t, color: 'pink', dur, gain: vel * 0.05, filter: 'bandpass', freq: 2800, q: 0.6, attack: dur * 0.35, pan: -0.2, dest: this.dry });
  }
}

interface BandContext {
  rig: Rig;
  play: Instruments;
  /** Seconds per beat. */
  beat: number;
}

/** Writes one bar starting at `t`; returns nothing, keeps its own state. */
type BarWriter = (t: number, bar: number, ctx: BandContext) => void;

interface BandSetup {
  bpm: number;
  beatsPerBar: number;
  /** Lowpass on the whole band, Hz. */
  tone: number;
  /** How much tape wobble, in cents (0 for none). */
  wow: number;
  /** Vinyl crackle level (0 for none). */
  crackle: number;
  /** Echo on the reverb send. */
  echo: boolean;
  write: BarWriter;
}

/** Position of the n-th eighth note in beats, with the off-beats pushed late. */
function swung(eighth: number, swing: number): number {
  return Math.floor(eighth / 2) + (eighth % 2 ? 0.5 + swing * 0.167 : 0);
}

const humanize = (): number => between(-0.006, 0.006);

function lofiBand(slow: boolean): BandSetup {
  const tonic = pickOne([0, 2, 3, 5, 7, 8, 10]);
  let progression = pickOne(LOFI_PROGRESSIONS);
  let melodyOn = false;
  let lastNote = 72 + tonic;
  const swing = slow ? 0.5 : 0.7;
  return {
    bpm: slow ? 62 : 76,
    beatsPerBar: 4,
    tone: slow ? 2300 : 3600,
    wow: slow ? 10 : 6,
    crackle: slow ? 0.2 : 0.12,
    echo: true,
    write: (t, bar, { play, beat }) => {
      if (bar > 0 && bar % 8 === 0 && rand() < 0.5) progression = pickOne(LOFI_PROGRESSIONS);
      if (bar % 4 === 0) melodyOn = bar >= 2 && rand() < 0.62;
      const chord = progression[bar % progression.length];
      const at = (eighth: number): number => t + swung(eighth, swing) * beat + humanize();

      // Chords: a gentle strum on one, often answered later in the bar.
      const voicing = voiceChord(chord, tonic, 55);
      voicing.forEach((note, i) => play.keys(t + i * 0.02, note, beat * 2.4, 0.5));
      if (rand() < 0.55) voicing.forEach((note, i) => play.keys(at(5) + i * 0.015, note, beat * 1.2, 0.34));

      const root = bassRoot(chord, tonic, 36);
      play.bass(t, root, beat * 1.4, 0.9, false);
      if (rand() < 0.6) play.bass(at(5), root, beat, 0.7, false);
      if (rand() < 0.3) play.bass(at(7), root + 7, beat * 0.5, 0.6, false);

      // The first two bars leave the drums out, like a record fading in.
      if (bar >= 2) {
        play.kick(t, 1);
        play.kick(rand() < 0.8 ? at(5) : at(4), 0.85);
        if (rand() < 0.15) play.kick(at(3), 0.5);
        play.snare(at(2), 0.8);
        play.snare(at(6), 0.9);
        for (let eighth = 0; eighth < 8; eighth++) {
          if (rand() < 0.08) continue;
          play.hat(at(eighth), eighth % 2 ? 0.45 : 0.8);
        }
      }

      if (melodyOn) {
        const scale = keyNotes(tonic, MAJOR_PENTATONIC, 67, 86);
        for (let eighth = 0; eighth < 8; eighth++) {
          if (rand() > 0.3) continue;
          const index = scale.indexOf(nearestNote(lastNote, scale)) + Math.floor(between(-2, 3));
          lastNote = scale[Math.min(scale.length - 1, Math.max(0, index))];
          play.lead(at(eighth), lastNote, beat * between(0.6, 1.3), 0.7);
        }
      }
    },
  };
}

function jazzCafeBand(): BandSetup {
  let tonic = pickOne([0, 5, 10, 3, 7]);
  let progression = pickOne(JAZZ_PROGRESSIONS);
  let soloOn = false;
  let lastNote = 74;
  const comps: number[][][] = [
    [[1, 0.3], [4, 0.3]],
    [[0, 0.3], [3, 0.5]],
    [[3, 0.4], [7, 0.3]],
    [[0, 1.4]],
    [[5, 0.4]],
  ];
  return {
    bpm: 118,
    beatsPerBar: 4,
    tone: 6500,
    wow: 0,
    crackle: 0,
    echo: false,
    write: (t, bar, { play, beat }) => {
      if (bar > 0 && bar % progression.length === 0) {
        if (rand() < 0.4) progression = pickOne(JAZZ_PROGRESSIONS);
        if (rand() < 0.3) tonic = (tonic + 5) % 12;
      }
      if (bar % 2 === 0) soloOn = bar >= 2 && rand() < 0.65;
      const chord = progression[bar % progression.length];
      const next = progression[(bar + 1) % progression.length];
      const at = (eighth: number): number => t + swung(eighth, 1) * beat + humanize();

      walkingBassBar(chord, next, tonic, 33, rand).forEach((note, quarter) => {
        play.bass(t + quarter * beat + humanize(), note, beat * 0.92, quarter === 0 ? 0.95 : 0.8, true);
      });

      // Ding, ding-a-ding on the ride, with the hi-hat closing on two and four.
      for (const eighth of [0, 2, 3, 4, 6, 7]) play.ride(at(eighth), eighth % 4 === 2 ? 1 : 0.65);
      play.hat(at(2), 0.7);
      play.hat(at(6), 0.7);

      // Comping: rootless stabs placed between the beats.
      const rootPc = (tonic + chord.root) % 12;
      const voicing = voiceChord(chord, tonic, 53).filter((note) => note % 12 !== rootPc);
      for (const [eighth, length] of pickOne(comps)) {
        voicing.forEach((note) => play.piano(at(eighth), note, beat * length, between(0.28, 0.42), 0.15));
      }

      if (soloOn) {
        const scale = scaleNotes(chord, tonic, 65, 88);
        const tones = chordTones(chord, tonic, 65, 88);
        for (let eighth = 0; eighth < 8; eighth++) {
          if (rand() > 0.55) continue;
          const index = scale.indexOf(nearestNote(lastNote, scale)) + Math.floor(between(-2, 3));
          const walked = scale[Math.min(scale.length - 1, Math.max(0, index))];
          // Land on a chord tone whenever the note falls on a beat.
          lastNote = eighth % 2 === 0 ? nearestNote(walked, tones) : walked;
          play.piano(at(eighth), lastNote, beat * 0.46, between(0.34, 0.55), 0.18);
        }
      }
    },
  };
}

function jazzBalladBand(): BandSetup {
  const tonic = pickOne([0, 5, 10, 3, 8]);
  let progression = pickOne(JAZZ_PROGRESSIONS);
  let motif: Motif = createMotif(rand);
  let anchor = 74;
  return {
    bpm: 62,
    beatsPerBar: 4,
    tone: 5200,
    wow: 0,
    crackle: 0,
    echo: false,
    write: (t, bar, { play, beat }) => {
      if (bar > 0 && bar % progression.length === 0 && rand() < 0.4) progression = pickOne(JAZZ_PROGRESSIONS);
      if (bar % 4 === 0) motif = createMotif(rand);
      const chord = progression[bar % progression.length];
      const next = progression[(bar + 1) % progression.length];

      const root = bassRoot(chord, tonic, 33);
      play.bass(t, root, beat * 1.8, 0.9, true);
      play.bass(t + 2 * beat, nearestNote(root + 7, chordTones(chord, tonic, root, root + 12)), beat * 1.6, 0.75, true);
      if (rand() < 0.4) play.bass(t + 3.667 * beat, bassRoot(next, tonic, 33) - 1, beat * 0.3, 0.6, true);

      // Brushes stirring the snare: one sweep per beat, leaning on two and four.
      for (let quarter = 0; quarter < 4; quarter++) play.brush(t + quarter * beat, beat * 0.9, quarter % 2 ? 1 : 0.6);

      voiceChord(chord, tonic, 50).forEach((note, i) => play.piano(t + i * 0.055, note, beat * 3.6, 0.36, 0.3));

      if (bar >= 1 && rand() < 0.72) {
        const notes = realizeMotif(motif, scaleNotes(chord, tonic, 67, 86), chordTones(chord, tonic, 67, 86), anchor);
        notes.forEach((note, i) => {
          const start = motif.beats[i];
          const end = i + 1 < notes.length ? motif.beats[i + 1] : 4;
          play.piano(t + start * beat + humanize(), note, (end - start) * beat, between(0.4, 0.55), 0.3);
        });
        if (notes.length) anchor = notes[notes.length - 1];
      }
    },
  };
}

function emotionalPianoBand(): BandSetup {
  const tonic = pickOne([9, 2, 4, 0, 7, 11]);
  let progression = pickOne(PIANO_PROGRESSIONS);
  let motif: Motif = createMotif(rand);
  let anchor = 72 + ((tonic + 7) % 12);
  return {
    bpm: 66,
    beatsPerBar: 4,
    tone: 9000,
    wow: 0,
    crackle: 0,
    echo: false,
    write: (t, bar, { play, beat }) => {
      if (bar > 0 && bar % 8 === 0 && rand() < 0.6) progression = pickOne(PIANO_PROGRESSIONS);
      if (bar % 4 === 0) motif = createMotif(rand);
      const chord = progression[bar % progression.length];
      const barInPhrase = bar % 4;
      // Sixteen bars: eight quiet, eight fuller, and round again.
      const full = bar % 16 >= 8;
      const barLength = beat * 4;

      // Left hand: a broken chord rolling up and back, held under the pedal.
      const root = bassRoot(chord, tonic, 36);
      const third = chord.quality === 'maj' ? 4 : 3;
      const pattern = [0, 7, 12, 12 + third, 19, 12 + third, 12, 7];
      pattern.forEach((interval, eighth) => {
        const start = eighth * beat * 0.5;
        const vel = (eighth === 0 ? 0.42 : 0.28) + (full ? 0.06 : 0);
        play.piano(t + start + humanize(), root + interval, barLength - start, vel, 0.45);
      });
      if (full) play.piano(t, root - 12, barLength, 0.4, 0.45);

      // Right hand enters after a two-bar introduction.
      if (bar < 2) return;
      // A major V chord in a minor key raises the seventh, so the melody must too.
      const dominant = chord.quality === 'maj' && chord.root === 7;
      const scale = keyNotes(tonic, dominant ? HARMONIC_MINOR : NATURAL_MINOR, 67, 91);
      const tones = chordTones(chord, tonic, 67, 91);
      let notes = realizeMotif(motif, scale, tones, anchor);
      let beats = motif.beats;
      // The phrase ends by breathing: fewer notes, the last one held.
      if (barInPhrase === 3) {
        notes = notes.slice(0, 2);
        beats = beats.slice(0, 2);
      }
      notes.forEach((note, i) => {
        const start = beats[i];
        const end = i + 1 < notes.length ? beats[i + 1] : 4;
        // Swell toward the middle of the four-bar phrase, then fall away.
        const arc = Math.sin((Math.PI * (barInPhrase + start / 4)) / 4);
        const vel = 0.42 + arc * 0.2 + (full ? 0.08 : 0);
        const at = t + start * beat + humanize();
        play.piano(at, note, Math.max(beat * 0.9, (end - start) * beat), vel, 0.5);
        if (full) play.piano(at, note + 12, (end - start) * beat, vel * 0.55, 0.5);
      });
      if (notes.length) anchor = Math.min(84, Math.max(69, notes[notes.length - 1]));
    },
  };
}

function ambientBand(): BandSetup {
  const tonic = pickOne([0, 2, 5, 7, 9]);
  let progression = pickOne(AMBIENT_PROGRESSIONS);
  return {
    // One slow "bar" is eight seconds.
    bpm: 30,
    beatsPerBar: 4,
    tone: 4200,
    wow: 0,
    crackle: 0,
    echo: true,
    write: (t, bar, { play, beat }) => {
      if (bar > 0 && bar % 4 === 0 && rand() < 0.5) progression = pickOne(AMBIENT_PROGRESSIONS);
      const chord = progression[bar % progression.length];
      const length = beat * 4;
      play.pad(t, bassRoot(chord, tonic, 36), length, 1);
      voiceChord(chord, tonic, 48).forEach((note) => play.pad(t + between(0, 1.2), note, length, 0.8));
      const scale = keyNotes(tonic, MAJOR_PENTATONIC, 72, 96);
      for (let i = 0, n = 1 + Math.floor(rand() * 3); i < n; i++) {
        play.bell(t + between(0, length), pickOne(scale), between(0.5, 1));
      }
    },
  };
}

/**
 * snd5: koto in the in scale. Phrases step through the scale with the odd leap,
 * a low string rings under every other bar, a phrase ends with an answer an
 * octave down, and every eighth bar is one held note: room to breathe.
 */
function kotoBand(): BandSetup {
  const tonic = pickOne([2, 4, 7, 9]);
  const scale = keyNotes(tonic, MIYAKO_BUSHI, 55, 86);
  const low = 43 + ((tonic - (43 % 12) + 12) % 12);
  let pos = Math.floor(scale.length / 2);
  const shapes: readonly number[][] = [
    [0, 1, 2, 3],
    [0, 0.5, 1, 2, 3],
    [0, 1.5, 2, 2.5, 3.5],
    [0, 2, 3],
  ];
  const step = (): number => pickOne([-2, -1, -1, 1, 1, 2]);
  return {
    bpm: 56,
    beatsPerBar: 4,
    tone: 5200,
    wow: 0,
    crackle: 0,
    echo: true,
    write: (t, bar, { play, beat }) => {
      if (bar % 2 === 0) play.koto(t, low, beat * 4, 0.5, 0.35);
      if (bar % 8 === 7) {
        play.koto(t + humanize(), scale[pos] as number, beat * 3, 0.55, 0.45, true);
        return;
      }
      for (const at of pickOne(shapes)) {
        pos = Math.min(scale.length - 1, Math.max(0, pos + step()));
        play.koto(t + at * beat + humanize(), scale[pos] as number, beat * 1.4, between(0.45, 0.7), 0.4, rand() < 0.15);
      }
      if (bar % 4 === 3) {
        play.koto(t + 3.5 * beat, scale[Math.max(0, pos - 5)] as number, beat * 1.8, 0.4, 0.4);
      }
    },
  };
}

const BANDS: Record<Exclude<MusicStyleId, 'off'>, () => BandSetup> = {
  'lofi-chill': () => lofiBand(false),
  'lofi-dusk': () => lofiBand(true),
  'jazz-cafe': jazzCafeBand,
  'jazz-ballad': jazzBalladBand,
  'piano-emotional': emotionalPianoBand,
  'ambient-drift': ambientBand,
  'koto-garden': kotoBand,
};

function buildMusic(rig: Rig, style: Exclude<MusicStyleId, 'off'>, reverb: AudioNode): Tick {
  const setup = BANDS[style]();
  const ctx = rig.ctx;
  const tone = rig.filter('lowpass', setup.tone);
  tone.connect(rig.out);

  const wet = rig.gain(1);
  if (setup.echo) {
    // A dotted echo feeding the reverb: notes trail off instead of stopping.
    const delay = rig.keep(ctx.createDelay(1.5));
    delay.delayTime.value = (60 / setup.bpm) * (setup.bpm < 40 ? 0.25 : 0.75);
    const feedback = rig.gain(0.32);
    const damp = rig.filter('lowpass', 2400);
    wet.connect(delay);
    delay.connect(damp);
    damp.connect(feedback);
    feedback.connect(delay);
    damp.connect(tone);
    rig.chain(damp, rig.gain(0.5), reverb);
  }
  wet.connect(reverb);

  let wow: AudioNode | null = null;
  if (setup.wow > 0) {
    // Slow pitch drift, like a tape that is not quite running true.
    wow = rig.chain(rig.osc('sine', 0.33), rig.gain(setup.wow));
  }

  if (setup.crackle > 0) {
    // Vinyl surface: sparse clicks in a short looping buffer, over a faint hiss.
    const seconds = 3;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0, clicks = 14 * seconds; i < clicks; i++) {
      const size = rand();
      data[Math.floor(rand() * data.length)] = (rand() < 0.5 ? -1 : 1) * size * size;
    }
    const source = rig.keepSource(ctx.createBufferSource());
    source.buffer = buffer;
    source.loop = true;
    source.start();
    rig.chain(source, rig.filter('highpass', 1200), rig.gain(setup.crackle), rig.out);
    rig.chain(rig.noise('pink'), rig.filter('highpass', 3000), rig.gain(0.012), rig.out);
  }

  const band: BandContext = { rig, play: new Instruments(rig, tone, wet, wow), beat: 60 / setup.bpm };
  const barLength = band.beat * setup.beatsPerBar;
  let nextBar = -1;
  let bar = 0;
  return (now, horizon) => {
    if (nextBar < 0) nextBar = now + 0.15;
    // After a long stall (a suspended machine) skip ahead rather than catch up.
    if (nextBar < now - barLength) nextBar = now + 0.05;
    while (nextBar < horizon) {
      setup.write(nextBar, bar, band);
      nextBar += barLength;
      bar += 1;
    }
  };
}

// ---------------------------------------------------------------------------
// Noise and reverb buffers
// ---------------------------------------------------------------------------

function fillNoise(color: NoiseColor, out: Float32Array): void {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let last = 0;
  for (let i = 0; i < out.length; i++) {
    const white = rand() * 2 - 1;
    if (color === 'white') {
      out[i] = white;
    } else if (color === 'pink') {
      // Paul Kellet's economy pink filter.
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      out[i] = (b0 + b1 + b2 + white * 0.1848) * 0.22;
    } else {
      last = (last + 0.02 * white) / 1.02;
      out[i] = last * 3.5;
    }
  }
}

function createNoiseBuffer(ctx: AudioContext, color: NoiseColor): AudioBuffer {
  const seconds = 4;
  const length = Math.floor(ctx.sampleRate * seconds);
  const overlap = Math.floor(ctx.sampleRate * 0.25);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  const scratch = new Float32Array(length + overlap);
  for (let channel = 0; channel < 2; channel++) {
    fillNoise(color, scratch);
    const data = buffer.getChannelData(channel);
    data.set(scratch.subarray(0, length));
    // Blend the head with what would have followed the tail, so the loop point
    // has no step in it. Equal-power weights, because the two are uncorrelated.
    for (let i = 0; i < overlap; i++) {
      const w = i / overlap;
      data[i] = scratch[i] * Math.sqrt(w) + scratch[length + i] * Math.sqrt(1 - w);
    }
    // snd2: measured offline, the brown integrator wanders past full scale
    // (peak 1.38 in a seeded render). Scale only a bed that exceeds 0.98, so a
    // normal one keeps its level and a loud draw can never clip on its own.
    let top = 0;
    for (let i = 0; i < length; i++) top = Math.max(top, Math.abs(data[i]));
    if (top > 0.98) {
      const scale = 0.98 / top;
      for (let i = 0; i < length; i++) data[i] *= scale;
    }
  }
  return buffer;
}

function createReverbImpulse(ctx: AudioContext): AudioBuffer {
  const seconds = 2.2;
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const progress = i / length;
      data[i] = (rand() * 2 - 1) * Math.pow(1 - progress, 3.2);
    }
  }
  return buffer;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

const RAMP = 0.12;

export class SoundscapeEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private duck: GainNode | null = null;
  private fade: GainNode | null = null;
  /** snd5: the long scheduled fade (sleep timer), separate from `fade`. */
  private scheduled: GainNode | null = null;
  private reverb: GainNode | null = null;
  private readonly noiseBuffers = new Map<NoiseColor, AudioBuffer>();
  private readonly layers = new Map<SoundLayerId, { rig: Rig; level: GainNode; tick: Tick | undefined }>();
  private music: { style: MusicStyleId; rig: Rig; level: GainNode; tick: Tick } | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private playing = false;
  private target: SoundscapeTarget = { master: 0.7, layers: {}, music: 'off', musicGain: 0, ducked: false };

  /** True when this runtime can make sound at all. */
  static isSupported(): boolean {
    return typeof window !== 'undefined' && typeof window.AudioContext === 'function';
  }

  isPlaying(): boolean {
    return this.playing;
  }

  /** Set what should be sounding. Safe to call while stopped; it is applied on play. */
  apply(target: SoundscapeTarget): void {
    this.target = target;
    if (this.playing) this.reconcile();
  }

  /** Start (or resume), rising from silence over `fadeInSeconds` (snd5 fade schedules). */
  play(fadeInSeconds = 0.6): void {
    if (!SoundscapeEngine.isSupported()) return;
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    const ctx = this.ensureContext();
    void ctx.resume();
    this.playing = true;
    this.reconcile();
    this.cancelScheduledFade();
    const fade = this.fade;
    if (fade) {
      fade.gain.cancelScheduledValues(ctx.currentTime);
      fade.gain.setValueAtTime(fade.gain.value, ctx.currentTime);
      fade.gain.linearRampToValueAtTime(1, ctx.currentTime + Math.max(0.05, fadeInSeconds));
    }
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  /**
   * snd5: a long fade that does not stop anything — the sleep timer's last
   * minutes. Runs on its own gain stage, so play/pause and the short fades keep
   * working over it; the store stops playback when it has run out.
   */
  scheduleFadeOut(delaySeconds: number, durationSeconds: number): void {
    const ctx = this.ctx;
    const node = this.scheduled;
    if (!ctx || !node) return;
    const start = ctx.currentTime + Math.max(0, delaySeconds);
    node.gain.cancelScheduledValues(ctx.currentTime);
    node.gain.setValueAtTime(node.gain.value, ctx.currentTime);
    node.gain.setValueAtTime(node.gain.value, start);
    node.gain.linearRampToValueAtTime(0, start + Math.max(0.05, durationSeconds));
  }

  /** Undo `scheduleFadeOut`: back to full level at once. */
  cancelScheduledFade(): void {
    const ctx = this.ctx;
    const node = this.scheduled;
    if (!ctx || !node) return;
    node.gain.cancelScheduledValues(ctx.currentTime);
    node.gain.setValueAtTime(1, ctx.currentTime);
  }

  /** Fade out over `fadeSeconds`, then release every node and suspend the context. */
  pause(fadeSeconds = 0.4): void {
    if (!this.playing) return;
    this.playing = false;
    const ctx = this.ctx;
    const fade = this.fade;
    if (!ctx || !fade) return;
    fade.gain.cancelScheduledValues(ctx.currentTime);
    fade.gain.setValueAtTime(fade.gain.value, ctx.currentTime);
    fade.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeSeconds);
    this.stopTimer = setTimeout(() => {
      this.stopTimer = null;
      if (this.playing) return;
      this.teardownVoices();
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      void ctx.suspend();
    }, fadeSeconds * 1000 + 80);
  }

  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext({ latencyHint: 'playback' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.duck = ctx.createGain();
    this.fade = ctx.createGain();
    this.fade.gain.value = 0;
    this.scheduled = ctx.createGain();
    this.master.gain.value = this.target.master;
    this.fade.connect(this.scheduled);
    this.scheduled.connect(this.duck);
    this.duck.connect(this.master);
    // Every slider at full adds up to well past full scale. A limiter on the way
    // out catches that instead of letting the output clip.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -9;
    limiter.knee.value = 6;
    limiter.ratio.value = 16;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    // The compressor adds make-up gain of its own; take it back out so the
    // limiter only ever turns things down.
    const trim = ctx.createGain();
    trim.gain.value = 0.62;
    this.master.connect(limiter);
    limiter.connect(trim);
    trim.connect(ctx.destination);
    return ctx;
  }

  private noiseBuffer = (color: NoiseColor): AudioBuffer => {
    let buffer = this.noiseBuffers.get(color);
    if (!buffer && this.ctx) {
      buffer = createNoiseBuffer(this.ctx, color);
      this.noiseBuffers.set(color, buffer);
    }
    return buffer as AudioBuffer;
  };

  /** The shared reverb's input, built the first time something needs it. */
  private reverbInput(): AudioNode {
    const ctx = this.ctx as AudioContext;
    if (!this.reverb) {
      const input = ctx.createGain();
      const convolver = ctx.createConvolver();
      convolver.buffer = createReverbImpulse(ctx);
      const level = ctx.createGain();
      level.gain.value = 0.55;
      input.connect(convolver);
      convolver.connect(level);
      level.connect(this.fade as GainNode);
      this.reverb = input;
    }
    return this.reverb;
  }

  private reconcile(): void {
    const ctx = this.ctx;
    if (!ctx || !this.fade || !this.master || !this.duck) return;
    const now = ctx.currentTime;
    this.master.gain.setTargetAtTime(this.target.master, now, RAMP);
    this.duck.gain.setTargetAtTime(this.target.ducked ? DUCK_GAIN : 1, now, 0.35);

    for (const [id, entry] of this.layers) {
      if ((this.target.layers[id] ?? 0) > 0) continue;
      this.layers.delete(id);
      this.release(entry.rig, entry.level);
    }
    for (const [id, gain] of Object.entries(this.target.layers) as [SoundLayerId, number][]) {
      if (!(gain > 0)) continue;
      const existing = this.layers.get(id);
      if (existing) {
        existing.level.gain.setTargetAtTime(gain, now, RAMP);
        continue;
      }
      const rig = new Rig(ctx, this.noiseBuffer);
      const level = ctx.createGain();
      level.gain.setValueAtTime(0, now);
      level.gain.linearRampToValueAtTime(gain, now + 0.5);
      rig.out.connect(level);
      level.connect(this.fade);
      const built = LAYERS[id](rig, () => this.reverbInput());
      this.layers.set(id, { rig, level, tick: typeof built === 'function' ? built : undefined });
    }

    const style = this.target.musicGain > 0 ? this.target.music : 'off';
    if (this.music && this.music.style !== style) {
      this.release(this.music.rig, this.music.level);
      this.music = null;
    }
    if (style !== 'off') {
      if (this.music) {
        this.music.level.gain.setTargetAtTime(this.target.musicGain, now, RAMP);
      } else {
        const rig = new Rig(ctx, this.noiseBuffer);
        const level = ctx.createGain();
        level.gain.setValueAtTime(0, now);
        level.gain.linearRampToValueAtTime(this.target.musicGain, now + 0.8);
        rig.out.connect(level);
        level.connect(this.fade);
        this.music = { style, rig, level, tick: buildMusic(rig, style, this.reverbInput()) };
      }
    }
  }

  /** Fade a voice out, then free its nodes. */
  private release(rig: Rig, level: GainNode): void {
    const ctx = this.ctx;
    if (!ctx) return;
    level.gain.cancelScheduledValues(ctx.currentTime);
    level.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    setTimeout(() => {
      rig.dispose();
      level.disconnect();
    }, 600);
  }

  private teardownVoices(): void {
    for (const entry of this.layers.values()) {
      entry.rig.dispose();
      entry.level.disconnect();
    }
    this.layers.clear();
    if (this.music) {
      this.music.rig.dispose();
      this.music.level.disconnect();
      this.music = null;
    }
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    const now = ctx.currentTime;
    const horizon = now + LOOKAHEAD;
    for (const entry of this.layers.values()) if (entry.tick) entry.tick(now, horizon);
    if (this.music) this.music.tick(now, horizon);
  }
}

export const soundscapeEngine = new SoundscapeEngine();
