/**
 * AI fix C for the fusion arbiter, fake provider only: its own cloud opt-in is
 * honoured (and reported as `cloud-off`, not as a missing key), a keyless local
 * OpenAI-compatible server is usable, and every call names its feature.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decideFusedWindows } from '../../shared/subtitleFusionCore';

const h = vi.hoisted(() => ({
  provider: { providerId: 'openai-compatible', apiKey: '' } as { providerId: string; apiKey: string },
  configured: true,
  calls: [] as unknown[][],
}));

vi.mock('../mining', () => ({ getConfiguredAiProvider: () => h.provider }));
vi.mock('../providerRuntime', () => ({
  getAiProviderHealth: () => ({ configured: h.configured }),
  AiProviderRuntimeError: class extends Error {},
}));
vi.mock('../aiProviderClient', () => ({
  callAiProvider: (...args: unknown[]) => {
    h.calls.push(args);
    return Promise.resolve(JSON.stringify({ lines: [] }));
  },
}));

import { setAiCloudFeatureReader } from '../aiFeatureGate';
import { arbitrateFusionDecisions } from '../subtitleFusionArbiter';

const ENGLISH = ['i like cats', 'i cross the bridge'];
const REFERENCES = ['ねこがすきです', '全く関係のない参照文がここにあります'];
const scored = () => decideFusedWindows(['猫が好きです', '橋を渡ります'], REFERENCES);

afterEach(() => {
  setAiCloudFeatureReader(null);
  h.calls.length = 0;
  h.configured = true;
});

describe('fusion arbiter consent and local servers', () => {
  it('skips as `cloud-off` when the user turned its cloud opt-in off', async () => {
    setAiCloudFeatureReader((feature) => feature !== 'subtitleFusion');
    const before = scored();
    const outcome = await arbitrateFusionDecisions(before, ENGLISH, REFERENCES);
    expect(outcome.skipped).toBe('cloud-off');
    expect(outcome.decisions).toEqual(before);
    expect(h.calls).toHaveLength(0);
  });

  it('asks a keyless local server, naming the feature on every call', async () => {
    const outcome = await arbitrateFusionDecisions(scored(), ENGLISH, REFERENCES);
    expect(outcome.skipped).toBeNull();
    expect(h.calls.length).toBeGreaterThan(0);
    expect(h.calls[0][0]).toBe('openai-compatible');
    expect(h.calls[0][4]).toMatchObject({ feature: 'subtitleFusion' });
  });

  it('still reports `no-key` for a provider that is not configured', async () => {
    h.configured = false;
    const outcome = await arbitrateFusionDecisions(scored(), ENGLISH, REFERENCES);
    expect(outcome.skipped).toBe('no-key');
    expect(h.calls).toHaveLength(0);
  });
});
