/**
 * One relayed visualizer frame (see renderer/vizFrames.ts). The type lives in shared
 * because preload carries it across IPC and must not reach into renderer modules.
 */
export interface VizFrame {
  /** Spectrum, 0–255 per bin, bass first. */
  freq: Uint8Array;
  /** Time-domain waveform, 128 = silence. */
  wave: Uint8Array;
}
