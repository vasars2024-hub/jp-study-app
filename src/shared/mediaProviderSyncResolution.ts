/**
 * MASTER_PLAN §7 — inert conflict decisions and synchronization audit records.
 *
 * Resolution remains an offline projection. This module performs no I/O and cannot
 * execute providers, apply documents, authenticate, scrape, download, play media,
 * use a browser, or contact a network.
 */
import {
  normalizeMediaProvidersDocument,
  type MediaDescriptor,
  type MediaProvidersDocument,
} from './mediaProviders';
import {
  MEDIA_PROVIDER_SYNC_CONTRACT_VERSION,
  planMediaProviderSynchronization,
  type MediaProviderSyncConflict,
  type MediaProviderSyncInput,
  type MediaProviderSyncIssue,
} from './mediaProviderSynchronization';

export const MEDIA_PROVIDER_SYNC_RESOLUTION_VERSION = 1;

export type MediaProviderSyncDecisionKind = 'keep-local' | 'accept-incoming';

export interface MediaProviderSyncDecision {
  path: string;
  decision: MediaProviderSyncDecisionKind;
}

export interface MediaProviderSyncResolutionInput {
  resolutionVersion: typeof MEDIA_PROVIDER_SYNC_RESOLUTION_VERSION;
  execution: 'disabled';
  synchronization: MediaProviderSyncInput;
  decisions: MediaProviderSyncDecision[];
}

export interface MediaProviderSyncAuditRecord {
  id: string;
  sequence: number;
  contractVersion: typeof MEDIA_PROVIDER_SYNC_CONTRACT_VERSION;
  resolutionVersion: typeof MEDIA_PROVIDER_SYNC_RESOLUTION_VERSION;
  providerId: string;
  providerItemId: string | null;
  path: string;
  conflictState: MediaProviderSyncConflict['state'];
  decision: MediaProviderSyncDecisionKind;
  baselineRevision: string;
  localRevision: string;
  incomingRevision: string;
}

export interface MediaProviderSyncResolutionOutput {
  resolutionVersion: typeof MEDIA_PROVIDER_SYNC_RESOLUTION_VERSION;
  execution: 'disabled';
  canApply: false;
  status: 'resolved' | 'unresolved' | 'invalid';
  providerId: string | null;
  resolvedDocument: MediaProvidersDocument | null;
  unresolvedConflicts: MediaProviderSyncConflict[];
  audit: MediaProviderSyncAuditRecord[];
  issues: MediaProviderSyncIssue[];
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function issue(path: string, message: string): MediaProviderSyncIssue {
  return { source: 'input', path, message, severity: 'error' };
}

function invalid(issues: MediaProviderSyncIssue[], providerId: string | null = null): MediaProviderSyncResolutionOutput {
  return {
    resolutionVersion: MEDIA_PROVIDER_SYNC_RESOLUTION_VERSION,
    execution: 'disabled',
    canApply: false,
    status: 'invalid',
    providerId,
    resolvedDocument: null,
    unresolvedConflicts: [],
    audit: [],
    issues,
  };
}

function descriptorKey(descriptor: MediaDescriptor): string {
  return `${descriptor.providerId}\0${descriptor.providerItemId}`;
}

/**
 * Projects explicit conflict decisions and emits reproducible audit records.
 * Missing decisions stay unresolved; extra, duplicate, or malformed decisions make
 * the request invalid. Audit IDs are derived from partition/revisions/path/decision.
 */
export function resolveMediaProviderSynchronization(input: unknown): MediaProviderSyncResolutionOutput {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return invalid([issue('', 'Expected a provider synchronization resolution input.')]);
  }
  const raw = input as Partial<MediaProviderSyncResolutionInput>;
  const issues: MediaProviderSyncIssue[] = [];
  if (raw.resolutionVersion !== MEDIA_PROVIDER_SYNC_RESOLUTION_VERSION) {
    issues.push(issue('resolutionVersion', `Expected resolution version ${MEDIA_PROVIDER_SYNC_RESOLUTION_VERSION}.`));
  }
  if (raw.execution !== 'disabled') {
    issues.push(issue('execution', 'Provider execution must remain disabled.'));
  }

  const plan = planMediaProviderSynchronization(raw.synchronization);
  if (plan.status === 'invalid') {
    return invalid([...issues, ...plan.issues], plan.providerId);
  }
  if (!Array.isArray(raw.decisions)) {
    issues.push(issue('decisions', 'Expected a decision list.'));
    return invalid(issues, plan.providerId);
  }

  const conflicts = new Map(plan.conflicts.map((conflict) => [conflict.path, conflict]));
  const decisions = new Map<string, MediaProviderSyncDecisionKind>();
  raw.decisions.forEach((candidate, index) => {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      issues.push(issue(`decisions.${index}`, 'Expected a conflict decision.'));
      return;
    }
    const path = typeof candidate.path === 'string' ? candidate.path.trim() : '';
    if (!conflicts.has(path)) issues.push(issue(`decisions.${index}.path`, 'Decision does not match this provider partition.'));
    if (candidate.decision !== 'keep-local' && candidate.decision !== 'accept-incoming') {
      issues.push(issue(`decisions.${index}.decision`, 'Expected keep-local or accept-incoming.'));
    }
    if (decisions.has(path)) issues.push(issue(`decisions.${index}.path`, 'Duplicate conflict decision.'));
    if (conflicts.has(path)
      && (candidate.decision === 'keep-local' || candidate.decision === 'accept-incoming')
      && !decisions.has(path)) {
      decisions.set(path, candidate.decision);
    }
  });
  if (issues.length > 0 || !plan.proposedDocument || !plan.providerId
    || !plan.baselineRevision || !plan.localRevision || !plan.incomingRevision) {
    return invalid(issues, plan.providerId);
  }

  const synchronization = raw.synchronization as MediaProviderSyncInput;
  const incoming = normalizeMediaProvidersDocument(synchronization.incoming.document).value;
  let provider = plan.proposedDocument.providers.find((item) => item.id === plan.providerId);
  const descriptors = new Map(plan.proposedDocument.descriptors.map((item) => [descriptorKey(item), item]));
  const incomingProvider = incoming.providers.find((item) => item.id === plan.providerId);
  const incomingDescriptors = new Map(incoming.descriptors
    .filter((item) => item.providerId === plan.providerId)
    .map((item) => [item.providerItemId, item]));
  const orderedConflicts = [...plan.conflicts].sort((left, right) => left.path.localeCompare(right.path));
  const audit: MediaProviderSyncAuditRecord[] = [];

  orderedConflicts.forEach((conflict) => {
    const decision = decisions.get(conflict.path);
    if (!decision) return;
    if (decision === 'accept-incoming') {
      if (conflict.providerItemId === null) {
        provider = incomingProvider;
      } else {
        const key = `${plan.providerId}\0${conflict.providerItemId}`;
        const incomingDescriptor = incomingDescriptors.get(conflict.providerItemId);
        if (incomingDescriptor) descriptors.set(key, incomingDescriptor);
        else descriptors.delete(key);
      }
    }
    const identity = [
      MEDIA_PROVIDER_SYNC_CONTRACT_VERSION,
      MEDIA_PROVIDER_SYNC_RESOLUTION_VERSION,
      plan.providerId,
      plan.baselineRevision,
      plan.localRevision,
      plan.incomingRevision,
      conflict.path,
      decision,
    ].join('\0');
    audit.push({
      id: `mpsa_${stableHash(identity)}`,
      sequence: audit.length + 1,
      contractVersion: MEDIA_PROVIDER_SYNC_CONTRACT_VERSION,
      resolutionVersion: MEDIA_PROVIDER_SYNC_RESOLUTION_VERSION,
      providerId: plan.providerId as string,
      providerItemId: conflict.providerItemId,
      path: conflict.path,
      conflictState: conflict.state,
      decision,
      baselineRevision: plan.baselineRevision as string,
      localRevision: plan.localRevision as string,
      incomingRevision: plan.incomingRevision as string,
    });
  });

  const unresolvedConflicts = orderedConflicts.filter((conflict) => !decisions.has(conflict.path));
  const resolvedDocument = normalizeMediaProvidersDocument({
    ...plan.proposedDocument,
    providers: plan.proposedDocument.providers.map((item) => item.id === plan.providerId ? provider : item),
    descriptors: [...descriptors.values()],
  }).value;

  return {
    resolutionVersion: MEDIA_PROVIDER_SYNC_RESOLUTION_VERSION,
    execution: 'disabled',
    canApply: false,
    status: unresolvedConflicts.length > 0 ? 'unresolved' : 'resolved',
    providerId: plan.providerId,
    resolvedDocument,
    unresolvedConflicts,
    audit,
    issues: [],
  };
}
