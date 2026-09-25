/**
 * Main's half of the visualizer frame relay (the renderer half is
 * `renderer/vizFrames.ts`): the window that owns the audio sends a small analyser
 * frame about 30 times a second while another window is watching, and main fans it
 * out to every other live window.
 *
 * Validated here because it arrives from a renderer 30 times a second: anything that
 * is not two small byte arrays is dropped rather than forwarded, so a malformed or
 * oversized payload cannot turn the relay into a firehose into every window. Windows
 * whose renderer is gone are skipped — `send` into a crashed `webContents` throws, and
 * one dead window must not stop the frame reaching the rest.
 */

/** Largest array a frame may carry. The renderer sends 256 + 256. */
export const VIZ_FRAME_MAX_LEN = 1024;

export interface VizRelayWindow {
  isDestroyed(): boolean;
  readonly webContents?: {
    readonly id: number;
    isCrashed(): boolean;
    send(channel: string, ...args: unknown[]): void;
  } | null;
}

function isSmallByteArray(v: unknown): boolean {
  return v instanceof Uint8Array && v.length > 0 && v.length <= VIZ_FRAME_MAX_LEN;
}

/** Whether a renderer payload is a frame worth forwarding. */
export function isRelayableVizFrame(frame: unknown): frame is { freq: Uint8Array; wave: Uint8Array } {
  if (!frame || typeof frame !== 'object') return false;
  const f = frame as { freq?: unknown; wave?: unknown };
  return isSmallByteArray(f.freq) && isSmallByteArray(f.wave);
}

/** Forward a frame to every live window except its sender. Returns how many received it. */
export function relayVizFrame(
  windows: readonly VizRelayWindow[],
  senderId: number,
  frame: unknown,
): number {
  if (!isRelayableVizFrame(frame)) return 0;
  const payload = { freq: frame.freq, wave: frame.wave };
  let sent = 0;
  for (const win of windows) {
    try {
      if (win.isDestroyed()) continue;
      const contents = win.webContents;
      if (!contents || contents.id === senderId || contents.isCrashed()) continue;
      contents.send('player:vizFrame', payload);
      sent++;
    } catch {
      continue;
    }
  }
  return sent;
}
