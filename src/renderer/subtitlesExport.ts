import { cuesToSrt, cuesToVtt, type ExportCue } from '../shared/subtitlesExport';

export { cuesToSrt, cuesToVtt, formatSrtTime, formatVttTime } from '../shared/subtitlesExport';

/** Trigger a browser download of subtitle text. */
export function downloadSubtitles(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type { ExportCue };
