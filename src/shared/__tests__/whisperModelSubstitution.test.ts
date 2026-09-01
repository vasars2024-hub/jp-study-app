/**
 * The silent model downgrade, made visible.
 *
 * `whisperModelForCpu` substitutes `Xenova/whisper-base` for kotoba-whisper and
 * whisper-large-v3-turbo on the WASM path, because their fp32 encoders carry
 * external ONNX data the browser runtime cannot mount. That substitution is
 * correct — the alternative is a 320 MB download that then fails to transcribe.
 * What was wrong is that it was SILENT: `whisperWorker.ts` posts a
 * `model-fallback` status and, measured 2026-09-01, nothing in `src/` listened
 * to it. A machine without a usable WebGPU adapter therefore produced
 * whisper-base output while Settings still said kotoba-whisper, and the user had
 * no way to learn which model wrote their subtitles.
 *
 * This suite pins the two halves that make it visible: the substitution actually
 * happens for the models it claims, and the track name carries it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { whisperTrackLabel } from '../transcriptionIpc';
import {
  WHISPER_CPU_FALLBACK_MODEL,
  whisperModelForCpu,
} from '../../renderer/whisperRuntimeProfile';
import { WHISPER_MODEL_SPECS, defaultWhisperTier, whisperSpec } from '../whisperModels';

describe('the WASM path substitutes, and it substitutes for real models', () => {
  it('downgrades exactly the two models whose fp32 encoder cannot be mounted', () => {
    const downgraded = WHISPER_MODEL_SPECS.filter(
      (spec) => whisperModelForCpu(spec.hfId) !== spec.hfId,
    ).map((spec) => spec.id);
    expect(downgraded).toEqual(['kotoba-whisper', 'whisper-large-v3-turbo']);
  });

  it("the Japanese DEFAULT is one of them — this is not an exotic case", () => {
    // The whole reason this matters: a user who changes nothing gets the tier
    // that is silently replaced.
    const hfId = whisperSpec(defaultWhisperTier('ja')).hfId;
    expect(whisperModelForCpu(hfId)).toBe(WHISPER_CPU_FALLBACK_MODEL);
  });

  it('control: a model that CAN run on wasm is left alone', () => {
    expect(whisperModelForCpu('Xenova/whisper-small')).toBe('Xenova/whisper-small');
    expect(whisperModelForCpu(WHISPER_CPU_FALLBACK_MODEL)).toBe(WHISPER_CPU_FALLBACK_MODEL);
  });
});

describe('the track name says which model wrote it', () => {
  it('is unchanged when no substitution happened', () => {
    // Existing rows and the fusion/dedup logic key off this exact string.
    expect(whisperTrackLabel('ja')).toBe('Whisper (ja)');
    expect(
      whisperTrackLabel('ja', {
        requested: 'Xenova/whisper-small',
        used: 'Xenova/whisper-small',
      }),
    ).toBe('Whisper (ja)');
  });

  it('names the model that actually ran when one was substituted', () => {
    expect(
      whisperTrackLabel('ja', {
        requested: 'onnx-community/kotoba-whisper-v2.2-ONNX',
        used: WHISPER_CPU_FALLBACK_MODEL,
      }),
    ).toBe('Whisper (ja) · whisper-base');
  });

  it('prints the model that RAN, never the one that was asked for', () => {
    // Restating the request here is the lie this exists to remove.
    const label = whisperTrackLabel('zh', {
      requested: 'onnx-community/whisper-large-v3-turbo',
      used: WHISPER_CPU_FALLBACK_MODEL,
    });
    expect(label).toContain('whisper-base');
    expect(label).not.toContain('large-v3-turbo');
  });
});

describe('the worker announcement now has a listener', () => {
  const read = (rel: string): string =>
    readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

  it('whisperWorker still posts the status this depends on', () => {
    // If the message is ever renamed, the reader below goes quietly dead and
    // the substitution becomes silent again. Fail here instead.
    expect(read('renderer/whisperWorker.ts')).toContain("status: 'model-fallback'");
  });

  it('transcribePcm reads it and carries it onto the result', () => {
    const source = read('renderer/whisperTranscribePcm.ts');
    expect(source).toContain("message.status === 'model-fallback'");
    expect(source).toContain('modelSubstitution');
  });

  it('the queue puts it on the artifact rather than dropping it', () => {
    const source = read('main/transcriptionJobs.ts');
    expect(source).toContain('whisperTrackLabel(job.lang, modelSubstitution)');
    // And the old hardcoded label is gone, or the helper would never run.
    expect(source).not.toContain('label: `Whisper (${job.lang})`');
  });
});
