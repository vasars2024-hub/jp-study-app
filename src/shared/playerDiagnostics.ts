/**
 * Player diagnostics, against the player that actually plays (round-2 audit B).
 *
 * The old report probed `videoRef` — an element nothing has attached since the
 * old player was deleted — plus a fresh `<video>` that plays nothing, and wrote
 * its findings as English sentences the UI could not show. Every check here
 * reads something the real playback path depends on: the Seanime server that
 * streams the file, its transcoder, the VideoCore element's playback path and
 * tracks, and the GPU and decoders the picture goes through. Each check is a
 * status plus i18n keys and values, so the Media Center renders it in the UI
 * language and the exported file carries the same facts.
 */
export type PlayerDiagnosticStatus = 'pass' | 'warning' | 'fail' | 'info';

export interface LivePlayerSnapshot {
  /** Seanime's stream type: `direct`, `transcode`, `optimized`, or a local/online kind. */
  streamType: string;
  /** The file being played, when it is a local file. */
  localFilePath?: string;
  video: {
    readyState: number;
    networkState: number;
    /** `MediaError.code`, when the element reports one. */
    errorCode?: number;
    width: number;
    height: number;
    durationSec: number;
  };
  audioTracks: string[];
  subtitleTracks: string[];
  cueCount: number;
}

export type DecoderCodec = 'h264' | 'hevc' | 'vp9' | 'av1';

export interface PlayerDiagnosticInput {
  server: {
    /** `SeanimeStatus.kind`. */
    state: string;
    version: string | null;
    /** The status endpoint answered with the connection's token. */
    reachable: boolean;
  };
  /** From the server's own status; `null` when it could not be read. */
  mediastream: {
    transcodeEnabled: boolean;
    hwAccel: string;
    ffmpegConfigured: boolean;
    directPlayOnly: boolean;
  } | null;
  /** The VideoCore player's live state; `null` when nothing is playing. */
  playback: LivePlayerSnapshot | null;
  gpu: { webgl: boolean; renderer: string | null };
  decoders: Record<DecoderCodec, { supported: boolean; hardware: boolean }>;
}

export interface PlayerDiagnosticCheck {
  id: string;
  status: PlayerDiagnosticStatus;
  labelKey: string;
  detailKey: string;
  vars?: Record<string, string | number>;
}

export interface PlayerDiagnosticReport {
  generatedAt: number;
  checks: PlayerDiagnosticCheck[];
  passCount: number;
  warningCount: number;
  failCount: number;
}

const SOFTWARE_GPU_RE = /swiftshader|llvmpipe|software|basic render/i;

const CODEC_NAMES: Record<DecoderCodec, string> = {
  h264: 'H.264',
  hevc: 'HEVC (H.265)',
  vp9: 'VP9',
  av1: 'AV1',
};

function check(
  id: string,
  status: PlayerDiagnosticStatus,
  labelKey: string,
  detailKey: string,
  vars?: Record<string, string | number>,
): PlayerDiagnosticCheck {
  return { id, status, labelKey, detailKey, ...(vars ? { vars } : {}) };
}

export function buildPlayerDiagnosticReport(
  input: PlayerDiagnosticInput,
  now = Date.now(),
): PlayerDiagnosticReport {
  const checks: PlayerDiagnosticCheck[] = [];
  const { server, mediastream, playback, gpu, decoders } = input;

  // 1. The streaming server.
  if (server.state === 'running' && server.reachable) {
    checks.push(check('server', 'pass', 'playerDiag.server.label', 'playerDiag.server.ok', {
      version: server.version ?? '?',
    }));
  } else if (server.state === 'running') {
    checks.push(check('server', 'fail', 'playerDiag.server.label', 'playerDiag.server.unreachable'));
  } else {
    checks.push(check('server', 'fail', 'playerDiag.server.label', 'playerDiag.server.down', {
      state: server.state,
    }));
  }

  // 2. Transcoding: what plays a file the decoders below cannot.
  if (!mediastream) {
    checks.push(check('transcode', 'warning', 'playerDiag.transcode.label', 'playerDiag.transcode.unknown'));
  } else if (mediastream.directPlayOnly || !mediastream.transcodeEnabled) {
    checks.push(check('transcode', 'info', 'playerDiag.transcode.label', 'playerDiag.transcode.off'));
  } else if (!mediastream.ffmpegConfigured) {
    checks.push(check('transcode', 'warning', 'playerDiag.transcode.label', 'playerDiag.transcode.noFfmpeg'));
  } else {
    checks.push(check('transcode', 'pass', 'playerDiag.transcode.label', 'playerDiag.transcode.ok', {
      accel: mediastream.hwAccel || 'cpu',
    }));
  }

  // 3–5. The file on screen.
  if (!playback) {
    checks.push(check('playback', 'info', 'playerDiag.playback.label', 'playerDiag.playback.none'));
  } else {
    const v = playback.video;
    if (v.errorCode) {
      checks.push(check('playback', 'fail', 'playerDiag.playback.label', 'playerDiag.playback.error', {
        code: v.errorCode,
        type: playback.streamType,
      }));
    } else if (v.readyState < 2) {
      checks.push(check('playback', 'warning', 'playerDiag.playback.label', 'playerDiag.playback.loading', {
        type: playback.streamType,
      }));
    } else {
      checks.push(check('playback', 'pass', 'playerDiag.playback.label', 'playerDiag.playback.ok', {
        type: playback.streamType,
        width: v.width,
        height: v.height,
      }));
    }
    checks.push(playback.audioTracks.length
      ? check('audio-tracks', 'pass', 'playerDiag.audio.label', 'playerDiag.audio.tracks', {
        count: playback.audioTracks.length,
        names: playback.audioTracks.join(', '),
      })
      : check('audio-tracks', 'info', 'playerDiag.audio.label', 'playerDiag.audio.single'));
    checks.push(playback.subtitleTracks.length
      ? check('subtitle-tracks', 'pass', 'playerDiag.subtitles.label', 'playerDiag.subtitles.tracks', {
        count: playback.subtitleTracks.length,
        cues: playback.cueCount,
      })
      : check('subtitle-tracks', 'warning', 'playerDiag.subtitles.label', 'playerDiag.subtitles.none'));
  }

  // 6. GPU.
  if (!gpu.webgl) {
    checks.push(check('gpu', 'warning', 'playerDiag.gpu.label', 'playerDiag.gpu.none'));
  } else if (gpu.renderer && SOFTWARE_GPU_RE.test(gpu.renderer)) {
    checks.push(check('gpu', 'warning', 'playerDiag.gpu.label', 'playerDiag.gpu.software', { renderer: gpu.renderer }));
  } else {
    checks.push(check('gpu', 'pass', 'playerDiag.gpu.label', 'playerDiag.gpu.ok', {
      renderer: gpu.renderer ?? '?',
    }));
  }

  // 7. Decoders. A codec that is not decoded here needs the transcoder above.
  for (const codec of Object.keys(CODEC_NAMES) as DecoderCodec[]) {
    const d = decoders[codec];
    const vars = { codec: CODEC_NAMES[codec] };
    checks.push(
      d.supported && d.hardware
        ? check(`decoder-${codec}`, 'pass', 'playerDiag.decoder.label', 'playerDiag.decoder.hardware', vars)
        : d.supported
          ? check(`decoder-${codec}`, 'info', 'playerDiag.decoder.label', 'playerDiag.decoder.software', vars)
          : check(`decoder-${codec}`, 'warning', 'playerDiag.decoder.label', 'playerDiag.decoder.none', vars),
    );
  }

  return {
    generatedAt: now,
    checks,
    passCount: checks.filter((item) => item.status === 'pass').length,
    warningCount: checks.filter((item) => item.status === 'warning').length,
    failCount: checks.filter((item) => item.status === 'fail').length,
  };
}
