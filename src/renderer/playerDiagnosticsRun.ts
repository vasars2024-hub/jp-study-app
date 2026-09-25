/**
 * Collect `PlayerDiagnosticInput` from the running app: the Seanime sidecar's
 * status and its own `/api/v1/status` (which carries the transcoder settings),
 * the VideoCore player's live state, the WebGL renderer, and whether this
 * Chromium decodes each codec in hardware. Every probe that can fail degrades
 * to "unknown" for that check only.
 */
import type { SeanimeConnection, SeanimeStatus } from '../shared/seanime';
import type { DecoderCodec, PlayerDiagnosticInput } from '../shared/playerDiagnostics';
import { readLivePlayerSnapshot } from '../media/livePlayerProbe';

export interface DiagnosticsDeps {
  status: () => Promise<SeanimeStatus>;
  connection: () => Promise<SeanimeConnection>;
  fetchJson: (url: string, headers: Record<string, string>) => Promise<unknown>;
  decodingInfo?: (config: MediaDecodingConfiguration) => Promise<{ supported: boolean; powerEfficient: boolean }>;
  gpuRenderer: () => { webgl: boolean; renderer: string | null };
}

const CODEC_TYPES: Record<DecoderCodec, string> = {
  h264: 'video/mp4; codecs="avc1.640028"',
  hevc: 'video/mp4; codecs="hvc1.1.6.L120.90"',
  vp9: 'video/webm; codecs="vp09.00.40.08"',
  av1: 'video/mp4; codecs="av01.0.08M.08"',
};

function readMediastream(body: unknown): PlayerDiagnosticInput['mediastream'] {
  const root = (body as { data?: unknown } | null)?.data ?? body;
  const ms = (root as { mediastreamSettings?: Record<string, unknown> } | null)?.mediastreamSettings;
  if (!ms || typeof ms !== 'object') return null;
  return {
    transcodeEnabled: ms.transcodeEnabled === true,
    hwAccel: typeof ms.transcodeHwAccel === 'string' ? ms.transcodeHwAccel : '',
    // Seanime falls back to `ffmpeg` on PATH when the path is blank, so only
    // an explicit path is evidence; blank is reported as not configured.
    ffmpegConfigured: typeof ms.ffmpegPath === 'string' && ms.ffmpegPath.trim().length > 0,
    directPlayOnly: ms.directPlayOnly === true,
  };
}

export function defaultGpuRenderer(): { webgl: boolean; renderer: string | null } {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return { webgl: false, renderer: null };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    return { webgl: true, renderer };
  } catch {
    return { webgl: false, renderer: null };
  }
}

export function defaultDiagnosticsDeps(): DiagnosticsDeps {
  return {
    status: () => window.api.seanimeStatus(),
    connection: () => window.api.seanimeConnection(),
    fetchJson: async (url, headers) => {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 4000);
      try {
        const res = await fetch(url, { headers, signal: ctrl.signal });
        if (!res.ok) throw new Error(`http-${res.status}`);
        return await res.json();
      } finally {
        window.clearTimeout(timer);
      }
    },
    decodingInfo: typeof navigator !== 'undefined' && navigator.mediaCapabilities
      ? (config) => navigator.mediaCapabilities.decodingInfo(config)
      : undefined,
    gpuRenderer: defaultGpuRenderer,
  };
}

export async function collectPlayerDiagnostics(deps: DiagnosticsDeps = defaultDiagnosticsDeps()): Promise<PlayerDiagnosticInput> {
  let state = 'unknown';
  let version: string | null = null;
  try {
    const status = await deps.status();
    state = status.kind;
    version = status.version;
  } catch {
    /* reported as not running */
  }
  let reachable = false;
  let mediastream: PlayerDiagnosticInput['mediastream'] = null;
  if (state === 'running') {
    try {
      const conn = await deps.connection();
      if (conn.baseUrl) {
        const body = await deps.fetchJson(`${conn.baseUrl}/api/v1/status`, { 'X-Seanime-Token': conn.token });
        reachable = true;
        mediastream = readMediastream(body);
        const reported = ((body as { data?: { version?: unknown } } | null)?.data ?? body) as { version?: unknown } | null;
        if (typeof reported?.version === 'string' && reported.version) version = reported.version;
      }
    } catch {
      reachable = false;
    }
  }
  const decoders = {} as PlayerDiagnosticInput['decoders'];
  for (const codec of Object.keys(CODEC_TYPES) as DecoderCodec[]) {
    try {
      const info = deps.decodingInfo
        ? await deps.decodingInfo({
          type: 'file',
          video: { contentType: CODEC_TYPES[codec], width: 1920, height: 1080, bitrate: 8_000_000, framerate: 24 },
        })
        : { supported: false, powerEfficient: false };
      decoders[codec] = { supported: info.supported, hardware: info.supported && info.powerEfficient };
    } catch {
      decoders[codec] = { supported: false, hardware: false };
    }
  }
  return {
    server: { state, version, reachable },
    mediastream,
    playback: readLivePlayerSnapshot(),
    gpu: deps.gpuRenderer(),
    decoders,
  };
}
