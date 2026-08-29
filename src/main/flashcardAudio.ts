import { app, ipcMain } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import type { FlashcardAudioFailure } from '../shared/flashcardAudioMessages';
import {
  resolveVoice,
  voiceLanguageOf,
  type FlashcardVoice,
  type FlashcardVoiceInventory,
  type VoiceResolution,
} from '../shared/flashcardVoices';

const ffmpegPath = ffmpegStatic as unknown as string;

/**
 * The classification lives in `shared/` because the renderer picks the wording
 * from it; main is the only side that can see what the synthesizer printed, so
 * main is the side that assigns it. `error` stays the diagnostic detail and stops
 * being the user-facing message.
 */
export type { FlashcardAudioFailure };

export interface FlashcardAudioResult {
  ok: boolean;
  path?: string;
  dataUrl?: string;
  error?: string;
  reason?: FlashcardAudioFailure;
  /** The voice that actually spoke, so the caller can say so instead of guessing. */
  voice?: string;
  /**
   * How that voice was arrived at. `language` means the saved choice was gone
   * and a sibling spoke instead — a result the UI has to disclose, because the
   * card sounds different from the one before it for a reason the user set.
   */
  voiceResolution?: VoiceResolution;
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

/**
 * Delete managed clips the deck no longer references.
 *
 * Two callers, one guard: the renderer removing a transcript batch, and a
 * re-transcription whose sentences changed — a clip is named by a hash of its
 * text and range, so changed text orphans the old file forever rather than
 * overwriting it. Anything outside the managed root is counted as `skipped`,
 * never unlinked: `paths` reaches here from renderer storage, and a bad row
 * must not turn into an arbitrary delete.
 */
export function releaseFlashcardAudio(paths: readonly string[]): { removed: number; skipped: number } {
  let removed = 0;
  let skipped = 0;
  for (const filePath of paths) {
    if (typeof filePath !== 'string' || !filePath || !isManagedFlashcardAudioPath(filePath)) {
      skipped += 1;
      continue;
    }
    try {
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { force: true });
        removed += 1;
      }
    } catch {
      // A clip held open by a playing <audio> is reclaimed on the next pass.
      skipped += 1;
    }
  }
  return { removed, skipped };
}

/**
 * Reduce one media's clip directory to exactly the batch that is current.
 *
 * Called after a batch is built, so a re-run does not accumulate a directory of
 * clips for sentences no card mentions any more.
 */
export function pruneMediaClips(
  mediaId: string,
  keep: readonly (string | undefined)[],
): { removed: number; bytes: number } {
  const directory = path.join(audioRoot(), 'media', mediaId.replace(/[^a-zA-Z0-9_-]/g, ''));
  if (!fs.existsSync(directory)) return { removed: 0, bytes: 0 };
  const kept = new Set(
    keep.filter((entry): entry is string => Boolean(entry)).map((entry) => path.resolve(entry)),
  );
  let removed = 0;
  let bytes = 0;
  for (const name of fs.readdirSync(directory)) {
    const filePath = path.join(directory, name);
    if (kept.has(path.resolve(filePath))) continue;
    try {
      const size = fs.statSync(filePath).size;
      fs.rmSync(filePath, { force: true });
      removed += 1;
      bytes += size;
    } catch {
      // Best effort: a locked file stays until the next prune.
    }
  }
  return { removed, bytes };
}

export interface FlashcardAudioBucket {
  files: number;
  bytes: number;
}

export interface FlashcardAudioUsage {
  /** Sentence clips cut from a media file, under `media/<mediaId>/`. */
  clips: FlashcardAudioBucket;
  /** Everything else the managed root holds — synthesized speech. */
  speech: FlashcardAudioBucket;
  total: FlashcardAudioBucket;
}

/**
 * Every managed file, with the sub-root it belongs to.
 *
 * Asynchronous throughout: a long-running deck's audio directory is thousands
 * of small files, and a synchronous walk of it would be a visible stall on the
 * main event loop for anyone who has been mining for a while.
 */
async function walkManagedAudio(): Promise<Array<{ path: string; bytes: number; clip: boolean }>> {
  const root = audioRoot();
  const clipRoot = path.resolve(root, 'media');
  const found: Array<{ path: string; bytes: number; clip: boolean }> = [];
  const visit = async (directory: string): Promise<void> => {
    let entries: Awaited<ReturnType<typeof fs.promises.readdir>>;
    try {
      entries = await fs.promises.readdir(directory, { withFileTypes: true });
    } catch {
      return; // Absent root, or a directory removed mid-walk.
    }
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(full);
        continue;
      }
      try {
        found.push({
          path: full,
          bytes: (await fs.promises.stat(full)).size,
          clip: !path.relative(clipRoot, path.resolve(full)).startsWith('..'),
        });
      } catch {
        // A file removed between readdir and stat is simply already gone.
      }
    }
  };
  await visit(root);
  return found;
}

/** What card audio currently costs on disk, split by what produced it. */
export async function flashcardAudioUsage(): Promise<FlashcardAudioUsage> {
  const empty = (): FlashcardAudioBucket => ({ files: 0, bytes: 0 });
  const usage: FlashcardAudioUsage = { clips: empty(), speech: empty(), total: empty() };
  for (const file of await walkManagedAudio()) {
    const bucket = file.clip ? usage.clips : usage.speech;
    bucket.files += 1;
    bucket.bytes += file.bytes;
    usage.total.files += 1;
    usage.total.bytes += file.bytes;
  }
  return usage;
}

/**
 * Delete managed audio no card points at any more.
 *
 * The deck lives in renderer storage, so the reference set has to come from
 * there; main contributes the half the renderer cannot see — which files exist.
 * Only the managed root is walked, so a visual-novel capture or any other
 * outside path a card references is never a candidate in the first place.
 */
export async function sweepUnreferencedFlashcardAudio(
  referenced: readonly string[],
): Promise<{ removed: number; bytes: number; kept: number }> {
  const keep = new Set(
    referenced
      .filter((entry): entry is string => typeof entry === 'string' && Boolean(entry))
      .map((entry) => path.resolve(entry)),
  );
  let removed = 0;
  let bytes = 0;
  let kept = 0;
  for (const file of await walkManagedAudio()) {
    if (keep.has(path.resolve(file.path))) {
      kept += 1;
      continue;
    }
    try {
      await fs.promises.rm(file.path, { force: true });
      removed += 1;
      bytes += file.bytes;
    } catch {
      kept += 1;
    }
  }
  return { removed, bytes, kept };
}

/** A spawn failure that carries which classification the caller should report. */
class SynthesizerError extends Error {
  constructor(message: string, readonly reason: FlashcardAudioFailure) {
    super(message);
    this.name = 'SynthesizerError';
  }
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
    // The binary is absent, not broken. Distinguished here because it is the only
    // failure a user fixes by installing something rather than by retrying.
    child.on('error', (error: NodeJS.ErrnoException) => reject(
      error.code === 'ENOENT'
        ? new SynthesizerError(`${path.basename(command)} is not installed.`, 'no-synthesizer')
        : error,
    ));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${path.basename(command)} exited with code ${code}`));
    });
  });
}

/** Same spawn contract as `run`, but the answer is what the command printed. */
function capture(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', (error: NodeJS.ErrnoException) => reject(
      error.code === 'ENOENT'
        ? new SynthesizerError(`${path.basename(command)} is not installed.`, 'no-synthesizer')
        : error,
    ));
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `${path.basename(command)} exited with code ${code}`));
    });
  });
}

/**
 * Windows lists voices as JSON, which is the only back end that needs no
 * scraping. A single installed voice serialises as an object rather than an
 * array, which is the shape that would otherwise silently produce nothing.
 */
export function parseWindowsVoices(stdout: string): FlashcardVoice[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim() || 'null');
  } catch {
    return [];
  }
  const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  const out: FlashcardVoice[] = [];
  for (const row of rows) {
    const entry = row as { Name?: unknown; Culture?: unknown };
    const name = typeof entry?.Name === 'string' ? entry.Name.trim() : '';
    if (!name) continue;
    const culture = typeof entry?.Culture === 'string' ? entry.Culture.trim() : '';
    out.push({ id: name, name, culture, language: voiceLanguageOf(culture) });
  }
  return out;
}

/** `say -v '?'` prints `Kyoko               ja_JP    # …`, one voice per line. */
export function parseMacVoices(stdout: string): FlashcardVoice[] {
  const out: FlashcardVoice[] = [];
  for (const line of stdout.split('\n')) {
    const match = /^(.+?)\s{2,}([A-Za-z]{2}[-_][A-Za-z0-9]+)\s/.exec(line);
    if (!match) continue;
    const name = match[1].trim();
    const culture = match[2].replace('_', '-');
    out.push({ id: name, name, culture, language: voiceLanguageOf(culture) });
  }
  return out;
}

/**
 * `espeak-ng --voices` prints a fixed-width table whose first row is a header.
 * The voice the synthesizer accepts back is column 4 (`VoiceName`), not the
 * language code, which is why the id and the culture differ on this platform.
 */
export function parseLinuxVoices(stdout: string): FlashcardVoice[] {
  const out: FlashcardVoice[] = [];
  for (const line of stdout.split('\n')) {
    const cells = line.trim().split(/\s+/);
    if (cells.length < 4 || cells[0] === 'Pty' || !/^\d+$/.test(cells[0])) continue;
    const culture = cells[1];
    const name = cells[3];
    if (!name) continue;
    out.push({ id: name, name, culture, language: voiceLanguageOf(culture) });
  }
  return out;
}

let voiceCache: FlashcardVoiceInventory | null = null;

/**
 * Every offline voice this machine can speak with.
 *
 * Cached because enumerating spawns a process — on Windows a whole PowerShell —
 * and a settings panel that re-reads on every render would spawn one per
 * keystroke. `refresh` is how a user who just installed a language pack sees it
 * without restarting the app, which is the only reason the cache is escapable.
 */
export async function listFlashcardVoices(refresh = false): Promise<FlashcardVoiceInventory> {
  if (voiceCache && !refresh) return voiceCache;
  const platform = process.platform;
  try {
    let voices: FlashcardVoice[];
    if (platform === 'win32') {
      const script = [
        'Add-Type -AssemblyName System.Speech',
        '$s=New-Object System.Speech.Synthesis.SpeechSynthesizer',
        '$s.GetInstalledVoices()|Where-Object {$_.Enabled}|ForEach-Object {'
          + '[pscustomobject]@{Name=$_.VoiceInfo.Name;Culture=$_.VoiceInfo.Culture.Name}'
          + '}|ConvertTo-Json -Compress',
      ].join(';');
      const encoded = Buffer.from(script, 'utf16le').toString('base64');
      voices = parseWindowsVoices(
        await capture('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]),
      );
    } else if (platform === 'darwin') {
      voices = parseMacVoices(await capture('say', ['-v', '?']));
    } else {
      voices = parseLinuxVoices(
        await capture('espeak-ng', ['--voices']).catch(() => capture('espeak', ['--voices'])),
      );
    }
    voiceCache = { ok: true, voices, platform };
  } catch (error) {
    // An inventory that failed is reported as failed. Returning an empty list
    // would be indistinguishable from a machine with no voices at all, and the
    // advice the user needs is the opposite in each case.
    voiceCache = {
      ok: false,
      voices: [],
      platform,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  return voiceCache;
}

/**
 * Classify what a failed synthesis run said. Every platform's "no voice for this
 * language" wording is distinct and none of them is a machine-readable code, so
 * this is a match on the three messages the three back ends actually produce —
 * the PowerShell `throw` in `synthesizeWindows` below is one of them, and is ours.
 */
export function classifySynthesisFailure(message: string): FlashcardAudioFailure {
  const text = message.toLowerCase();
  if (text.includes('no offline voice is installed')) return 'no-voice';
  if (text.includes('voice') && (text.includes('not found') || text.includes('not installed'))) {
    return 'no-voice';
  }
  if (text.includes('is not installed') || text.includes('enoent')) return 'no-synthesizer';
  return 'failed';
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

async function synthesizeWindows(
  text: string,
  culture: string,
  output: string,
  voiceName: string,
): Promise<void> {
  const script = [
    'Add-Type -AssemblyName System.Speech',
    '$text=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:JP_FLASHCARD_TTS_TEXT_B64))',
    '$culture=New-Object Globalization.CultureInfo($env:JP_FLASHCARD_TTS_CULTURE)',
    '$speaker=New-Object System.Speech.Synthesis.SpeechSynthesizer',
    '$wanted=$env:JP_FLASHCARD_TTS_VOICE',
    '$installed=$speaker.GetInstalledVoices($culture)|Where-Object {$_.Enabled}',
    '$voice=if($wanted){$installed|Where-Object {$_.VoiceInfo.Name -eq $wanted}|Select-Object -First 1}'
      + 'else{$installed|Select-Object -First 1}',
    'if(-not $voice){$voice=$installed|Select-Object -First 1}',
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
      JP_FLASHCARD_TTS_VOICE: voiceName,
    },
  });
}

async function synthesizeMac(
  text: string,
  culture: string,
  output: string,
  voiceName: string,
): Promise<void> {
  // The table is the fallback for a machine whose voice list could not be read;
  // a resolved choice always wins over it.
  const preferred: Record<string, string> = {
    'ja-JP': 'Kyoko',
    'zh-CN': 'Tingting',
    'ru-RU': 'Milena',
    'en-US': 'Samantha',
  };
  await run('say', ['-v', voiceName || preferred[culture] || 'Samantha', '-r', '175', '-o', output, text]);
}

async function synthesizeLinux(
  text: string,
  culture: string,
  output: string,
  voiceName: string,
): Promise<void> {
  const voice = voiceName || culture.split('-', 1)[0].toLowerCase();
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
  preferredVoiceId?: string,
): Promise<FlashcardAudioResult> {
  const sentence = text.trim().slice(0, 2_000);
  if (!sentence) return { ok: false, error: 'Card text is empty.', reason: 'empty-text' };
  const culture = cultureForLanguage(language);

  // Resolving before spawning is what makes "no Japanese voice at all" a
  // reportable state rather than a synthesizer error the user has to interpret.
  // An inventory that could not be read is not treated as an empty one: the run
  // proceeds and the back end's own selection decides, as it always did.
  const inventory = await listFlashcardVoices();
  let chosen: FlashcardVoice | null = null;
  let resolution: VoiceResolution = 'preferred';
  if (inventory.ok && inventory.voices.length) {
    const resolved = resolveVoice(inventory.voices, culture, preferredVoiceId);
    if (resolved.resolution === 'none') {
      return {
        ok: false,
        error: `No offline voice is installed for ${culture}.`,
        reason: 'no-voice',
      };
    }
    chosen = resolved.voice;
    resolution = resolved.resolution;
  }

  const extension = process.platform === 'darwin' ? 'aiff' : 'wav';
  const directory = path.join(audioRoot(), 'tts');
  fs.mkdirSync(directory, { recursive: true });
  // The voice is part of the cache key: two voices reading one sentence are two
  // different files, and sharing a path would hand back the wrong one forever.
  const output = path.join(directory, `${fileHash(culture, chosen?.id ?? '', sentence)}.${extension}`);
  if (fs.existsSync(output) && fs.statSync(output).size > 0) {
    return { ok: true, path: output, voice: chosen?.name, voiceResolution: resolution };
  }
  try {
    const voiceId = chosen?.id ?? '';
    if (process.platform === 'win32') await synthesizeWindows(sentence, culture, output, voiceId);
    else if (process.platform === 'darwin') await synthesizeMac(sentence, culture, output, voiceId);
    else await synthesizeLinux(sentence, culture, output, voiceId);
    if (!fs.existsSync(output) || fs.statSync(output).size === 0) {
      throw new Error('The offline voice produced no audio.');
    }
    return { ok: true, path: output, voice: chosen?.name, voiceResolution: resolution };
  } catch (error) {
    try { fs.rmSync(output, { force: true }); } catch { /* best effort */ }
    const message = error instanceof Error ? error.message : String(error);
    const reason = error instanceof SynthesizerError
      ? error.reason
      : classifySynthesisFailure(message);
    return { ok: false, error: message, reason };
  }
}

function readManagedAudio(filePath: string): FlashcardAudioResult {
  if (!isManagedFlashcardAudioPath(filePath) || !fs.existsSync(filePath)) {
    return {
      ok: false,
      error: 'Audio file is outside the managed flashcard library.',
      reason: 'not-managed',
    };
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
  ipcMain.handle('flashcards:synthesizeAudio', (_event, text?: string, language?: string, voice?: string) => (
    synthesizeFlashcardAudio(
      typeof text === 'string' ? text : '',
      typeof language === 'string' ? language : 'ja',
      typeof voice === 'string' ? voice : undefined,
    )
  ));
  ipcMain.handle('flashcards:listVoices', (_event, refresh?: unknown) => (
    listFlashcardVoices(refresh === true)
  ));
  ipcMain.handle('flashcards:readAudio', (_event, filePath?: string) => (
    readManagedAudio(typeof filePath === 'string' ? filePath : '')
  ));
  ipcMain.handle('flashcards:releaseAudio', (_event, paths?: unknown) => (
    releaseFlashcardAudio(Array.isArray(paths) ? paths.filter((entry): entry is string => typeof entry === 'string') : [])
  ));
  ipcMain.handle('flashcards:audioUsage', () => flashcardAudioUsage());
  ipcMain.handle('flashcards:audioSweep', (_event, referenced?: unknown) => (
    sweepUnreferencedFlashcardAudio(
      Array.isArray(referenced) ? referenced.filter((entry): entry is string => typeof entry === 'string') : [],
    )
  ));
}

