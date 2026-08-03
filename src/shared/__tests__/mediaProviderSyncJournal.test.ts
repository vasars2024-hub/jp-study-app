import { describe, expect, it } from 'vitest';
import {
  createMemoryMediaProviderSyncJournalAdapter,
  mediaProviderSyncJournalPartitionKey,
  readMediaProviderSyncJournal,
  storeMediaProviderSyncJournalEnvelope,
  type MediaProviderSyncJournalAdapter,
} from '../mediaProviderSyncJournal';
import { createMediaProviderSyncEnvelope } from '../mediaProviderSyncPersistence';
import { MEDIA_PROVIDER_SYNC_RESOLUTION_VERSION } from '../mediaProviderSyncResolution';
import { MEDIA_PROVIDER_SYNC_CONTRACT_VERSION } from '../mediaProviderSynchronization';

function envelope(providerId: string, revision: string) {
  const provider = {
    id: providerId, name: 'Provider', role: 'metadata',
    contentTypes: ['anime'], capabilities: { metadata: true },
  };
  const descriptor = { providerId, providerItemId: '1', title: 'Title', contentType: 'anime' };
  const document = (name: string) => ({
    version: 1,
    providers: [{ ...provider, name }],
    descriptors: [descriptor],
  });
  const created = createMediaProviderSyncEnvelope({
    resolutionVersion: MEDIA_PROVIDER_SYNC_RESOLUTION_VERSION,
    execution: 'disabled',
    synchronization: {
      contractVersion: MEDIA_PROVIDER_SYNC_CONTRACT_VERSION,
      execution: 'disabled',
      providerId,
      baseline: { revision: `base-${revision}`, document: document('Original') },
      local: { revision: `local-${revision}`, document: document('Local') },
      incoming: { revision: `incoming-${revision}`, document: document('Incoming') },
    },
    decisions: [{ path: `providers.${providerId}`, decision: 'keep-local' }],
  });
  expect(created.status).toBe('created');
  if (!created.envelope) throw new Error('Expected a verified fixture envelope.');
  return created.envelope;
}

describe('provider synchronization local journal boundary', () => {
  it('stores verified envelopes idempotently and returns deterministic cloned values', async () => {
    const adapter = createMemoryMediaProviderSyncJournalAdapter();
    const value = envelope('provider-a', '1');

    const first = await storeMediaProviderSyncJournalEnvelope(adapter, value);
    const duplicate = await storeMediaProviderSyncJournalEnvelope(adapter, JSON.parse(JSON.stringify(value)));
    const read = await readMediaProviderSyncJournal(adapter, value.partition);

    expect(first).toMatchObject({ status: 'stored', execution: 'disabled', canApply: false });
    expect(duplicate.status).toBe('unchanged');
    expect(read.status).toBe('verified');
    expect(read.envelopes).toHaveLength(1);
    read.envelopes[0].partition.providerId = 'mutated';
    expect((await readMediaProviderSyncJournal(adapter, value.partition)).envelopes[0].partition.providerId)
      .toBe('provider-a');
  });

  it('keeps colliding revisions isolated by provider partition', async () => {
    const adapter = createMemoryMediaProviderSyncJournalAdapter();
    const first = envelope('provider-a', 'same');
    const second = envelope('provider-b', 'same');
    await storeMediaProviderSyncJournalEnvelope(adapter, second);
    await storeMediaProviderSyncJournalEnvelope(adapter, first);

    expect((await readMediaProviderSyncJournal(adapter, first.partition)).envelopes.map((item) => item.partition.providerId))
      .toEqual(['provider-a']);
    expect((await readMediaProviderSyncJournal(adapter, second.partition)).envelopes.map((item) => item.partition.providerId))
      .toEqual(['provider-b']);
    expect(mediaProviderSyncJournalPartitionKey(first.partition))
      .not.toBe(mediaProviderSyncJournalPartitionKey(second.partition));
  });

  it('rejects unverified writes without calling replace', async () => {
    let replacements = 0;
    const adapter: MediaProviderSyncJournalAdapter = {
      async read() { return []; },
      async replace() { replacements += 1; },
    };
    const value = envelope('provider-a', '1');
    const result = await storeMediaProviderSyncJournalEnvelope(adapter, { ...value, canApply: true });

    expect(result.status).toBe('invalid');
    expect(result.canApply).toBe(false);
    expect(replacements).toBe(0);
  });

  it('fails closed when an adapter returns tampered or cross-partition records', async () => {
    const value = envelope('provider-a', '1');
    const key = mediaProviderSyncJournalPartitionKey(value.partition);
    const other = envelope('provider-b', '1');
    const adapter = createMemoryMediaProviderSyncJournalAdapter({
      [key]: [{
        journalVersion: 1,
        partitionKey: key,
        envelope: other,
      }],
    });

    const read = await readMediaProviderSyncJournal(adapter, value.partition);
    const write = await storeMediaProviderSyncJournalEnvelope(adapter, value);
    expect(read).toMatchObject({ status: 'invalid', envelopes: [], canApply: false });
    expect(read.issues.some((item) => item.path.includes('partition'))).toBe(true);
    expect(write.status).toBe('invalid');
  });
});
