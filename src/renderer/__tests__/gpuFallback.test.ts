// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  GPU_DETECTOR_ID,
  applyGpuState,
  bootGpuFallback,
  classifyRenderer,
  onGpuChanged,
  readGpuState,
} from '../theme/gpuFallback';

/**
 * L11 "GPU-loss recovery". The live gate for this shipped mechanism ran through
 * the debug bridge against the real `WEBGL_lose_context` extension on the real
 * detector canvas (2026-09-01): healthy `data-gpu` null with 8px/6px/8px blur and
 * an 0.72 taskbar tint, `loseContext()` -> `data-gpu='lost'` with every blur 0px
 * and the taskbar painted opaque `rgb(26, 24, 35)`, `restoreContext()` -> every
 * value back, round trip clean. jsdom has no WebGL, so what is covered HERE is
 * the classification, the attribute contract and the reversibility — the parts a
 * refactor can break silently — plus the CSS that consumes the attribute.
 */

afterEach(() => {
  document.documentElement.removeAttribute('data-gpu');
  document.getElementById(GPU_DETECTOR_ID)?.remove();
});

describe('gpu fallback — classification', () => {
  it('names Chromium software rasterisers, whatever the wrapper', () => {
    // Real strings: SwiftShader is the GL fallback, WARP / "Microsoft Basic
    // Render Driver" is what ANGLE reports on a VM or a blocklisted GPU.
    for (const r of [
      'Google SwiftShader',
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)',
      'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Unknown, WARP Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'llvmpipe (LLVM 15.0.7, 256 bits)',
    ]) {
      expect(classifyRenderer(r, true), r).toBe('software');
    }
  });

  it('leaves real hardware alone', () => {
    // The control for the rule above: it must not classify everything as
    // software, or the app degrades permanently on a working GPU. The first
    // string is what this machine actually reported live.
    for (const r of [
      'ANGLE (AMD, AMD Radeon 780M Graphics (0x00001900) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Apple M2',
    ]) {
      expect(classifyRenderer(r, true), r).toBe('ok');
    }
  });

  it('treats a missing debug extension as unknown, not as software', () => {
    // `WEBGL_debug_renderer_info` can be withheld for fingerprinting reasons.
    // Absent evidence is not evidence — degrading here would flatten the whole
    // material on a healthy machine that simply declined to identify itself.
    expect(classifyRenderer(null, true)).toBe('ok');
  });

  it('treats no context at all as software', () => {
    expect(classifyRenderer(null, false)).toBe('software');
    expect(classifyRenderer('Google SwiftShader', false)).toBe('software');
  });
});

describe('gpu fallback — the attribute contract is reversible', () => {
  it('writes nothing when the GPU is healthy', () => {
    // `ok` must REMOVE the attribute rather than write `ok`, or the CSS needs a
    // `:not()` and the default install carries a marker it should not.
    applyGpuState('lost');
    expect(document.documentElement.getAttribute('data-gpu')).toBe('lost');
    applyGpuState('ok');
    expect(document.documentElement.hasAttribute('data-gpu')).toBe(false);
    expect(readGpuState()).toBe('ok');
  });

  it('round-trips through every state and notifies', () => {
    const seen: string[] = [];
    const off = onGpuChanged((s) => seen.push(s));
    for (const s of ['software', 'lost', 'ok'] as const) applyGpuState(s);
    off();
    applyGpuState('lost'); // after unsubscribe — must not be recorded
    expect(seen).toEqual(['software', 'lost', 'ok']);
  });

  it('reads an unknown attribute value as healthy', () => {
    document.documentElement.setAttribute('data-gpu', 'banana');
    expect(readGpuState()).toBe('ok');
  });
});

describe('gpu fallback — the detector element', () => {
  it('installs one hidden, aria-hidden detector and removes it on teardown', () => {
    const stop = bootGpuFallback();
    const el = document.getElementById(GPU_DETECTOR_ID);
    expect(el, 'bootGpuFallback must put the detector in the document').not.toBeNull();
    expect(el?.tagName).toBe('CANVAS');
    expect(el?.getAttribute('aria-hidden')).toBe('true');
    expect(el?.getAttribute('style')).toMatch(/pointer-events:\s*none/);
    // 1x1 and zero-opacity: it must not be scored as content by a layout or
    // contrast sweep, and must not take a click.
    expect(el?.getAttribute('style')).toMatch(/opacity:\s*0/);
    stop();
    expect(document.getElementById(GPU_DETECTOR_ID)).toBeNull();
  });

  it('classifies jsdom (no WebGL at all) as software rather than throwing', () => {
    // The adverse case: `getContext('webgl')` returns null here. Booting must
    // still complete — a detector that throws would take the whole boot with it,
    // since it runs pre-paint next to bootPerf().
    const stop = bootGpuFallback();
    expect(readGpuState()).toBe('software');
    stop();
  });
});

describe('gpu fallback — the CSS actually consumes the attribute', () => {
  // A renderer module that writes an attribute nothing styles is invisible: the
  // unit tests above would all pass while the app kept its blur. This is the
  // half that made the live gate possible.
  const css = (rel: string) =>
    readFileSync(resolve(__dirname, '..', 'theme', rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('flattens the shared blur ladder and the liquid role in both states', () => {
    for (const [rel, props] of [
      ['perf.css', ['--glass-blur', '--glass-tint']],
      ['liquid-tokens.css', ['--lq-liquid-blur', '--lq-liquid-bg']],
    ] as const) {
      const text = css(rel);
      for (const state of ['software', 'lost'] as const) {
        expect(text, `${rel} must style [data-gpu='${state}']`).toMatch(
          new RegExp(`:root\\[data-gpu='${state}'\\]`),
        );
      }
      // The block is one selector list, so find it and check its declarations —
      // matching the file anywhere would pass on the comment prose.
      const m = /:root\[data-gpu='software'\],\s*:root\[data-gpu='lost'\]\s*\{([^}]*)\}/.exec(text);
      expect(m, `${rel}: expected one combined [data-gpu] block`).not.toBeNull();
      for (const p of props) {
        expect(m?.[1], `${rel} [data-gpu] block must set ${p}`).toContain(p);
      }
      // Opaque, not merely unblurred — the same invariant every other
      // degradation trigger in these sheets carries.
      expect(m?.[1]).toMatch(/(--glass-blur|--lq-liquid-blur)\s*:\s*0px/);
    }
  });

  it('rejects a state nothing styles', () => {
    // Control: the assertions above must be able to fail.
    expect(css('perf.css')).not.toMatch(/:root\[data-gpu='nobody-styles-this'\]/);
  });
});
