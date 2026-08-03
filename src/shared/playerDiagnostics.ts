export type PlayerDiagnosticStatus = 'pass' | 'warning' | 'fail' | 'info';

export interface PlayerCapabilitySnapshot {
  formatSupport: Record<string, boolean>;
  pictureInPicture: boolean;
  fullscreen: boolean;
  mediaRecorder: boolean;
  webgl: boolean;
  readyState: number;
  networkState: number;
  durationSec: number;
  videoWidth: number;
  videoHeight: number;
  audioTrackCount: number;
  subtitleCueCount: number;
  subtitleTimelineValid: boolean;
  currentExtension: string;
  currentFileBytes?: number;
}

export interface PlayerDiagnosticCheck {
  id: string;
  label: string;
  status: PlayerDiagnosticStatus;
  detail: string;
}

export interface PlayerDiagnosticReport {
  generatedAt: number;
  checks: PlayerDiagnosticCheck[];
  passCount: number;
  warningCount: number;
  failCount: number;
}

const check = (
  id: string,
  label: string,
  status: PlayerDiagnosticStatus,
  detail: string,
): PlayerDiagnosticCheck => ({ id, label, status, detail });

export function buildPlayerDiagnosticReport(
  snapshot: PlayerCapabilitySnapshot,
  now = Date.now(),
): PlayerDiagnosticReport {
  const checks: PlayerDiagnosticCheck[] = [];
  for (const [format, supported] of Object.entries(snapshot.formatSupport)) {
    checks.push(check(
      `format-${format.toLowerCase()}`,
      `${format} playback`,
      supported ? 'pass' : ['MKV', 'AVI', 'MOV'].includes(format) ? 'warning' : 'fail',
      supported ? 'Native browser decoding is available.' : ['MKV', 'AVI', 'MOV'].includes(format)
        ? 'Native decoding is unavailable; the built-in conversion fallback is required.'
        : 'Native decoding was not reported by the current runtime.',
    ));
  }
  checks.push(check(
    'media-ready',
    'Current media readiness',
    snapshot.readyState >= 2 ? 'pass' : snapshot.readyState > 0 ? 'warning' : 'info',
    snapshot.readyState >= 2
      ? `Decoded media is available${snapshot.videoWidth ? ` at ${snapshot.videoWidth}×${snapshot.videoHeight}` : ''}.`
      : `Ready state ${snapshot.readyState}; network state ${snapshot.networkState}.`,
  ));
  checks.push(check(
    'subtitles',
    'Subtitle parser and timeline',
    snapshot.subtitleCueCount === 0 ? 'info' : snapshot.subtitleTimelineValid ? 'pass' : 'fail',
    snapshot.subtitleCueCount === 0
      ? 'No subtitle track is currently loaded. SRT, VTT, ASS, and SSA import paths are available.'
      : `${snapshot.subtitleCueCount} cues loaded${snapshot.subtitleTimelineValid ? ' with a valid timeline.' : '; invalid or overlapping timestamps were detected.'}`,
  ));
  checks.push(check(
    'audio-tracks',
    'Audio track switching',
    snapshot.audioTrackCount > 1 ? 'pass' : 'warning',
    snapshot.audioTrackCount > 1
      ? `${snapshot.audioTrackCount} browser-exposed audio tracks are available.`
      : 'The runtime does not expose multiple audio tracks for this media; conversion or an external player may be required.',
  ));
  checks.push(check(
    'gpu',
    'GPU rendering path',
    snapshot.webgl ? 'pass' : 'warning',
    snapshot.webgl ? 'WebGL is available for accelerated rendering.' : 'WebGL is unavailable; software rendering may be active.',
  ));
  checks.push(check(
    'pip',
    'Picture-in-picture',
    snapshot.pictureInPicture ? 'pass' : 'warning',
    snapshot.pictureInPicture ? 'Picture-in-picture API is available.' : 'Picture-in-picture API is unavailable.',
  ));
  checks.push(check(
    'fullscreen',
    'Fullscreen',
    snapshot.fullscreen ? 'pass' : 'fail',
    snapshot.fullscreen ? 'Fullscreen API is available.' : 'Fullscreen API is unavailable.',
  ));
  checks.push(check(
    'recording',
    'Shadowing recording',
    snapshot.mediaRecorder ? 'pass' : 'warning',
    snapshot.mediaRecorder ? 'MediaRecorder is available.' : 'MediaRecorder is unavailable.',
  ));
  checks.push(check(
    'large-file',
    'Large-file path',
    snapshot.currentFileBytes == null ? 'info' : 'pass',
    snapshot.currentFileBytes == null
      ? 'Open a local library item to verify its file-size path.'
      : `${snapshot.currentFileBytes.toLocaleString()} bytes resolved without loading the file into renderer memory.`,
  ));
  if (snapshot.currentExtension) {
    checks.push(check(
      'current-container',
      'Current container',
      'info',
      `${snapshot.currentExtension.toUpperCase()} · ${Math.round(snapshot.durationSec)} seconds.`,
    ));
  }
  return {
    generatedAt: now,
    checks,
    passCount: checks.filter((item) => item.status === 'pass').length,
    warningCount: checks.filter((item) => item.status === 'warning').length,
    failCount: checks.filter((item) => item.status === 'fail').length,
  };
}
