/**
 * MASTER_PLAN §7 — caller-owned local journal boundary for verified sync envelopes.
 *
 * The journal has no default storage and performs no provider or network work. A
 * caller must supply an adapter. Both ingress and egress are replay-verified so an
 * adapter is never trusted to preserve envelope integrity or partition ownership.
 */
import {
  verifyAndReplayMediaProviderSyncEnvelope,
  type MediaProviderSyncPartition,
  type MediaProviderSyncPersistenceEnvelope,
  type MediaProviderSyncReplayResult,
} from './mediaProviderSyncPersistence';
import type { MediaProviderSyncIssue } from './mediaProviderSynchronization';

export const MEDIA_PROVIDER_SYNC_JOURNAL_VERSION = 1;

export type MediaProviderSyncJournalPartition = MediaProviderSyncPartition;

export interface MediaProviderSyncJournalRecord {
  journalVersion: typeof MEDIA_PROVIDER_SYNC_JOURNAL_VERSION;
  partitionKey: string;
  envelope: MediaProviderSyncPersistenceEnvelope;
}

/**
 * Minimal local persistence port. Implementations own all storage lifecycle and
 * must not interpret or apply journal records.
 */
export interface MediaProviderSyncJournalAdapter {
  read(partitionKey: string): Promise<readonly unknown[]>;
  replace(partitionKey: string, records: readonly MediaProviderSyncJournalRecord[]): Promise<void>;
}

export interface MediaProviderSyncJournalWriteResult {
  status: 'stored' | 'unchanged' | 'invalid';
  execution: 'disabled';
  canApply: false;
  partitionKey: string | null;
  issues: MediaProviderSyncIssue[];
}

export interface MediaProviderSyncJournalReadResult {
  status: 'verified' | 'invalid';
  execution: 'disabled';
  canApply: false;
  partitionKey: string;
  envelopes: MediaProviderSyncPersistenceEnvelope[];
  issues: MediaProviderSyncIssue[];
}

function issue(path: string, message: string): MediaProviderSyncIssue {
  return { source: 'input', path, message, severity: 'error' };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function segment(value: string): string {
  return `${value.length}:${value}`;
}

/** Collision-safe, deterministic key for one provider/revision partition. */
export function mediaProviderSyncJournalPartitionKey(partition: MediaProviderSyncJournalPartition): string {
  return [
    partition.providerId,
    partition.baselineRevision,
    partition.localRevision,
    partition.incomingRevision,
  ].map(segment).join('|');
}

function verifiedEnvelope(input: unknown): {
  replay: MediaProviderSyncReplayResult;
  envelope: MediaProviderSyncPersistenceEnvelope | null;
} {
  const replay = verifyAndReplayMediaProviderSyncEnvelope(input);
  return {
    replay,
    envelope: replay.status === 'verified' ? clone(input as MediaProviderSyncPersistenceEnvelope) : null,
  };
}

function parseRecord(input: unknown, partitionKey: string, index: number): {
  envelope: MediaProviderSyncPersistenceEnvelope | null;
  issues: MediaProviderSyncIssue[];
} {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { envelope: null, issues: [issue(`records.${index}`, 'Expected a journal record.')] };
  }
  const record = input as Partial<MediaProviderSyncJournalRecord>;
  const issues: MediaProviderSyncIssue[] = [];
  if (record.journalVersion !== MEDIA_PROVIDER_SYNC_JOURNAL_VERSION) {
    issues.push(issue(`records.${index}.journalVersion`, `Expected journal version ${MEDIA_PROVIDER_SYNC_JOURNAL_VERSION}.`));
  }
  if (record.partitionKey !== partitionKey) {
    issues.push(issue(`records.${index}.partitionKey`, 'Journal record belongs to a different partition.'));
  }
  const verified = verifiedEnvelope(record.envelope);
  if (verified.replay.status !== 'verified' || !verified.replay.partition || !verified.envelope) {
    issues.push(...verified.replay.issues.map((item) => ({ ...item, path: `records.${index}.envelope.${item.path}` })));
  } else if (mediaProviderSyncJournalPartitionKey(verified.replay.partition) !== partitionKey) {
    issues.push(issue(`records.${index}.envelope.partition`, 'Envelope belongs to a different partition.'));
  }
  return { envelope: issues.length === 0 ? verified.envelope : null, issues };
}

/**
 * Retrieves one explicit partition. Any corrupt or cross-partition adapter value
 * invalidates the whole read; verified values are returned in digest order.
 */
export async function readMediaProviderSyncJournal(
  adapter: MediaProviderSyncJournalAdapter,
  partition: MediaProviderSyncJournalPartition,
): Promise<MediaProviderSyncJournalReadResult> {
  const partitionKey = mediaProviderSyncJournalPartitionKey(partition);
  const stored = await adapter.read(partitionKey);
  const parsed = stored.map((record, index) => parseRecord(record, partitionKey, index));
  const issues = parsed.flatMap((result) => result.issues);
  if (issues.length > 0) {
    return { status: 'invalid', execution: 'disabled', canApply: false, partitionKey, envelopes: [], issues };
  }
  const envelopes = parsed
    .map((result) => result.envelope as MediaProviderSyncPersistenceEnvelope)
    .sort((left, right) => left.digest.localeCompare(right.digest));
  return { status: 'verified', execution: 'disabled', canApply: false, partitionKey, envelopes, issues: [] };
}

/**
 * Replay-verifies an envelope before journaling it. Duplicate digests are
 * idempotent and adapter contents are validated before a deterministic replace.
 */
export async function storeMediaProviderSyncJournalEnvelope(
  adapter: MediaProviderSyncJournalAdapter,
  input: unknown,
): Promise<MediaProviderSyncJournalWriteResult> {
  const verified = verifiedEnvelope(input);
  if (verified.replay.status !== 'verified' || !verified.replay.partition || !verified.envelope) {
    return {
      status: 'invalid', execution: 'disabled', canApply: false, partitionKey: null,
      issues: verified.replay.issues,
    };
  }
  const partitionKey = mediaProviderSyncJournalPartitionKey(verified.replay.partition);
  const existing = await adapter.read(partitionKey);
  const parsed = existing.map((record, index) => parseRecord(record, partitionKey, index));
  const issues = parsed.flatMap((result) => result.issues);
  if (issues.length > 0) {
    return { status: 'invalid', execution: 'disabled', canApply: false, partitionKey, issues };
  }
  const envelopes = parsed.map((result) => result.envelope as MediaProviderSyncPersistenceEnvelope);
  if (envelopes.some((envelope) => envelope.digest === verified.envelope?.digest)) {
    return { status: 'unchanged', execution: 'disabled', canApply: false, partitionKey, issues: [] };
  }
  const records = [...envelopes, verified.envelope]
    .sort((left, right) => left.digest.localeCompare(right.digest))
    .map((envelope): MediaProviderSyncJournalRecord => ({
      journalVersion: MEDIA_PROVIDER_SYNC_JOURNAL_VERSION,
      partitionKey,
      envelope,
    }));
  await adapter.replace(partitionKey, clone(records));
  return { status: 'stored', execution: 'disabled', canApply: false, partitionKey, issues: [] };
}

/** Deterministic local adapter intended for tests and caller-owned ephemeral use. */
export function createMemoryMediaProviderSyncJournalAdapter(
  seed: Readonly<Record<string, readonly unknown[]>> = {},
): MediaProviderSyncJournalAdapter {
  const partitions = new Map(Object.entries(seed).map(([key, records]) => [key, clone(records)]));
  return {
    async read(partitionKey) {
      return clone(partitions.get(partitionKey) ?? []);
    },
    async replace(partitionKey, records) {
      partitions.set(partitionKey, clone(records));
    },
  };
}
