/**
 * "Read text with AI" as the renderer sees it: main's status (`aiOcrVision:*`),
 * live. Refreshed when main says it changed, and when Settings > AI changed
 * (the opt-in, the provider or a key all live there).
 *
 * Imported only by lazy surfaces (Settings > AI, the Snips view), never at boot.
 */
import { useCallback, useEffect, useState } from 'react';
import { normalizeAiOcrVisionStatus, type AiOcrVisionPatch, type AiOcrVisionStatus } from '../shared/aiOcrVision';
import type { AiProviderId } from '../shared/aiProviders';
import { notifyAiSetupChanged } from './aiSetupClient';

async function readStatus(): Promise<AiOcrVisionStatus | null> {
  const read = window.api?.aiOcrVisionStatus;
  if (typeof read !== 'function') return null;
  try {
    return normalizeAiOcrVisionStatus(await read());
  } catch {
    return null;
  }
}

/** The status (null until main answers) and a setter that reports whether main took the change. */
export function useAiOcrVision(): {
  status: AiOcrVisionStatus | null;
  update: (patch: AiOcrVisionPatch) => Promise<boolean>;
  setConsent: (allowed: boolean) => Promise<boolean>;
  refresh: () => Promise<void>;
} {
  const [status, setStatus] = useState<AiOcrVisionStatus | null>(null);
  const refresh = useCallback(async () => {
    const next = await readStatus();
    if (next) setStatus(next);
  }, []);

  useEffect(() => {
    let alive = true;
    void readStatus().then((next) => {
      if (alive && next) setStatus(next);
    });
    const offVision = window.api?.onAiOcrVisionChanged?.((raw) => {
      const next = normalizeAiOcrVisionStatus(raw);
      if (alive && next) setStatus(next);
    });
    // The opt-in, the provider and the keys are Settings > AI's: re-read when they change.
    const offSetup = window.api?.onAiSetupChanged?.(() => void refresh());
    const onFocus = (): void => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      alive = false;
      if (typeof offVision === 'function') offVision();
      if (typeof offSetup === 'function') offSetup();
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const update = useCallback(async (patch: AiOcrVisionPatch): Promise<boolean> => {
    try {
      const next = normalizeAiOcrVisionStatus(await window.api.aiOcrVisionUpdate(patch));
      if (next) setStatus(next);
      return Boolean(next);
    } catch {
      return false;
    }
  }, []);

  /** The `ocrVision` cloud opt-in (Settings > AI's list, the same switch). */
  const setConsent = useCallback(async (allowed: boolean): Promise<boolean> => {
    try {
      await window.api.aiSetupUpdate({ cloudFeatures: { ocrVision: allowed } });
      notifyAiSetupChanged();
      await refresh();
      return true;
    } catch {
      return false;
    }
  }, [refresh]);

  return { status, update, setConsent, refresh };
}

/** A provider entry's name as the learner sees it: a product name, or the local server's translated name. */
export function aiOcrProviderName(id: AiProviderId, label: string, t: (key: string) => string): string {
  return id === 'openai-compatible' ? t('aiProv.vendor.local') : label;
}
