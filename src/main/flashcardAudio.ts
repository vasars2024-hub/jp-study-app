import { app, ipcMain } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';

const ffmpegPath = ffmpegStatic as unknown as string;

export interface FlashcardAudioResult {
  ok: boolean;
  path?: string;
  dataUrl?: string;
  error?: string;
}

function audioRoot(): string {
  return path.join(app.getPath('userData'), 'flashcard-audio');
}

export function cultureForLanguage(language: string): string {
  const tag = language.trim().toLowerCase();
  if (tag === 'zh' || tag.startsWith('zh-')) return 'zh-CN';
  if (tag === 'ru' || tag.startsWith('ru-')) return 'ru-RU';
  if (tag === 'en' || tag.startsWith('en-')) return 'en-US';
  return 'ja-JP';
}

export function isManagedFlashcardAudioPath(filePath: string, root = audioRoot()): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(filePath));
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function run(command: string, args: string[], options: { env?: NodeJS.ProcessEnv } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      env: options.env ?? process.env,
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${path.basename(command)} exited with code ${code}`));
    });
  });
}

function fileHash(...parts: Array<string | number>): string {
  return crypto.createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 24);
}

/** Extract one aligned media sentence without loading the full file into JS. */
export async function extractFlashcardAudioClip(
  sourcePath: string,
  mediaId: string,
  startSec: number,
  endSec: number,
  sentence: string,
): Promise<string> {
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    throw new Error('Media source is unavailable.');
  }
  const start = Math.max(0, startSec - 0.08);
  const end = Math.max(start + 0.1, endSec + 0.12);
  if (end - start > 30) throw new Error('Sentence audio exceeds the 30 second card limit.');
  const directory = path.join(audioRoot(), 'media', mediaId.replace(/[^a-zA-Z0-9_-]/g, ''));
  fs.mkdirSync(directory, { recursive: true });
  const output = path.join(directory, `${fileHash(sourcePath, start, end, sentence)}.mp3`);
  if (fs.existsSync(output) && fs.statSync(output).size > 0) return output;
  try {
    await run(ffmpegPath, [
      '-ss', start.toFixed(3),
      '-to', end.toFixed(3),
      '-i', sourcePath,
      '-vn', '-map', '0:a:0?', '-ac', '1', '-ar', '44100',
      '-c:a', 'libmp3lame', '-q:a', '4', '-y',
      '-hide_banner', '-loglevel', 'error', output,
    ]);
    if (!fs.existsSync(output) || fs.statSync(output).size === 0) {
      throw new Error('The media file has no readable audio track.');
    }
    return output;
  } catch (error) {
    try { fs.rmSync(output, { force: true }); } catch { /* best effort */ }
    throw error;
  }
}

async function synthesizeWindows(text: string, culture: string, output: string): Promise<void> {
  const script = [
    'Add-Type -AssemblyName System.Speech',
    '$text=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:JP_FLASHCARD_TTS_TEXT_B64))',
    '$culture=New-Object Globalization.CultureInfo($env:JP_FLASHCARD_TTS_CULTURE)',
    '$speaker=New-Object System.Speech.Synthesis.SpeechSynthesizer',
    '$voice=$speaker.GetInstalledVoices($culture)|Where-Object {$_.Enabled}|Select-Object -First 1',
    'if(-not $voice){throw "No offline voice is installed for $($culture.Name)."}',
    '$speaker.SelectVoice($voice.VoiceInfo.Name)',
    '$speaker.Rate=-1',
    '$speaker.SetOutputToWaveFile($env:JP_FLASHCARD_TTS_OUTPUT)',
    '$speaker.Speak($text)',
    '$speaker.Dispose()',
  ].join(';');
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    env: {
      ...process.env,
      JP_FLASHCARD_TTS_TEXT_B64: Buffer.from(text, 'utf8').toString('base64'),
      JP_FLASHCARD_TTS_CULTURE: culture,
      JP_FLASHCARD_TTS_OUTPUT: output,
    },
  });
}

async function synthesizeMac(text: string, culture: string, output: string): Promise<void> {
  const preferred: Record<string, string> = {
    'ja-JP': 'Kyoko',
    'zh-CN': 'Tingting',
    'ru-RU': 'Milena',
    'en-US': 'Samantha',
  };
  await run('say', ['-v', preferred[culture] ?? 'Samantha', '-r', '175', '-o', output, text]);
}

async function synthesizeLinux(text: string, culture: string, output: string): Promise<void> {
  const voice = culture.split('-', 1)[0].toLowerCase();
  try {
    await run('espeak-ng', ['-v', voice, '-s', '165', '-w', output, text]);
  } catch {
    await run('espeak', ['-v', voice, '-s', '165', '-w', output, text]);
  }
}

/** Generate a reusable local card asset using the operating system's offline voice. */
export async function synthesizeFlashcardAudio(
  text: string,
  language = 'ja',
): Promise<FlashcardAudioResult> {
  const sentence = text.trim().slice(0, 2_000);
  if (!sentence) return { ok: false, error: 'Card text is empty.' };
  const culture = cultureForLanguage(language);
  const extension = process.platform === 'darwin' ? 'aiff' : 'wav';
  const directory = path.join(audioRoot(), 'tts');
  fs.mkdirSync(directory, { recursive: true });
  const output = path.join(directory, `${fileHash(culture, sentence)}.${extension}`);
  if (fs.existsSync(output) && fs.statSync(output).size > 0) return { ok: true, path: output };
  try {
    if (process.platform === 'win32') await synthesizeWindows(sentence, culture, output);
    else if (process.platform === 'darwin') await synthesizeMac(sentence, culture, output);
    else await synthesizeLinux(sentence, culture, output);
    if (!fs.existsSync(output) || fs.statSync(output).size === 0) {
      throw new Error('The offline voice produced no audio.');
    }
    return { ok: true, path: output };
  } catch (error) {
    try { fs.rmSync(output, { force: true }); } catch { /* best effort */ }
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function readManagedAudio(filePath: string): FlashcardAudioResult {
  if (!isManagedFlashcardAudioPath(filePath) || !fs.existsSync(filePath)) {
    return { ok: false, error: 'Audio file is outside the managed flashcard library.' };
  }
  const extension = path.extname(filePath).toLowerCase();
  const mime = extension === '.mp3'
    ? 'audio/mpeg'
    : extension === '.aiff' || extension === '.aif'
      ? 'audio/aiff'
      : 'audio/wav';
  return { ok: true, dataUrl: `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}` };
}

export function registerFlashcardAudioIpc(): void {
  ipcMain.handle('flashcards:synthesizeAudio', (_event, text?: string, language?: string) => (
    synthesizeFlashcardAudio(typeof text === 'string' ? text : '', typeof language === 'string' ? language : 'ja')
  ));
  ipcMain.handle('flashcards:readAudio', (_event, filePath?: string) => (
    readManagedAudio(typeof filePath === 'string' ? filePath : '')
  ));
}

