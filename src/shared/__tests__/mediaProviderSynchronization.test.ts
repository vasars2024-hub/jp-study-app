import { describe, expect, it } from 'vitest';
import {
  MEDIA_PROVIDER_SYNC_CONTRACT_VERSION,
  planMediaProviderSynchronization,
  type MediaProviderSyncInput,
} from '../mediaProviderSynchronization';

const provider = (name = 'Provider A') => ({
  id: 'provider-a',
  name,
  role: 'metadata',
  contentTypes: ['anime'],
  capabilities: { metadata: true },
});

const descriptor = (providerItemId: string, title: string) => ({
  providerId: 'provider-a',
  providerItemId,
  title,
  contentType: 'anime',
});

const snapshot = (revision: string, providerName: string, descriptors: unknown[]) => ({
  revision,
  document: { version: 1, providers: [provider(providerName)], descriptors },
});

const input = (
  baseline = snapshot('base-1', 'Provider A', [descriptor('1', 'Original')]),
  local = snapshot('local-1', 'Provider A', [descriptor('1', 'Original')]),
  incoming = snapshot('remote-2', 'Provider A', [descriptor('1', 'Remote')]),
): MediaProviderSyncInput => ({
  contractVersion: MEDIA_PROVIDER_SYNC_CONTRACT_VERSION,
  execution: 'disabled',
  providerId: 'provider-a',
  baseline,
  local,
  incoming,
});

describe('provider synchronization contract', () => {
  it('projects deterministic additions, updates, and deletions without enabling apply or execution', () => {
    const baseline = snapshot('base', 'Provider A', [
      descriptor('delete', 'Delete me'),
      descriptor('keep', 'Keep me'),
      descriptor('update', 'Old'),
    ]);
    const incoming = snapshot('remote', 'Provider A v2', [
      descriptor('add', 'Added'),
      descriptor('keep', 'Keep me'),
      descriptor('update', 'New'),
    ]);
    const result = planMediaProviderSynchronization(input(baseline, snapshot('local', 'Provider A', baseline.document.descriptors), incoming));

    expect(result).toMatchObject({
      status: 'ready',
      execution: 'disabled',
      canApply: false,
      stats: { added: 1, updated: 1, deleted: 1, unchanged: 1, conflicted: 0 },
    });
    expect(result.proposedDocument?.providers[0].name).toBe('Provider A v2');
    expect(result.proposedDocument?.descriptors.map((item) => [item.providerItemId, item.title])).toEqual([
      ['add', 'Added'], ['keep', 'Keep me'], ['update', 'New'],
    ]);
    expect(planMediaProviderSynchronization(input(baseline, snapshot('local', 'Provider A', baseline.document.descriptors), incoming)))
      .toEqual(result);
  });

  it('reports divergent updates and retains the local descriptor in the proposal', () => {
    const result = planMediaProviderSynchronization(input(
      snapshot('base', 'Provider A', [descriptor('1', 'Original')]),
      snapshot('local', 'Provider A', [descriptor('1', 'Local edit')]),
      snapshot('remote', 'Provider A', [descriptor('1', 'Remote edit')]),
    ));
    expect(result.status).toBe('conflicted');
    expect(result.conflicts).toEqual([{
      state: 'descriptor-diverged',
      providerId: 'provider-a',
      providerItemId: '1',
      path: 'descriptors.provider-a.1',
    }]);
    expect(result.proposedDocument?.descriptors[0].title).toBe('Local edit');
    expect(result.stats.conflicted).toBe(1);
  });

  it.each([
    {
      label: 'local deletion versus provider update',
      local: [],
      incoming: [descriptor('1', 'Remote edit')],
      state: 'descriptor-deleted-locally',
    },
    {
      label: 'local update versus provider deletion',
      local: [descriptor('1', 'Local edit')],
      incoming: [],
      state: 'descriptor-deleted-by-provider',
    },
  ])('classifies $label', ({ local, incoming, state }) => {
    const result = planMediaProviderSynchronization(input(
      snapshot('base', 'Provider A', [descriptor('1', 'Original')]),
      snapshot('local', 'Provider A', local),
      snapshot('remote', 'Provider A', incoming),
    ));
    expect(result.conflicts[0].state).toBe(state);
    expect(result.canApply).toBe(false);
  });

  it('reports provider configuration divergence separately', () => {
    const result = planMediaProviderSynchronization(input(
      snapshot('base', 'Provider A', []),
      snapshot('local', 'Local provider name', []),
      snapshot('remote', 'Remote provider name', []),
    ));
    expect(result.status).toBe('conflicted');
    expect(result.conflicts[0].state).toBe('provider-diverged');
    expect(result.proposedDocument?.providers[0].name).toBe('Local provider name');
  });

  it('rejects any attempt to enable execution', () => {
    const raw = { ...input(), execution: 'enabled' };
    const result = planMediaProviderSynchronization(raw);
    expect(result.status).toBe('invalid');
    expect(result.execution).toBe('disabled');
    expect(result.canApply).toBe(false);
    expect(result.proposedDocument).toBeNull();
    expect(result.issues).toContainEqual(expect.objectContaining({ path: 'execution' }));
  });

  it('rejects malformed provider updates and cross-provider snapshot content', () => {
    const raw = input();
    raw.incoming = {
      revision: 'remote',
      document: {
        providers: [provider()],
        descriptors: [
          descriptor('1', 'Valid'),
          { providerId: 'provider-b', providerItemId: '2', title: 'Foreign' },
        ],
      },
    };
    const result = planMediaProviderSynchronization(raw);
    expect(result.status).toBe('invalid');
    expect(result.proposedDocument).toBeNull();
    expect(result.issues.some((issue) => issue.source === 'incoming')).toBe(true);
  });

  it('rejects changed data under an unchanged provider revision', () => {
    const result = planMediaProviderSynchronization(input(
      snapshot('same', 'Provider A', [descriptor('1', 'Original')]),
      snapshot('local', 'Provider A', [descriptor('1', 'Original')]),
      snapshot('same', 'Provider A', [descriptor('1', 'Changed')]),
    ));
    expect(result.status).toBe('invalid');
    expect(result.issues).toContainEqual(expect.objectContaining({
      path: 'incoming.revision',
      source: 'incoming',
    }));
  });
});
