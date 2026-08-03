/**
 * MASTER_PLAN §7 — inert persistence and replay verification for provider sync.
 *
 * Envelopes are JSON-safe values only. This module performs no persistence I/O and
 * cannot apply a proposal, execute a provider, authenticate, scrape, download,
 * play media, automate a browser, or contact a network.
 */
import {
  MEDIA_PROVIDER_SYNC_RESOLUTION_VERSION,
  resolveMediaProviderSynchronization,
  type MediaProviderSyncAuditRecord,
  type MediaProviderSyncResolutionInput,
} from './mediaProviderSyncResolution';
import { MEDIA_PROVIDER_SYNC_CONTRACT_VERSION, type MediaProviderSyncIssue } from './mediaProviderSynchronization';
import type { MediaProvidersDocument } from './mediaProviders';

export const MEDIA_PROVIDER_SYNC_ENVELOPE_VERSION = 1;

export interface MediaProviderSyncPartition {
  providerId: string;
  baselineRevision: string;
  localRevision: string;
  incomingRevision: string;
}

export interface MediaProviderSyncPersistenceEnvelope {
  envelopeVersion: typeof MEDIA_PROVIDER_SYNC_ENVELOPE_VERSION;
  contractVersion: typeof MEDIA_PROVIDER_SYNC_CONTRACT_VERSION;
  resolutionVersion: typeof MEDIA_PROVIDER_SYNC_RESOLUTION_VERSION;
  execution: 'disabled';
  canApply: false;
  partition: MediaProviderSyncPartition;
  resolution: MediaProviderSyncResolutionInput;
  resolvedDocument: MediaProvidersDocument;
  audit: MediaProviderSyncAuditRecord[];
  digest: string;
}

export interface MediaProviderSyncEnvelopeResult {
  status: 'created' | 'invalid';
  execution: 'disabled';
  canApply: false;
  envelope: MediaProviderSyncPersistenceEnvelope | null;
  issues: MediaProviderSyncIssue[];
}

export interface MediaProviderSyncReplayResult {
  status: 'verified' | 'invalid';
  execution: 'disabled';
  canApply: false;
  partition: MediaProviderSyncPartition | null;
  resolvedDocument: MediaProvidersDocument | null;
  audit: MediaProviderSyncAuditRecord[];
  issues: MediaProviderSyncIssue[];
}

function issue(path: string, message: string): MediaProviderSyncIssue {
  return { source: 'input', path, message, severity: 'error' };
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`)
    .join(',')}}`;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function envelopeDigest(envelope: Omit<MediaProviderSyncPersistenceEnvelope, 'digest'>): string {
  return `mpse_${stableHash(canonicalize(envelope))}`;
}

function invalidEnvelope(issues: MediaProviderSyncIssue[]): MediaProviderSyncEnvelopeResult {
  return { status: 'invalid', execution: 'disabled', canApply: false, envelope: null, issues };
}

/**
 * Creates a deterministic value suitable for a caller-controlled persistence layer.
 * Only fully resolved proposals can be enveloped.
 */
export function createMediaProviderSyncEnvelope(input: unknown): MediaProviderSyncEnvelopeResult {
  const replay = resolveMediaProviderSynchronization(input);
  if (replay.status !== 'resolved' || !replay.providerId || !replay.resolvedDocument) {
    return invalidEnvelope(replay.issues.length > 0
      ? replay.issues
      : [issue('resolution', 'Only a fully resolved synchronization proposal can be persisted.')]);
  }
  const suppliedResolution = input as MediaProviderSyncResolutionInput;
  const resolution: MediaProviderSyncResolutionInput = {
    ...suppliedResolution,
    decisions: [...suppliedResolution.decisions].sort((left, right) => left.path.localeCompare(right.path)),
  };
  const partition: MediaProviderSyncPartition = {
    providerId: replay.providerId,
    baselineRevision: resolution.synchronization.baseline.revision.trim(),
    localRevision: resolution.synchronization.local.revision.trim(),
    incomingRevision: resolution.synchronization.incoming.revision.trim(),
  };
  const body: Omit<MediaProviderSyncPersistenceEnvelope, 'digest'> = {
    envelopeVersion: MEDIA_PROVIDER_SYNC_ENVELOPE_VERSION,
    contractVersion: MEDIA_PROVIDER_SYNC_CONTRACT_VERSION,
    resolutionVersion: MEDIA_PROVIDER_SYNC_RESOLUTION_VERSION,
    execution: 'disabled',
    canApply: false,
    partition,
    resolution,
    resolvedDocument: replay.resolvedDocument,
    audit: replay.audit,
  };
  return {
    status: 'created',
    execution: 'disabled',
    canApply: false,
    envelope: { ...body, digest: envelopeDigest(body) },
    issues: [],
  };
}

/**
 * Verifies structural gates, digest, partition identity, and a fresh deterministic
 * replay. The returned proposal remains inert (`canApply` is always false).
 */
export function verifyAndReplayMediaProviderSyncEnvelope(input: unknown): MediaProviderSyncReplayResult {
  const fail = (issues: MediaProviderSyncIssue[], partition: MediaProviderSyncPartition | null = null):
  MediaProviderSyncReplayResult => ({
    status: 'invalid', execution: 'disabled', canApply: false, partition,
    resolvedDocument: null, audit: [], issues,
  });
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return fail([issue('', 'Expected a synchronization persistence envelope.')]);
  }
  const raw = input as Partial<MediaProviderSyncPersistenceEnvelope>;
  const gates: MediaProviderSyncIssue[] = [];
  if (raw.envelopeVersion !== MEDIA_PROVIDER_SYNC_ENVELOPE_VERSION) {
    gates.push(issue('envelopeVersion', `Expected envelope version ${MEDIA_PROVIDER_SYNC_ENVELOPE_VERSION}.`));
  }
  if (raw.contractVersion !== MEDIA_PROVIDER_SYNC_CONTRACT_VERSION) {
    gates.push(issue('contractVersion', `Expected contract version ${MEDIA_PROVIDER_SYNC_CONTRACT_VERSION}.`));
  }
  if (raw.resolutionVersion !== MEDIA_PROVIDER_SYNC_RESOLUTION_VERSION) {
    gates.push(issue('resolutionVersion', `Expected resolution version ${MEDIA_PROVIDER_SYNC_RESOLUTION_VERSION}.`));
  }
  if (raw.execution !== 'disabled') gates.push(issue('execution', 'Provider execution must remain disabled.'));
  if (raw.canApply !== false) gates.push(issue('canApply', 'Persisted proposals must remain non-applicable.'));
  if (!raw.partition || typeof raw.partition !== 'object') gates.push(issue('partition', 'A partition is required.'));
  if (gates.length > 0) return fail(gates);

  const envelope = raw as MediaProviderSyncPersistenceEnvelope;
  const { digest, ...body } = envelope;
  if (digest !== envelopeDigest(body)) return fail([issue('digest', 'Envelope content does not match its digest.')]);

  const replay = resolveMediaProviderSynchronization(envelope.resolution);
  if (replay.status !== 'resolved' || !replay.resolvedDocument || !replay.providerId) {
    return fail(replay.issues.length > 0 ? replay.issues : [issue('resolution', 'Envelope replay is not fully resolved.')]);
  }
  const expectedPartition: MediaProviderSyncPartition = {
    providerId: replay.providerId,
    baselineRevision: envelope.resolution.synchronization.baseline.revision.trim(),
    localRevision: envelope.resolution.synchronization.local.revision.trim(),
    incomingRevision: envelope.resolution.synchronization.incoming.revision.trim(),
  };
  if (canonicalize(envelope.partition) !== canonicalize(expectedPartition)) {
    return fail([issue('partition', 'Envelope partition does not match replayed synchronization revisions.')]);
  }
  if (canonicalize(envelope.resolvedDocument) !== canonicalize(replay.resolvedDocument)) {
    return fail([issue('resolvedDocument', 'Persisted proposal does not match deterministic replay.')], expectedPartition);
  }
  if (canonicalize(envelope.audit) !== canonicalize(replay.audit)) {
    return fail([issue('audit', 'Persisted audit records do not match deterministic replay.')], expectedPartition);
  }
  return {
    status: 'verified',
    execution: 'disabled',
    canApply: false,
    partition: expectedPartition,
    resolvedDocument: replay.resolvedDocument,
    audit: replay.audit,
    issues: [],
  };
}
