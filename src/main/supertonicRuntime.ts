/**
 * Small TypeScript adaptation of Supertone's official Node reference runtime.
 *
 * Upstream: https://github.com/supertone-inc/supertonic (MIT), helper.js at
 * commit 7e2804f96016a7028cb1ed627353c61c1e9dd281. The app keeps the model in
 * its managed asset store, so this version accepts explicit immutable paths
 * instead of requiring the files to share one directory.
 */
import fs from 'node:fs';
import * as ort from 'onnxruntime-node';
import type { SupertonicModelPaths } from '../shared/flashcardTtsProtocol';

interface SupertonicConfig {
  ae: { sample_rate: number; base_chunk_size: number };
  ttl: { chunk_compress_factor: number; latent_dim: number };
}

interface StoredTensor {
  dims: number[];
  data: unknown[];
}

interface StoredVoiceStyle {
  style_ttl: StoredTensor;
  style_dp: StoredTensor;
}

interface LoadedVoiceStyle {
  ttl: ort.Tensor;
  dp: ort.Tensor;
}

interface TextInputs {
  ids: bigint[];
  mask: Float32Array;
  length: number;
}

export interface SupertonicRuntime {
  sampleRate: number;
  synthesize(text: string, voicePath: string, steps: number, speed: number): Promise<Float32Array>;
}

function flattenNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return typeof value === 'number' ? [value] : [];
  const result: number[] = [];
  for (const item of value) result.push(...flattenNumbers(item));
  return result;
}

function floatTensor(data: Iterable<number>, dims: readonly number[]): ort.Tensor {
  return new ort.Tensor('float32', Float32Array.from(data), dims);
}

function int64Tensor(data: Iterable<bigint>, dims: readonly number[]): ort.Tensor {
  return new ort.Tensor('int64', BigInt64Array.from(data), dims);
}

function floats(value: ort.Tensor): Float32Array {
  if (value.type !== 'float32') throw new Error(`Supertonic returned ${value.type}; expected float32.`);
  return value.data as Float32Array;
}

function preprocessText(text: string): string {
  const replacements: Record<string, string> = {
    '–': '-', '‑': '-', '—': '-', '_': ' ',
    '“': '"', '”': '"', '‘': "'", '’': "'", '´': "'", '`': "'",
    '[': ' ', ']': ' ', '|': ' ', '/': ' ', '#': ' ', '→': ' ', '←': ' ',
    '@': ' at ',
  };
  let clean = text.normalize('NFKD').replace(
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu,
    '',
  );
  for (const [from, to] of Object.entries(replacements)) clean = clean.replaceAll(from, to);
  clean = clean
    .replace(/[♥☆♡©\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) throw new Error('Supertonic received empty text after normalization.');
  if (!/[.!?;:,'"')\]}…。」』】〉》›»]$/.test(clean)) clean += '。';
  return `<ja>${clean}</ja>`;
}

function textInputs(text: string, indexer: Readonly<Record<string, number>>): TextInputs {
  const wrapped = preprocessText(text);
  const codePoints = Array.from(wrapped, (character) => character.codePointAt(0) ?? 0);
  const ids = codePoints.map((codePoint) => {
    const indexed = indexer[String(codePoint)];
    if (!Number.isInteger(indexed)) {
      throw new Error(`Supertonic cannot encode Unicode code point U+${codePoint.toString(16).toUpperCase()}.`);
    }
    return BigInt(indexed);
  });
  return { ids, mask: Float32Array.from({ length: ids.length }, () => 1), length: ids.length };
}

function chunks(text: string, maxLength = 120): string[] {
  const characters = Array.from(text.trim());
  if (characters.length <= maxLength) return characters.length ? [characters.join('')] : [];
  const result: string[] = [];
  let current: string[] = [];
  for (const character of characters) {
    current.push(character);
    if (current.length >= maxLength || (current.length >= 40 && /[。！？!?]/u.test(character))) {
      result.push(current.join('').trim());
      current = [];
    }
  }
  if (current.length) result.push(current.join('').trim());
  return result.filter(Boolean);
}

function loadStyle(filePath: string): LoadedVoiceStyle {
  const stored = JSON.parse(fs.readFileSync(filePath, 'utf8')) as StoredVoiceStyle;
  const ttlDims = stored.style_ttl.dims;
  const dpDims = stored.style_dp.dims;
  if (ttlDims.length !== 3 || dpDims.length !== 3) throw new Error('Supertonic voice style dimensions are invalid.');
  return {
    ttl: floatTensor(flattenNumbers(stored.style_ttl.data), ttlDims),
    dp: floatTensor(flattenNumbers(stored.style_dp.data), dpDims),
  };
}

function normalNoise(length: number): Float32Array {
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 2) {
    const first = Math.max(1e-10, Math.random());
    const second = Math.random();
    const radius = Math.sqrt(-2 * Math.log(first));
    output[index] = radius * Math.cos(2 * Math.PI * second);
    if (index + 1 < length) output[index + 1] = radius * Math.sin(2 * Math.PI * second);
  }
  return output;
}

function concatenate(parts: readonly Float32Array[], silenceSamples: number): Float32Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
    + Math.max(0, parts.length - 1) * silenceSamples;
  const output = new Float32Array(total);
  let offset = 0;
  for (let index = 0; index < parts.length; index += 1) {
    output.set(parts[index], offset);
    offset += parts[index].length;
    if (index + 1 < parts.length) offset += silenceSamples;
  }
  return output;
}

/** Load the four ONNX sessions once; callers may reuse the returned runtime for a whole deck. */
export async function loadSupertonicRuntime(paths: SupertonicModelPaths): Promise<SupertonicRuntime> {
  const config = JSON.parse(fs.readFileSync(paths.config, 'utf8')) as SupertonicConfig;
  const indexer = JSON.parse(fs.readFileSync(paths.unicodeIndexer, 'utf8')) as Record<string, number>;
  const sessionOptions: ort.InferenceSession.SessionOptions = {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
  };
  const [durationPredictor, textEncoder, vectorEstimator, vocoder] = await Promise.all([
    ort.InferenceSession.create(paths.durationPredictor, sessionOptions),
    ort.InferenceSession.create(paths.textEncoder, sessionOptions),
    ort.InferenceSession.create(paths.vectorEstimator, sessionOptions),
    ort.InferenceSession.create(paths.vocoder, sessionOptions),
  ]);
  const styleCache = new Map<string, LoadedVoiceStyle>();
  const sampleRate = config.ae.sample_rate;
  const chunkSize = config.ae.base_chunk_size * config.ttl.chunk_compress_factor;
  const latentChannels = config.ttl.latent_dim * config.ttl.chunk_compress_factor;

  const infer = async (
    text: string,
    voicePath: string,
    steps: number,
    speed: number,
  ): Promise<Float32Array> => {
    const input = textInputs(text, indexer);
    const style = styleCache.get(voicePath) ?? loadStyle(voicePath);
    styleCache.set(voicePath, style);
    const textMask = floatTensor(input.mask, [1, 1, input.length]);
    const textIds = int64Tensor(input.ids, [1, input.length]);
    const durationResult = await durationPredictor.run({
      text_ids: textIds,
      style_dp: style.dp,
      text_mask: textMask,
    });
    const durationOutput = durationResult.duration;
    if (!(durationOutput instanceof ort.Tensor)) throw new Error('Supertonic duration output is missing.');
    const durationSec = Math.max(0.05, floats(durationOutput)[0] / speed);
    const textResult = await textEncoder.run({
      text_ids: textIds,
      style_ttl: style.ttl,
      text_mask: textMask,
    });
    const textEmbedding = textResult.text_emb;
    if (!(textEmbedding instanceof ort.Tensor)) throw new Error('Supertonic text embedding is missing.');

    const wavSamples = Math.floor(durationSec * sampleRate);
    const latentLength = Math.floor((wavSamples + chunkSize - 1) / chunkSize);
    const latentDims = [1, latentChannels, latentLength] as const;
    let latent = normalNoise(latentChannels * latentLength);
    const validLatents = Math.floor((wavSamples + chunkSize - 1) / chunkSize);
    const latentMaskData = Float32Array.from(
      { length: latentLength },
      (_unused, index) => index < validLatents ? 1 : 0,
    );
    const latentMask = floatTensor(latentMaskData, [1, 1, latentLength]);
    const boundedSteps = Math.max(1, Math.min(20, Math.round(steps)));
    const totalStep = floatTensor([boundedSteps], [1]);
    for (let step = 0; step < boundedSteps; step += 1) {
      const estimate = await vectorEstimator.run({
        noisy_latent: floatTensor(latent, latentDims),
        text_emb: textEmbedding,
        style_ttl: style.ttl,
        text_mask: textMask,
        latent_mask: latentMask,
        total_step: totalStep,
        current_step: floatTensor([step], [1]),
      });
      const denoised = estimate.denoised_latent;
      if (!(denoised instanceof ort.Tensor)) throw new Error('Supertonic diffusion output is missing.');
      latent = Float32Array.from(floats(denoised));
    }
    const vocoderResult = await vocoder.run({ latent: floatTensor(latent, latentDims) });
    const audio = vocoderResult.wav_tts;
    if (!(audio instanceof ort.Tensor)) throw new Error('Supertonic audio output is missing.');
    return Float32Array.from(floats(audio));
  };

  return {
    sampleRate,
    async synthesize(text, voicePath, steps, speed) {
      const pieces: Float32Array[] = [];
      for (const piece of chunks(text)) pieces.push(await infer(piece, voicePath, steps, speed));
      if (!pieces.length) throw new Error('Supertonic received no speakable text.');
      return concatenate(pieces, Math.floor(sampleRate * 0.3));
    },
  };
}

export function encodePcmWav(audio: Float32Array, sampleRate: number): Buffer {
  const dataSize = audio.length * 2;
  const output = Buffer.allocUnsafe(44 + dataSize);
  output.write('RIFF', 0);
  output.writeUInt32LE(36 + dataSize, 4);
  output.write('WAVE', 8);
  output.write('fmt ', 12);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36);
  output.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < audio.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, audio[index]));
    output.writeInt16LE(Math.round(sample * 32_767), 44 + index * 2);
  }
  return output;
}
