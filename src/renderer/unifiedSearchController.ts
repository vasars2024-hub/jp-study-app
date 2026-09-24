import {
  selectEnabledUnifiedSearchProviders,
  type UnifiedSearchDocument,
} from '../shared/unifiedSearch';
import type {
  UnifiedSearchProviderExecutor,
  UnifiedSearchProviderRegistry,
} from '../shared/unifiedSearchExecution';
import { createUnifiedSearchSession, type UnifiedSearchSession } from './unifiedSearchSession';
import { loadUnifiedSearchDocument } from './unifiedSearchStore';

/**
 * Renderer-side wiring between the local Unified Search document and the search
 * coordinator ({@link createUnifiedSearchSession}).
 *
 * The document supplies the provider configuration; the coordinator needs an
 * executable registry. Each provider is bound by kind to a real connector when
 * the caller supplies one (`unifiedSearchBackends.ts` has the catalogue and
 * torrent-index connectors the app binds) and to the inert executor otherwise,
 * which keeps the coordinator deterministic in tests and harnesses.
 */

/** Performs no work: resolves to zero results without touching the network. */
const inertExecutor: UnifiedSearchProviderExecutor = () => Promise.resolve([]);

/** Real executors that may be bound by provider {@link UnifiedSearchProviderKind}. */
export interface UnifiedSearchRegistryExecutors {
  /**
   * Offline connector for `kind: 'local-library'` providers. When omitted, those
   * providers fall back to the inert executor (their concrete connector is not
   * wired in this context). Site/metadata connectors are deferred to later phases.
   */
  localLibrary?: UnifiedSearchProviderExecutor;
  /** Connector for `kind: 'metadata'` providers — the public catalogues. */
  metadata?: UnifiedSearchProviderExecutor;
  /** Connector for `kind: 'site'` and `kind: 'connector'` providers — the torrent indexes. */
  sites?: UnifiedSearchProviderExecutor;
}

function executorForKind(
  kind: UnifiedSearchDocument['providers'][number]['kind'],
  executors: UnifiedSearchRegistryExecutors,
): UnifiedSearchProviderExecutor {
  switch (kind) {
    case 'local-library':
      return executors.localLibrary ?? inertExecutor;
    case 'metadata':
      return executors.metadata ?? inertExecutor;
    default:
      return executors.sites ?? inertExecutor;
  }
}

/**
 * Assembles a provider registry from the enabled providers of a document, binding
 * each to a real executor by kind where one is supplied and to the inert executor
 * otherwise.
 */
export function createUnifiedSearchRegistry(
  document: UnifiedSearchDocument,
  executors: UnifiedSearchRegistryExecutors = {},
): UnifiedSearchProviderRegistry {
  const registry: Record<string, UnifiedSearchProviderExecutor> = {};
  for (const provider of selectEnabledUnifiedSearchProviders(document)) {
    registry[provider.id] = executorForKind(provider.kind, executors);
  }
  return Object.freeze(registry);
}

/**
 * Assembles a registry where every enabled provider maps to the inert executor.
 * Retained for callers/tests that want a guaranteed-no-I/O registry; equivalent to
 * {@link createUnifiedSearchRegistry} with no real executors supplied.
 */
export function createInertUnifiedSearchRegistry(
  document: UnifiedSearchDocument,
): UnifiedSearchProviderRegistry {
  return createUnifiedSearchRegistry(document);
}

export interface RendererUnifiedSearchSessionOptions {
  /** Reads the local document; defaults to {@link loadUnifiedSearchDocument}. */
  loadDocument?: () => UnifiedSearchDocument;
  /** Builds the executable registry; defaults to a kind-aware registry. */
  buildRegistry?: (document: UnifiedSearchDocument) => UnifiedSearchProviderRegistry;
  /** Offline executor bound to `local-library` providers by the default registry. */
  localLibrary?: UnifiedSearchProviderExecutor;
  /** Catalogue executor bound to `metadata` providers by the default registry. */
  metadata?: UnifiedSearchProviderExecutor;
  /** Index executor bound to `site` and `connector` providers by the default registry. */
  sites?: UnifiedSearchProviderExecutor;
  concurrency?: number;
}

/**
 * Creates a coordinator wired to the local store. Both the plan document and the
 * registry are read afresh for each search, so enabling a provider or editing the
 * document between searches is reflected without recreating the session.
 */
export function createRendererUnifiedSearchSession(
  options: RendererUnifiedSearchSessionOptions = {},
): UnifiedSearchSession {
  const loadDocument = options.loadDocument ?? loadUnifiedSearchDocument;
  const buildRegistry = options.buildRegistry
    ?? ((document: UnifiedSearchDocument) =>
      createUnifiedSearchRegistry(document, {
        localLibrary: options.localLibrary,
        metadata: options.metadata,
        sites: options.sites,
      }));
  // The coordinator calls `getDocument` then `getRegistry` within one search;
  // caching the plan's document keeps the registry aligned to the very providers
  // that were planned, and reads the store only once per search.
  let planned: UnifiedSearchDocument | null = null;
  return createUnifiedSearchSession({
    getDocument: () => { planned = loadDocument(); return planned; },
    getRegistry: () => buildRegistry(planned ?? loadDocument()),
    concurrency: options.concurrency,
  });
}
