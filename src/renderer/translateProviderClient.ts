/**
 * The renderer's view of the translation engines: which ones exist, which are
 * ready (key stored / model on disk), which the user consented to, and which
 * one each language pair uses.
 *
 * Main owns all of it (`main/translateRouter.ts`) — consent in particular is
 * enforced there, so nothing here can send text by being wrong. This module
 * only caches the last snapshot so every Translate surface (Study OS, both
 * layouts, and Blanc) shows the same choice, and every one of them updates when
 * another changes it.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  providerForPair,
  type TranslateCloudProviderId,
  type TranslateProviderAvailability,
  type TranslateProviderId,
  type TranslateProviderSnapshot,
} from '../shared/translateProviders';

let snapshot: TranslateProviderSnapshot | null = null;
let hooked = false;
let pending: Promise<TranslateProviderSnapshot | null> | null = null;
const listeners = new Set<(next: TranslateProviderSnapshot) => void>();

function bridge(): Window['api'] | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.api;
  } catch {
    return undefined;
  }
}

function publish(next: TranslateProviderSnapshot | null | undefined): TranslateProviderSnapshot | null {
  if (!next || typeof next !== 'object' || !Array.isArray(next.providers)) return snapshot;
  snapshot = next;
  for (const cb of [...listeners]) cb(next);
  return snapshot;
}

function hook(): void {
  if (hooked) return;
  const on = bridge()?.onTranslateProvidersChanged;
  if (typeof on !== 'function') return;
  hooked = true;
  on((next) => publish(next));
}

/** Asks main for the current snapshot. Null on a bridge without the provider channels (tests, old preload). */
export function refreshTranslateProviders(): Promise<TranslateProviderSnapshot | null> {
  hook();
  const get = bridge()?.translateProviders;
  if (typeof get !== 'function') return Promise.resolve(snapshot);
  if (!pending) {
    pending = get()
      .then((next) => publish(next))
      .catch(() => snapshot)
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export function translateProviderAvailability(
  current: TranslateProviderSnapshot | null,
  id: TranslateProviderId,
): TranslateProviderAvailability | undefined {
  return current?.providers.find((provider) => provider.id === id);
}

/** The engine a pair will use. Offline whenever main has not said otherwise. */
export function pairProvider(
  current: TranslateProviderSnapshot | null,
  source: string,
  target: string,
): TranslateProviderId {
  return current ? providerForPair(current.settings, source, target) : 'local';
}

export interface TranslateProvidersController {
  snapshot: TranslateProviderSnapshot | null;
  /** The engine this pair uses now. */
  provider: TranslateProviderId;
  setPairProvider: (provider: TranslateProviderId) => Promise<void>;
  setConsent: (provider: TranslateCloudProviderId, granted: boolean) => Promise<void>;
  setFallback: (on: boolean) => Promise<void>;
}

export function useTranslateProviders(source: string, target: string): TranslateProvidersController {
  const [current, setCurrent] = useState<TranslateProviderSnapshot | null>(snapshot);
  useEffect(() => {
    listeners.add(setCurrent);
    void refreshTranslateProviders().then((next) => {
      if (next) setCurrent(next);
    });
    return () => {
      listeners.delete(setCurrent);
    };
  }, []);

  const setPairProvider = useCallback(async (provider: TranslateProviderId) => {
    const set = bridge()?.translateSetPairProvider;
    if (typeof set !== 'function') return;
    try {
      publish(await set(source, target, provider));
    } catch {
      /* the picker keeps showing what main last confirmed */
    }
  }, [source, target]);

  const setConsent = useCallback(async (provider: TranslateCloudProviderId, granted: boolean) => {
    const set = bridge()?.translateSetProviderConsent;
    if (typeof set !== 'function') return;
    try {
      publish(await set(provider, granted));
    } catch {
      /* unchanged: consent is only ever what main recorded */
    }
  }, []);

  const setFallback = useCallback(async (on: boolean) => {
    const set = bridge()?.translateSetFallback;
    if (typeof set !== 'function') return;
    try {
      publish(await set(on));
    } catch {
      /* unchanged */
    }
  }, []);

  return {
    snapshot: current,
    provider: pairProvider(current, source, target),
    setPairProvider,
    setConsent,
    setFallback,
  };
}

/** Test seam: forget the cached snapshot and the bridge hook. */
export function resetTranslateProviderClientForTests(): void {
  snapshot = null;
  hooked = false;
  pending = null;
  listeners.clear();
}
