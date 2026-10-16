// @vitest-environment jsdom
/**
 * "Read text with AI" in Settings > AI and the Snips settings: the modes wait
 * for the explicit "Allow sending pictures" opt-in, the privacy line names
 * where pictures go, providers say whether they read pictures, and the local
 * server's "my model reads pictures" switch appears only for it.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AiOcrVisionSettings from '../components/ai/AiOcrVisionSettings';

const calls: Array<{ name: string; args: unknown[] }> = [];
let status: Record<string, unknown>;

const BASE = {
  mode: 'off',
  providerId: '',
  compatVision: false,
  effectiveProviderId: 'claude-haiku-5-5',
  host: 'api.anthropic.com',
  local: false,
  providers: [
    { id: 'claude-haiku-5-5', vision: true, configured: true },
    { id: 'deepseek-v4-flash', vision: false, configured: true },
    { id: 'openai', vision: true, configured: false },
  ],
  consent: false,
  available: true,
  ready: false,
  blocked: 'no-consent',
};

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  calls.length = 0;
  status = { ...BASE };
  (window as unknown as { api: Record<string, unknown> }).api = {
    aiOcrVisionStatus: async () => status,
    aiOcrVisionUpdate: async (patch: Record<string, unknown>) => {
      calls.push({ name: 'aiOcrVisionUpdate', args: [patch] });
      status = { ...status, ...patch };
      return status;
    },
    onAiOcrVisionChanged: () => () => undefined,
    onAiSetupChanged: () => () => undefined,
    aiSetupUpdate: async (patch: unknown) => {
      calls.push({ name: 'aiSetupUpdate', args: [patch] });
      status = { ...status, consent: true, ready: true, blocked: undefined };
      return {};
    },
  };
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host.remove();
});

async function render(): Promise<void> {
  await act(async () => root!.render(<AiOcrVisionSettings />));
  for (let i = 0; i < 4; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
}

const mode = (m: string) => host.querySelector<HTMLButtonElement>(`[data-testid="ai-ocr-mode-${m}"]`)!;

describe('Read text with AI', () => {
  it('Off by default; the other modes wait for the picture opt-in, which names the host', async () => {
    await render();
    expect(mode('off').getAttribute('aria-checked')).toBe('true');
    expect(mode('unsure').disabled).toBe(true);
    expect(mode('always').disabled).toBe(true);
    expect(host.querySelector('[data-testid="ai-ocr-privacy"]')?.textContent)
      .toBe('Pictures you snip or read are sent to Claude Haiku 5.5 (api.anthropic.com).');
    const consent = host.querySelector<HTMLInputElement>('[data-testid="ai-ocr-consent"]')!;
    await act(async () => consent.click());
    for (let i = 0; i < 4; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(calls[0]).toEqual({ name: 'aiSetupUpdate', args: [{ cloudFeatures: { ocrVision: true } }] });
    expect(mode('always').disabled).toBe(false);
    await act(async () => mode('always').click());
    expect(calls.at(-1)).toEqual({ name: 'aiOcrVisionUpdate', args: [{ mode: 'always' }] });
  });

  it('the picker says which providers read pictures, and which have no key yet', async () => {
    await render();
    const options = [...host.querySelectorAll('[data-testid="ai-ocr-provider"] option')].map((o) => o.textContent);
    expect(options).toContain('Same as Settings › AI (Claude Haiku 5.5)');
    expect(options).toContain('Claude Haiku 5.5 (reads pictures)');
    expect(options).toContain('OpenAI (reads pictures, no key yet)');
    expect(options).toContain('DeepSeek V4 Flash (text only)');
  });

  it('a provider that cannot read pictures says so instead of offering the opt-in', async () => {
    status = { ...BASE, effectiveProviderId: 'deepseek-v4-flash', host: 'api.deepseek.com', available: false, blocked: 'no-vision' };
    await render();
    expect(host.querySelector('[data-testid="ai-ocr-consent"]')).toBeNull();
    expect(host.querySelector('[data-testid="ai-ocr-status"]')?.textContent).toMatch(/DeepSeek V4 Flash cannot read pictures/);
  });

  it('the local server: its own switch, and pictures that stay on this computer', async () => {
    status = { ...BASE, providerId: 'openai-compatible', effectiveProviderId: 'openai-compatible', host: 'localhost:11434', local: true, compatVision: true };
    await render();
    expect(host.querySelector('[data-testid="ai-ocr-compat-vision"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="ai-ocr-privacy"]')?.textContent).toMatch(/your local server \(localhost:11434\) and stay on this computer/);
  });
});
