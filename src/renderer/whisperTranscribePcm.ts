/**
 * Run one slice of PCM through the installed Whisper model.
 *
 * Whisper lives in a renderer worker, so anything in the main process that wants
 * a transcript has to ask the renderer for it. Two callers now do: the Chrome
 * extension bridge, and the transcription queue. Extracted here so both take the
 * same path — model tier, device preference and language resolution included.
 */

export interface PcmTranscription {
  ok: boolean;
  text?: string;
  error?: string;
}

/** Decodes the base64 the main process sends over the bridge. */
export function decodePcmBase64(pcmBase64: string): Float32Array {
  const raw = atob(pcmBase64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

/**
 * Transcribes 16 kHz mono float32 PCM.
 *
 * A fresh worker per call: model load is cached by the browser, and a persistent
 * worker would hold the model in memory for the whole session even when nobody is
 * transcribing.
 */
export async function transcribePcm(audio: Float32Array, lang?: string): Promise<PcmTranscription> {
  if (!audio.length) return { ok: false, error: 'Empty audio PCM' };

  const { loadWhisperDevice, loadWhisperModelTier, whisperHfId } = await import('./whisperSettings');
  const { getStudyLang } = await import('./studyEnvironment');
  // Model tiers exist only for the two study languages; anything else falls back
  // to Japanese rather than asking for a tier that has no model behind it.
  const resolved: 'ja' | 'zh' = lang === 'zh' || lang === 'ja'
    ? lang
    : (getStudyLang() === 'zh' ? 'zh' : 'ja');

  return new Promise<PcmTranscription>((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./whisperWorker.ts', import.meta.url), { type: 'module' });
    } catch (error) {
      resolve({ ok: false, error: error instanceof Error ? error.message : 'Whisper worker failed to start' });
      return;
    }

    const chunks: string[] = [];
    let settled = false;
    const finish = (result: PcmTranscription): void => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve(result);
    };

    worker.onmessage = (event: MessageEvent) => {
      const message = event.data as { type?: string; cues?: Array<{ text?: string }>; message?: string };
      if (message.type === 'partial' && Array.isArray(message.cues)) {
        for (const cue of message.cues) {
          if (cue?.text?.trim()) chunks.push(cue.text.trim());
        }
      } else if (message.type === 'done') {
        finish({ ok: true, text: chunks.join(' ').trim() });
      } else if (message.type === 'error') {
        finish({ ok: false, error: message.message || 'Whisper error' });
      }
    };
    worker.onerror = (error) => finish({ ok: false, error: error.message || 'Whisper worker failed' });

    worker.postMessage(
      {
        audio,
        model: whisperHfId(loadWhisperModelTier(resolved)),
        prefer: loadWhisperDevice(),
        lang: resolved,
      },
      // Transferred, not copied — a 30-second slice is ~2 MB.
      [audio.buffer],
    );
  });
}
