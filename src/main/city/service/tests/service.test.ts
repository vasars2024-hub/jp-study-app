// @vitest-environment node
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { createEnvelope } from '../../engine/state';
import { InterpretedLearningInput, NoctisStateEnvelope } from '../../engine/types';
import { createInitialState } from '../../engine';
import { CITY_WIRE_VERSION } from '../../ipc/channels';
import { parseCitySessionPacket } from '../../ipc/validation';
import { CityClock, CityService } from '../CityService';
import { CityLoadResult, CityStorage, createFileCityStorage } from '../persistence';

function studyInput(): InterpretedLearningInput {
  return {
    focusDuration: 20,
    profile: {
      conceptualDepth: 0.6,
      retention: 0.7,
      disciplinaryExposure: 0.1,
      interdisciplinaryConnection: 0.02,
      sustainedAttention: 0.5,
      mastery: 0.4,
      curiosity: 0.3,
      revisionStrength: 0.2,
      difficulty: 0.4,
      novelty: 0.3,
    },
    pathways: { brine: 0.04, glucans: 0.8, catalysts: 0.16 },
    difficulty: 0.4,
    difficultyConfidence: 'inferred',
    consistency: 2,
    completion: false,
  };
}

class MemoryStorage implements CityStorage {
  envelope: NoctisStateEnvelope | null = null;
  failNext = false;

  load(): CityLoadResult {
    return { envelope: this.envelope, source: this.envelope ? 'primary' : 'missing' };
  }

  save(state: ReturnType<typeof createInitialState>, savedAt: number, ids: string[]): void {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('write failed');
    }
    this.envelope = JSON.parse(JSON.stringify(createEnvelope(state, savedAt, ids))) as NoctisStateEnvelope;
  }
}

function clock(values: number[]): CityClock {
  let index = 0;
  return {
    now: () => values[Math.min(index++, values.length - 1)],
    seed: () => 17,
  };
}

const temporaryRoots: string[] = [];
afterEach(() => {
  temporaryRoots.forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  temporaryRoots.length = 0;
});

describe('CityService state ownership', () => {
  it('runs exactly one offline checkpoint and clamps clock rollback', () => {
    const storage = new MemoryStorage();
    storage.envelope = createEnvelope(createInitialState(9), 2000, []);
    const service = CityService.init(() => undefined, clock([1000]), storage);
    expect(service.getState().state.evaluation).toBe(1);
    expect(storage.envelope && storage.envelope.savedAt).toBe(1000);
  });

  it('serializes concurrent calls and broadcasts once per committed write', async () => {
    const storage = new MemoryStorage();
    const broadcasts: number[] = [];
    const service = CityService.init(
      (message) => broadcasts.push(message.state.revision),
      clock([1000, 2000, 3000]),
      storage,
    );
    const results = await Promise.all([
      service.recordSession('session:0001', studyInput()),
      service.recordSession('session:0002', studyInput()),
    ]);
    expect(results[1].state.revision).toBe(results[0].state.revision + 1);
    expect(broadcasts).toHaveLength(2);
  });

  it('does not commit or broadcast a failed write', async () => {
    const storage = new MemoryStorage();
    let broadcasts = 0;
    const service = CityService.init(() => { broadcasts += 1; }, clock([1000, 2000]), storage);
    const revision = service.getState().state.revision;
    storage.failNext = true;
    await expect(service.recordSession('session:fail1', studyInput())).rejects.toThrow('write failed');
    expect(service.getState().state.revision).toBe(revision);
    expect(broadcasts).toBe(0);
  });

  it('persists idempotency across restart', async () => {
    const storage = new MemoryStorage();
    const first = CityService.init(() => undefined, clock([1000, 2000]), storage);
    const applied = await first.recordSession('session:same1', studyInput());
    let broadcasts = 0;
    const restarted = CityService.init(() => { broadcasts += 1; }, clock([3000]), storage);
    const duplicate = await restarted.recordSession('session:same1', studyInput());
    expect(duplicate.state.learning.sessions).toBe(applied.state.learning.sessions);
    expect(broadcasts).toBe(0);
  });
});

describe('City persistence and wire validation', () => {
  it('recovers a validated backup when the primary is corrupt', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'noctis-storage-'));
    temporaryRoots.push(root);
    const storage = createFileCityStorage(root);
    storage.save(createInitialState(11), 1000, ['session:back1']);
    const primary = path.join(root, 'noctis-state.json');
    fs.copyFileSync(primary, `${primary}.bak`);
    fs.writeFileSync(primary, '{broken', 'utf-8');
    const loaded = storage.load();
    expect(loaded.source).toBe('backup');
    expect(loaded.envelope && loaded.envelope.state.seed).toBe(11);
  });

  it('replaces a primary atomically and retains the prior valid backup', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'noctis-storage-'));
    temporaryRoots.push(root);
    const storage = createFileCityStorage(root);
    storage.save(createInitialState(21), 1000, []);
    storage.save(createInitialState(22), 2000, ['session:save2']);
    const loaded = storage.load();
    expect(loaded.source).toBe('primary');
    expect(loaded.envelope && loaded.envelope.state.seed).toBe(22);
    const backup = JSON.parse(fs.readFileSync(path.join(root, 'noctis-state.json.bak'), 'utf-8')) as NoctisStateEnvelope;
    expect(backup.state.seed).toBe(21);
  });

  it('strictly rejects unknown, non-finite, and privacy-leaking fields', () => {
    const valid = {
      schemaVersion: CITY_WIRE_VERSION,
      idempotencyKey: 'session:valid1',
      input: studyInput(),
    };
    expect(parseCitySessionPacket(valid)).toEqual(valid);
    expect(() => parseCitySessionPacket({ ...valid, title: 'private' })).toThrow();
    expect(() => parseCitySessionPacket({
      ...valid,
      input: { ...valid.input, focusDuration: Number.NaN },
    })).toThrow();
  });
});
