import { describe, expect, it } from 'vitest';
import {
  MEDIA_PROVIDER_SYNC_RESOLUTION_VERSION,
  resolveMediaProviderSynchronization,
} from '../mediaProviderSyncResolution';
import { MEDIA_PROVIDER_SYNC_CONTRACT_VERSION } from '../mediaProviderSynchronization';
import { normalizeMediaProvidersDocument } from '../mediaProviders';

const provider = (name = 'Provider A') => ({
  id: 'provider-a',
  name,
  role: 'metadata',
  contentTypes: ['anime'],
  capabilities: { metadata: true },
});
const descriptor = (id: string, title: string) => ({
  providerId: 'provider-a',
  providerItemId: id,
  title,
  contentType: 'anime',
});
const snapshot = (revision: string, name: string, descriptors: unknown[]) => ({
  revision,
  document: { version: 1, providers: [provider(name)], descriptors },
});
const synchronization = {
  contractVersion: MEDIA_PROVIDER_SYNC_CONTRACT_VERSION,
  execution: 'disabled' as const,
  providerId: 'provider-a',
  baseline: snapshot('base', 'Provider A', [descriptor('1', 'Original'), descriptor('2', 'Original')]),
  local: snapshot('local', 'Local provider', [descriptor('1', 'Local'), descriptor('2', 'Local')]),
  incoming: snapshot('incoming', 'Incoming provider', [descriptor('1', 'Incoming')]),
};
const resolution = (decisions: unknown[]) => ({
  resolutionVersion: MEDIA_PROVIDER_SYNC_RESOLUTION_VERSION,
  execution: 'disabled',
  synchronization,
  decisions,
});

describe('provider synchronization conflict resolution', () => {
  it('resolves sorted decisions deterministically and emits reproducible audit records', () => {
    const decisions = [
      { path: 'descriptors.provider-a.2', decision: 'accept-incoming' },
      { path: 'providers.provider-a', decision: 'keep-local' },
      { path: 'descriptors.provider-a.1', decision: 'accept-incoming' },
    ];
    const result = resolveMediaProviderSynchronization(resolution(decisions));
    const repeated = resolveMediaProviderSynchronization(resolution([...decisions].reverse()));

    expect(result).toEqual(repeated);
    expect(result).toMatchObject({ status: 'resolved', execution: 'disabled', canApply: false });
    expect(result.resolvedDocument?.providers[0].name).toBe('Local provider');
    expect(result.resolvedDocument?.descriptors.map((item) => [item.providerItemId, item.title]))
      .toEqual([['1', 'Incoming']]);
    expect(result.audit.map((record) => record.path)).toEqual([
      'descriptors.provider-a.1',
      'descriptors.provider-a.2',
      'providers.provider-a',
    ]);
    expect(result.audit.every((record) => /^mpsa_[0-9a-f]{8}$/.test(record.id))).toBe(true);
    expect(result.audit.map((record) => record.sequence)).toEqual([1, 2, 3]);
  });

  it('keeps omitted conflicts unresolved without silently choosing a winner', () => {
    const result = resolveMediaProviderSynchronization(resolution([
      { path: 'descriptors.provider-a.1', decision: 'keep-local' },
    ]));
    expect(result.status).toBe('unresolved');
    expect(result.audit).toHaveLength(1);
    expect(result.unresolvedConflicts.map((conflict) => conflict.path)).toEqual([
      'descriptors.provider-a.2',
      'providers.provider-a',
    ]);
    expect(result.resolvedDocument?.descriptors.find((item) => item.providerItemId === '1')?.title).toBe('Local');
  });

  it.each([
    [{ path: 'descriptors.provider-b.1', decision: 'keep-local' }],
    [
      { path: 'descriptors.provider-a.1', decision: 'keep-local' },
      { path: 'descriptors.provider-a.1', decision: 'accept-incoming' },
    ],
    [{ path: 'descriptors.provider-a.1', decision: 'newest-wins' }],
  ])('rejects foreign, duplicate, and unsupported decisions', (decisions) => {
    const result = resolveMediaProviderSynchronization(resolution(decisions));
    expect(result.status).toBe('invalid');
    expect(result.canApply).toBe(false);
    expect(result.resolvedDocument).toBeNull();
    expect(result.audit).toEqual([]);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('rejects execution enablement and propagates synchronization validation failures', () => {
    const enabled = resolveMediaProviderSynchronization({ ...resolution([]), execution: 'enabled' });
    expect(enabled.status).toBe('invalid');

    const invalidSync = resolveMediaProviderSynchronization({
      ...resolution([]),
      synchronization: { ...synchronization, execution: 'enabled' },
    });
    expect(invalidSync.status).toBe('invalid');
    expect(invalidSync.issues).toContainEqual(expect.objectContaining({ path: 'execution' }));
  });

  it('leaves other normalized provider partitions unchanged after a decision', () => {
    const otherProvider = { ...provider('Provider B'), id: 'provider-b' };
    const otherDescriptor = { ...descriptor('foreign', 'Foreign'), providerId: 'provider-b' };
    const withPartition = {
      ...synchronization,
      local: {
        ...synchronization.local,
        document: {
          version: 1,
          providers: [provider('Local provider'), otherProvider],
          descriptors: [...synchronization.local.document.descriptors, otherDescriptor],
        },
      },
    };
    const result = resolveMediaProviderSynchronization({
      ...resolution([
        { path: 'descriptors.provider-a.1', decision: 'accept-incoming' },
      ]),
      synchronization: withPartition,
    });
    const normalizedLocal = normalizeMediaProvidersDocument(withPartition.local.document).value;
    expect(result.resolvedDocument?.providers.find((item) => item.id === 'provider-b'))
      .toEqual(normalizedLocal.providers.find((item) => item.id === 'provider-b'));
    expect(result.resolvedDocument?.descriptors.find((item) => item.providerId === 'provider-b'))
      .toEqual(normalizedLocal.descriptors.find((item) => item.providerId === 'provider-b'));
  });
});
