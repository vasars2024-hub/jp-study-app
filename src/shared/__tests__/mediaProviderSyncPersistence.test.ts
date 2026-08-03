import { describe, expect, it } from 'vitest';
import {
  createMediaProviderSyncEnvelope,
  verifyAndReplayMediaProviderSyncEnvelope,
} from '../mediaProviderSyncPersistence';
import { MEDIA_PROVIDER_SYNC_RESOLUTION_VERSION } from '../mediaProviderSyncResolution';
import { MEDIA_PROVIDER_SYNC_CONTRACT_VERSION } from '../mediaProviderSynchronization';

const provider = (name: string) => ({
  id: 'provider-a', name, role: 'metadata', contentTypes: ['anime'], capabilities: { metadata: true },
});
const descriptor = (providerId: string, id: string, title: string) => ({
  providerId, providerItemId: id, title, contentType: 'anime',
});
const document = (name: string, title: string) => ({
  version: 1,
  providers: [
    provider(name),
    { ...provider('Provider B'), id: 'provider-b' },
  ],
  descriptors: [
    descriptor('provider-a', '1', title),
    descriptor('provider-b', 'foreign', 'Untouched'),
  ],
});
const providerDocument = (name: string, title: string) => ({
  version: 1,
  providers: [provider(name)],
  descriptors: [descriptor('provider-a', '1', title)],
});
const resolution = {
  resolutionVersion: MEDIA_PROVIDER_SYNC_RESOLUTION_VERSION,
  execution: 'disabled' as const,
  synchronization: {
    contractVersion: MEDIA_PROVIDER_SYNC_CONTRACT_VERSION,
    execution: 'disabled' as const,
    providerId: 'provider-a',
    baseline: { revision: 'base', document: providerDocument('Provider A', 'Original') },
    local: { revision: 'local', document: document('Local provider', 'Local') },
    incoming: {
      revision: 'incoming',
      document: {
        version: 1,
        providers: [provider('Incoming provider')],
        descriptors: [descriptor('provider-a', '1', 'Incoming')],
      },
    },
  },
  decisions: [
    { path: 'providers.provider-a', decision: 'keep-local' as const },
    { path: 'descriptors.provider-a.1', decision: 'accept-incoming' as const },
  ],
};

describe('provider synchronization persistence envelope', () => {
  it('creates byte-stable JSON envelopes and verifies deterministic replay', () => {
    const first = createMediaProviderSyncEnvelope(resolution);
    const second = createMediaProviderSyncEnvelope({
      ...resolution,
      decisions: [...resolution.decisions].reverse(),
    });

    expect(first.status).toBe('created');
    expect(JSON.stringify(first.envelope)).toBe(JSON.stringify(second.envelope));
    expect(first.envelope?.digest).toMatch(/^mpse_[0-9a-f]{8}$/);

    const replay = verifyAndReplayMediaProviderSyncEnvelope(
      JSON.parse(JSON.stringify(first.envelope)),
    );
    expect(replay).toMatchObject({
      status: 'verified',
      execution: 'disabled',
      canApply: false,
      partition: {
        providerId: 'provider-a',
        baselineRevision: 'base',
        localRevision: 'local',
        incomingRevision: 'incoming',
      },
    });
    expect(replay.resolvedDocument?.descriptors).toContainEqual(
      expect.objectContaining({ providerId: 'provider-b', providerItemId: 'foreign', title: 'Untouched' }),
    );
  });

  it.each([
    ['resolved document', (value: Record<string, unknown>) => {
      (value.resolvedDocument as { descriptors: Array<{ title: string }> }).descriptors[0].title = 'Tampered';
    }],
    ['audit', (value: Record<string, unknown>) => {
      (value.audit as Array<{ sequence: number }>)[0].sequence = 99;
    }],
    ['partition', (value: Record<string, unknown>) => {
      (value.partition as { providerId: string }).providerId = 'provider-b';
    }],
  ])('rejects tampered %s content before replay', (_label, mutate) => {
    const created = createMediaProviderSyncEnvelope(resolution);
    const tampered = JSON.parse(JSON.stringify(created.envelope)) as Record<string, unknown>;
    mutate(tampered);
    const result = verifyAndReplayMediaProviderSyncEnvelope(tampered);
    expect(result.status).toBe('invalid');
    expect(result.canApply).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ path: 'digest' }));
  });

  it('rejects unresolved proposals and all execution/apply enablement', () => {
    const unresolved = createMediaProviderSyncEnvelope({ ...resolution, decisions: [] });
    expect(unresolved.status).toBe('invalid');
    expect(unresolved.envelope).toBeNull();

    const created = createMediaProviderSyncEnvelope(resolution);
    const enabled = {
      ...created.envelope,
      execution: 'enabled',
      canApply: true,
    };
    const result = verifyAndReplayMediaProviderSyncEnvelope(enabled);
    expect(result.status).toBe('invalid');
    expect(result.issues.map((item) => item.path)).toEqual(['execution', 'canApply']);
  });

  it('detects replay drift even when a changed envelope has a copied digest shape', () => {
    const created = createMediaProviderSyncEnvelope(resolution);
    const changed = JSON.parse(JSON.stringify(created.envelope));
    changed.resolution.decisions.find(
      (item: { path: string }) => item.path === 'providers.provider-a',
    ).decision = 'accept-incoming';
    const result = verifyAndReplayMediaProviderSyncEnvelope(changed);
    expect(result.status).toBe('invalid');
    expect(result.resolvedDocument).toBeNull();
  });
});
