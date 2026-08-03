/**
 * MASTER_PLAN §7 — deterministic provider synchronization contracts.
 *
 * This module only compares offline snapshots and proposes a local document. It has
 * no executor and performs no I/O. In particular it cannot contact providers,
 * authenticate, scrape, download, play media, or automate a browser.
 */
import {
  MEDIA_PROVIDER_MODEL_VERSION,
  normalizeMediaProvidersDocument,
  type MediaDescriptor,
  type MediaProvider,
  type MediaProviderIssue,
  type MediaProvidersDocument,
} from './mediaProviders';

export const MEDIA_PROVIDER_SYNC_CONTRACT_VERSION = 1;

export type MediaProviderSyncConflictState =
  | 'provider-diverged'
  | 'descriptor-diverged'
  | 'descriptor-deleted-locally'
  | 'descriptor-deleted-by-provider';

export interface MediaProviderSyncSnapshot {
  revision: string;
  document: unknown;
}

export interface MediaProviderSyncInput {
  contractVersion: typeof MEDIA_PROVIDER_SYNC_CONTRACT_VERSION;
  /** Hard safety gate. No other value is accepted. */
  execution: 'disabled';
  providerId: string;
  baseline: MediaProviderSyncSnapshot;
  local: MediaProviderSyncSnapshot;
  incoming: MediaProviderSyncSnapshot;
}

export interface MediaProviderSyncConflict {
  state: MediaProviderSyncConflictState;
  providerId: string;
  providerItemId: string | null;
  path: string;
}

export interface MediaProviderSyncIssue extends MediaProviderIssue {
  severity: 'error' | 'warning';
  source: 'input' | 'baseline' | 'local' | 'incoming';
}

export interface MediaProviderSyncStats {
  added: number;
  updated: number;
  deleted: number;
  unchanged: number;
  conflicted: number;
}

export type MediaProviderSyncStatus = 'ready' | 'conflicted' | 'invalid';

export interface MediaProviderSyncOutput {
  contractVersion: typeof MEDIA_PROVIDER_SYNC_CONTRACT_VERSION;
  execution: 'disabled';
  status: MediaProviderSyncStatus;
  canApply: false;
  providerId: string | null;
  baselineRevision: string | null;
  localRevision: string | null;
  incomingRevision: string | null;
  proposedDocument: MediaProvidersDocument | null;
  conflicts: MediaProviderSyncConflict[];
  issues: MediaProviderSyncIssue[];
  stats: MediaProviderSyncStats;
}

type SnapshotSource = 'baseline' | 'local' | 'incoming';

interface ValidatedSnapshot {
  revision: string;
  document: MediaProvidersDocument;
}

const EMPTY_STATS: MediaProviderSyncStats = {
  added: 0,
  updated: 0,
  deleted: 0,
  unchanged: 0,
  conflicted: 0,
};

function cleanId(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '')
    : '';
}

function cleanRevision(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 200) : '';
}

function equal<T>(left: T | undefined, right: T | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function descriptorMap(document: MediaProvidersDocument, providerId: string): Map<string, MediaDescriptor> {
  return new Map(document.descriptors
    .filter((descriptor) => descriptor.providerId === providerId)
    .map((descriptor) => [descriptor.providerItemId, descriptor]));
}

function syncIssue(
  source: MediaProviderSyncIssue['source'],
  path: string,
  message: string,
  severity: MediaProviderSyncIssue['severity'] = 'error',
): MediaProviderSyncIssue {
  return { source, path, message, severity };
}

function validateSnapshot(
  value: unknown,
  source: SnapshotSource,
  providerId: string,
  issues: MediaProviderSyncIssue[],
): ValidatedSnapshot | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    issues.push(syncIssue(source, source, 'Expected a synchronization snapshot.'));
    return null;
  }
  const raw = value as Record<string, unknown>;
  const revision = cleanRevision(raw.revision);
  if (!revision) issues.push(syncIssue(source, `${source}.revision`, 'A non-empty revision is required.'));

  const normalized = normalizeMediaProvidersDocument(raw.document);
  normalized.issues.forEach((issue) => {
    issues.push(syncIssue(source, `${source}.document${issue.path ? `.${issue.path}` : ''}`, issue.message));
  });
  const matchingProviders = normalized.value.providers.filter((provider) => provider.id === providerId);
  if (matchingProviders.length !== 1) {
    issues.push(syncIssue(source, `${source}.document.providers`, `Snapshot must contain provider "${providerId}".`));
  }
  const foreignDescriptors = normalized.value.descriptors.some((descriptor) => descriptor.providerId !== providerId);
  if (source !== 'local' && foreignDescriptors) {
    issues.push(syncIssue(source, `${source}.document.descriptors`, 'Provider snapshots cannot update another provider.'));
  }
  return revision && matchingProviders.length === 1 ? { revision, document: normalized.value } : null;
}

function invalidOutput(
  providerId: string | null,
  input: Partial<MediaProviderSyncInput>,
  issues: MediaProviderSyncIssue[],
): MediaProviderSyncOutput {
  return {
    contractVersion: MEDIA_PROVIDER_SYNC_CONTRACT_VERSION,
    execution: 'disabled',
    status: 'invalid',
    canApply: false,
    providerId,
    baselineRevision: cleanRevision(input.baseline?.revision) || null,
    localRevision: cleanRevision(input.local?.revision) || null,
    incomingRevision: cleanRevision(input.incoming?.revision) || null,
    proposedDocument: null,
    conflicts: [],
    issues,
    stats: { ...EMPTY_STATS },
  };
}

/**
 * Produces an inert, deterministic three-way synchronization proposal.
 *
 * Baseline is the last accepted provider snapshot, local is current storage, and
 * incoming is the newly supplied offline provider snapshot. Non-conflicting remote
 * changes are projected into proposedDocument. Conflicting records remain local and
 * are reported for a later explicit resolution phase. `canApply` is always false.
 */
export function planMediaProviderSynchronization(input: unknown): MediaProviderSyncOutput {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return invalidOutput(null, {}, [syncIssue('input', '', 'Expected a provider synchronization input.')]);
  }
  const raw = input as Partial<MediaProviderSyncInput>;
  const issues: MediaProviderSyncIssue[] = [];
  const providerId = cleanId(raw.providerId);
  if (raw.contractVersion !== MEDIA_PROVIDER_SYNC_CONTRACT_VERSION) {
    issues.push(syncIssue('input', 'contractVersion', `Expected contract version ${MEDIA_PROVIDER_SYNC_CONTRACT_VERSION}.`));
  }
  if (raw.execution !== 'disabled') {
    issues.push(syncIssue('input', 'execution', 'Provider execution must remain disabled.'));
  }
  if (!providerId) issues.push(syncIssue('input', 'providerId', 'A valid provider ID is required.'));
  if (!providerId) return invalidOutput(null, raw, issues);

  const baseline = validateSnapshot(raw.baseline, 'baseline', providerId, issues);
  const local = validateSnapshot(raw.local, 'local', providerId, issues);
  const incoming = validateSnapshot(raw.incoming, 'incoming', providerId, issues);
  if (issues.some((issue) => issue.severity === 'error') || !baseline || !local || !incoming) {
    return invalidOutput(providerId, raw, issues);
  }
  if (baseline.revision === incoming.revision && !equal(baseline.document, incoming.document)) {
    issues.push(syncIssue('incoming', 'incoming.revision', 'An unchanged revision cannot contain changed provider data.'));
    return invalidOutput(providerId, raw, issues);
  }

  const baselineProvider = baseline.document.providers.find((item) => item.id === providerId) as MediaProvider;
  const localProvider = local.document.providers.find((item) => item.id === providerId) as MediaProvider;
  const incomingProvider = incoming.document.providers.find((item) => item.id === providerId) as MediaProvider;
  const conflicts: MediaProviderSyncConflict[] = [];
  let proposedProvider = localProvider;
  if (!equal(incomingProvider, baselineProvider)) {
    if (!equal(localProvider, baselineProvider) && !equal(localProvider, incomingProvider)) {
      conflicts.push({ state: 'provider-diverged', providerId, providerItemId: null, path: `providers.${providerId}` });
    } else {
      proposedProvider = incomingProvider;
    }
  }

  const baselineDescriptors = descriptorMap(baseline.document, providerId);
  const localDescriptors = descriptorMap(local.document, providerId);
  const incomingDescriptors = descriptorMap(incoming.document, providerId);
  const itemIds = [...new Set([
    ...baselineDescriptors.keys(), ...localDescriptors.keys(), ...incomingDescriptors.keys(),
  ])].sort((left, right) => left.localeCompare(right));
  const proposedDescriptors: MediaDescriptor[] = [];
  const stats = { ...EMPTY_STATS };

  itemIds.forEach((providerItemId) => {
    const base = baselineDescriptors.get(providerItemId);
    const current = localDescriptors.get(providerItemId);
    const remote = incomingDescriptors.get(providerItemId);
    const localChanged = !equal(current, base);
    const remoteChanged = !equal(remote, base);

    if (!remoteChanged || equal(current, remote)) {
      if (current) proposedDescriptors.push(current);
      stats.unchanged += 1;
      return;
    }
    if (localChanged) {
      const state: MediaProviderSyncConflictState = !current
        ? 'descriptor-deleted-locally'
        : !remote
          ? 'descriptor-deleted-by-provider'
          : 'descriptor-diverged';
      conflicts.push({ state, providerId, providerItemId, path: `descriptors.${providerId}.${providerItemId}` });
      if (current) proposedDescriptors.push(current);
      stats.conflicted += 1;
      return;
    }
    if (!remote) {
      stats.deleted += 1;
      return;
    }
    proposedDescriptors.push(remote);
    if (base) stats.updated += 1;
    else stats.added += 1;
  });

  const proposedDocument = normalizeMediaProvidersDocument({
    version: MEDIA_PROVIDER_MODEL_VERSION,
    providers: local.document.providers.map((provider) => provider.id === providerId ? proposedProvider : provider),
    descriptors: [
      ...local.document.descriptors.filter((descriptor) => descriptor.providerId !== providerId),
      ...proposedDescriptors,
    ],
  }).value;

  return {
    contractVersion: MEDIA_PROVIDER_SYNC_CONTRACT_VERSION,
    execution: 'disabled',
    status: conflicts.length > 0 ? 'conflicted' : 'ready',
    canApply: false,
    providerId,
    baselineRevision: baseline.revision,
    localRevision: local.revision,
    incomingRevision: incoming.revision,
    proposedDocument,
    conflicts,
    issues,
    stats,
  };
}
