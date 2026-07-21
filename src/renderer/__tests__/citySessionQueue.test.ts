// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { CITY_WIRE_VERSION, CitySessionPacket, CityStateMessage } from '../../main/city/ipc/channels';
import { createInitialState } from '../../main/city/engine';
import {
  CITY_SESSION_STORAGE_KEY,
  CitySessionKeyValueStore,
  CityTelemetrySnapshot,
  DurableCitySessionQueue,
} from '../citySessionQueue';

class MemoryKeyValueStore implements CitySessionKeyValueStore {
  values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) || null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const telemetry: CityTelemetrySnapshot = {
  streak: 4,
  knowledgeCounts: { learning: 8, familiar: 12, known: 20 },
  savedCount: 3,
  userLevel: 2,
  levelCoverage: 0.35,
};

function response(): CityStateMessage {
  return { schemaVersion: CITY_WIRE_VERSION, state: createInitialState(1), flags: [] };
}

describe('durable city telemetry queue', () => {
  it('supports a flashcard-only meaningful window', async () => {
    const sent: CitySessionPacket[] = [];
    const queue = new DurableCitySessionQueue(
      new MemoryKeyValueStore(),
      async (packet) => { sent.push(packet); return response(); },
      'client-flashcards',
    );
    await queue.flush(telemetry);
    queue.addFlashcard();
    await queue.flush(telemetry);
    expect(sent).toHaveLength(1);
    expect(sent[0].input.focusDuration).toBe(0);
    expect(sent[0].input.profile.revisionStrength).toBeGreaterThan(0);
  });

  it('retains a failed packet and retries the same id after restart', async () => {
    const store = new MemoryKeyValueStore();
    const firstIds: string[] = [];
    const first = new DurableCitySessionQueue(
      store,
      async (packet) => { firstIds.push(packet.idempotencyKey); throw new Error('offline'); },
      'client-retry',
    );
    await first.flush(telemetry);
    first.addReading(70, 900, 'private-book-id');
    expect(await first.flush(telemetry)).toBe(false);
    expect(first.pendingCount()).toBe(1);

    const retriedIds: string[] = [];
    const restarted = new DurableCitySessionQueue(
      store,
      async (packet) => { retriedIds.push(packet.idempotencyKey); return response(); },
      'ignored-new-client',
    );
    expect(await restarted.retry()).toBe(true);
    expect(retriedIds).toEqual(firstIds);
    expect(restarted.pendingCount()).toBe(0);
  });

  it('stores raw identifiers locally but never places them in the wire packet', async () => {
    const store = new MemoryKeyValueStore();
    const sent: CitySessionPacket[] = [];
    const queue = new DurableCitySessionQueue(
      store,
      async (packet) => { sent.push(packet); return response(); },
      'client-privacy',
    );
    await queue.flush(telemetry);
    queue.addReading(70, 1200, 'book-secret-42');
    await queue.flush(telemetry);
    expect(store.getItem(CITY_SESSION_STORAGE_KEY)).toContain('book-secret-42');
    const wire = JSON.stringify(sent[0]);
    expect(wire).not.toContain('book-secret-42');
    expect(wire).not.toContain('title');
    expect(wire).not.toContain('word');
    expect(wire).not.toContain('timestamp');
  });

  it('persists milestone-only input before delivery', async () => {
    const store = new MemoryKeyValueStore();
    let capturedDuringSend = '';
    const queue = new DurableCitySessionQueue(
      store,
      async () => {
        capturedDuringSend = store.getItem(CITY_SESSION_STORAGE_KEY) || '';
        return response();
      },
      'client-milestone',
    );
    await queue.flush(telemetry);
    queue.addAchievement();
    await queue.flush(telemetry);
    expect(capturedDuringSend).toContain('idempotencyKey');
    expect(capturedDuringSend).toContain('"completion":true');
  });
});
