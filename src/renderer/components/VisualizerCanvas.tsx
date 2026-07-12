import { useEffect, useRef } from 'react';
import {
  binCount,
  getBassLevel,
  getFrequencyData,
  getWaveform,
  isPlaying,
  onBeat,
  onPlayingChanged,
  setFftSize,
} from '../audioBus';
import { accentPalette, paletteFor, type Palette } from '../albumArt';
import type { VizSettings } from '../visualizerSettings';
import { getState, subscribe as subscribePlayer } from '../playerBus';

// Canvas that draws the live audio visualization from the shared analyser:
//  - spectrum: classic analyzer bars, bass on the left → treble on the right
//  - wave: true oscilloscope trace of the audio waveform
//  - particles: beat-driven bursts that explode and accelerate with the music
// Used full-screen behind the desktop (wallpaper mode) and inside widgets.
// Idles to a dim baseline when nothing plays; loop stops entirely once faded.

interface Props {
  settings: VizSettings;
  className?: string;
  /** Draw a faint idle baseline when silent (widgets); wallpaper leaves blank. */
  idleBaseline?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number; // 1 → 0
  color: 0 | 1;
}

export default function VisualizerCanvas({ settings, className, idleBaseline }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paletteRef = useRef<Palette | null>(null);

  // Album palette follows the current song.
  useEffect(() => {
    if (settings.colorTheme !== 'album') {
      paletteRef.current = null;
      return;
    }
    let alive = true;
    const update = (id: string | undefined) => {
      if (!id) return;
      void paletteFor(id).then((p) => {
        if (alive) paletteRef.current = p;
      });
    };
    update(getState().current?.id);
    const unsub = subscribePlayer((s) => update(s.current?.id));
    return () => {
      alive = false;
      unsub();
    };
  }, [settings.colorTheme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;

    setFftSize(settings.fftSize);

    let raf = 0;
    let running = false;
    let fade = 0;
    const data = new Uint8Array(4096);
    const wave = new Uint8Array(4096);
    const particles: Particle[] = [];
    const sens = 0.35 + settings.intensity * 1.15; // sensitivity multiplier

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width));
      canvas.height = Math.max(1, Math.floor(rect.height));
    };
    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (!running) drawIdle();
    });
    ro.observe(canvas);

    const reduceMotion = () => document.documentElement.classList.contains('reduce-motion');

    const colors = (): Palette => {
      if (settings.colorTheme === 'custom') {
        return { primary: settings.customColors[0], secondary: settings.customColors[1] };
      }
      if (settings.colorTheme === 'album' && paletteRef.current) return paletteRef.current;
      return accentPalette();
    };

    /** Number of frequency bins to use (bass-only = bottom slice). */
    const usableBins = (): number => {
      const n = Math.min(binCount(), data.length);
      // Use most of the spectrum so the right side has real high-frequency data.
      const full = Math.floor(n * 0.88);
      return settings.freqTarget === 'bass' ? Math.max(6, Math.floor(n * 0.08)) : full;
    };

    /** Boost higher bins and tame sub-bass so the bar field reads evenly L→R. */
    const binGain = (bin: number, bins: number): number => {
      const t = bin / Math.max(1, bins - 1);
      const trebleLift = 1 + Math.pow(t, 1.35) * 2.6;
      const bassTame = 0.55 + t * 0.45;
      return trebleLift * bassTame;
    };

    /** Map bar index → [start, end) bin range on a log frequency scale. */
    const barBinRange = (bar: number, bars: number, bins: number): [number, number] => {
      const minB = 1;
      const maxB = Math.max(minB + 1, bins - 1);
      const start = Math.floor(minB * Math.pow(maxB / minB, bar / bars));
      const end = Math.floor(minB * Math.pow(maxB / minB, (bar + 1) / bars));
      return [start, Math.max(start + 1, end)];
    };

    /** Peak compensated level across a bin range (0..1). */
    const peakInRange = (start: number, end: number, bins: number): number => {
      let peak = 0;
      for (let b = start; b < end && b < bins; b++) {
        peak = Math.max(peak, (data[b] / 255) * binGain(b, bins));
      }
      return peak;
    };

    // ---- styles ----

    const drawSpectrum = (w: number, h: number, c: Palette) => {
      const bins = usableBins();
      const bars = Math.max(16, Math.min(96, Math.floor(w / 9)));
      const grad = g.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, c.primary);
      grad.addColorStop(1, c.secondary);
      g.fillStyle = grad;
      const bw = w / bars;
      for (let i = 0; i < bars; i++) {
        const [binStart, binEnd] = barBinRange(i, bars, bins);
        const v = Math.min(1, peakInRange(binStart, binEnd, bins) * sens) * fade;
        const bh = Math.max(2, v * h * 0.92);
        g.globalAlpha = 0.3 + v * 0.7;
        g.fillRect(i * bw + bw * 0.12, h - bh, bw * 0.76, bh);
      }
      g.globalAlpha = 1;
    };

    const drawWave = (w: number, h: number, c: Palette) => {
      getWaveform(wave);
      const n = Math.min(binCount() * 2, wave.length);
      g.globalAlpha = 0.5 + 0.5 * fade;
      const amp = sens * fade;
      const trace = (color: string, width: number) => {
        g.strokeStyle = color;
        g.lineWidth = width;
        g.beginPath();
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * w;
          const y = h / 2 + ((wave[i] - 128) / 128) * (h / 2) * 0.9 * amp;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      };
      trace(c.primary, 2.5);
      trace(c.secondary, 1);
      g.globalAlpha = 1;
    };

    const drawParticles = (w: number, h: number, c: Palette) => {
      const drive = settings.freqTarget === 'bass' ? getBassLevel() : avgLevel();
      const energy = Math.min(1, drive * sens) * fade;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        // Beats give a speed kick (see burst below); energy keeps them lively.
        p.x += p.vx * (0.5 + energy * 2.2);
        p.y += p.vy * (0.5 + energy * 2.2);
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.life -= 0.008 + (1 - energy) * 0.004;
        if (p.life <= 0 || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) {
          particles.splice(i, 1);
          continue;
        }
        g.globalAlpha = p.life * (0.35 + energy * 0.65);
        g.fillStyle = p.color === 0 ? c.primary : c.secondary;
        g.beginPath();
        g.arc(p.x, p.y, p.r * (0.6 + p.life * 0.8 + energy), 0, Math.PI * 2);
        g.fill();
      }
      // Gentle ambient sparkle between beats.
      if (particles.length < 40 && Math.random() < energy * 0.5) {
        spawn(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 0.4);
      }
      g.globalAlpha = 1;
    };

    const avgLevel = (): number => {
      const bins = usableBins();
      let sum = 0;
      for (let i = 0; i < bins; i++) sum += data[i];
      return sum / bins / 255;
    };

    const spawn = (x: number, y: number, speed: number, size: number) => {
      const ang = Math.random() * Math.PI * 2;
      particles.push({
        x, y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        r: (1.5 + Math.random() * 3.5) * (0.6 + size),
        life: 0.7 + Math.random() * 0.3,
        color: Math.random() > 0.5 ? 0 : 1,
      });
    };

    // Beat → burst: a cluster of particles exploding from a random point.
    const unBeat = onBeat((strength) => {
      if (settings.style !== 'particles' || reduceMotion()) return;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w * (0.2 + Math.random() * 0.6);
      const cy = h * (0.2 + Math.random() * 0.6);
      const count = Math.floor(8 + strength * sens * 26);
      for (let i = 0; i < count && particles.length < 220; i++) {
        spawn(cx, cy, 1.5 + strength * 4.5, strength);
      }
    });

    // ---- idle baseline: keep the widget visibly "alive" when silent ----
    const drawIdle = () => {
      const w = canvas.width;
      const h = canvas.height;
      g.clearRect(0, 0, w, h);
      if (!idleBaseline) return;
      const c = colors();
      g.globalAlpha = 0.3;
      if (settings.style === 'wave') {
        g.strokeStyle = c.primary;
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(0, h / 2);
        g.lineTo(w, h / 2);
        g.stroke();
      } else {
        g.fillStyle = c.primary;
        const bars = Math.max(16, Math.min(96, Math.floor(w / 9)));
        const bw = w / bars;
        for (let i = 0; i < bars; i++) g.fillRect(i * bw + bw * 0.12, h - 3, bw * 0.76, 3);
      }
      g.globalAlpha = 1;
    };

    const frame = () => {
      const playingNow = isPlaying() && !reduceMotion();
      fade += ((playingNow ? 1 : 0) - fade) * 0.05;
      const w = canvas.width;
      const h = canvas.height;
      g.clearRect(0, 0, w, h);
      if (fade > 0.01) {
        getFrequencyData(data);
        const c = colors();
        if (settings.style === 'spectrum') drawSpectrum(w, h, c);
        else if (settings.style === 'wave') drawWave(w, h, c);
        else drawParticles(w, h, c);
        raf = requestAnimationFrame(frame);
      } else {
        running = false;
        particles.length = 0;
        drawIdle();
      }
    };

    const start = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };

    if (isPlaying()) start();
    else drawIdle();
    const unsub = onPlayingChanged((p) => {
      if (p) start();
    });
    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else if (running) raf = requestAnimationFrame(frame);
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelAnimationFrame(raf);
      running = false;
      ro.disconnect();
      unsub();
      unBeat();
      document.removeEventListener('visibilitychange', onVis);
    };
    // Settings object identity changes on every save; stringify for stability.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(settings), idleBaseline]);

  return <canvas ref={canvasRef} className={className} />;
}
