// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_PROVIDERS } from '../../shared/aiProviders';

const secrets: Record<string, string> = { gemini: '', deepseek: '' };

vi.mock('../credentials/ai', () => ({
  readAiProviderSecret: (bucket: string): string => secrets[bucket] ?? '',
  writeAiProviderSecret: (): void => undefined,
}));

const { getAiProviderHealth, getAiProviderHealthReport } = await import('../providerRuntime');

beforeEach(() => {
  secrets.gemini = '';
  secrets.deepseek = '';
});

describe('AI provider health', () => {
  it('reports every provider in catalog order with its own key bucket', () => {
    secrets.gemini = 'gemini-key';

    const report = getAiProviderHealthReport();

    expect(report.map((entry) => entry.providerId)).toEqual(AI_PROVIDERS.map((p) => p.id));
    expect(report.map((entry) => [entry.providerId, entry.credentialBucket, entry.configured])).toEqual([
      ['gemini-2.5-flash', 'gemini', true],
      ['deepseek-v4-flash', 'deepseek', false],
      ['deepseek-v4-pro', 'deepseek', false],
    ]);
  });

  it('shares one bucket across both DeepSeek models', () => {
    secrets.deepseek = 'deepseek-key';

    const report = getAiProviderHealthReport();

    expect(report.filter((entry) => entry.configured).map((entry) => entry.providerId)).toEqual([
      'deepseek-v4-flash',
      'deepseek-v4-pro',
    ]);
  });

  /**
   * The negative control. `Boolean(' ')` is `true`, so a bucket holding only
   * whitespace would report a configured provider and the picker would stay
   * silent right up to the `missing-credential` refusal — which is the exact
   * failure this report exists to move earlier. The runtime's own
   * `credentialFor` trims before it decides, so the health read must too.
   */
  it('treats a whitespace-only key as unconfigured', () => {
    secrets.gemini = '   \n\t ';

    expect(getAiProviderHealth('gemini-2.5-flash').configured).toBe(false);
  });

  it('carries the model name the runtime would actually send', () => {
    expect(getAiProviderHealthReport().map((entry) => entry.model)).toEqual([
      'gemini-2.5-flash',
      'deepseek-v4-flash',
      'deepseek-v4-pro',
    ]);
  });
});
