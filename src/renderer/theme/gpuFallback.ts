/**
 * Liquid Workplace — L11 "GPU-loss recovery", the renderer half.
 *
 * Every translucent material in this app is `backdrop-filter`, and a backdrop
 * blur is the single most GPU-dependent thing it paints. Two states make that a
 * problem and neither had a reader:
 *
 *   software  Chromium fell back to a software rasteriser — SwiftShader, or
 *             ANGLE over WARP / "Microsoft Basic Render Driver" on a VM or with
 *             the GPU blocklisted. Everything still renders, ~20x slower, and a
 *             full-window backdrop blur is the worst thing to ask of it.
 *   lost      The GPU process died under a running app. Chromium restarts it and
 *             restores contexts, but between the two the compositor has no
 *             accelerated path at all.
 *
 * Deliberately renderer-side and deliberately WebGL. The main process can ask
 * `app.getGPUFeatureStatus()`, but that answers a question about the PROCESS at
 * the moment it is asked; `webglcontextlost` is the event the platform actually
 * emits into the page when the compositor's device goes away, it arrives without
 * an IPC hop, and — the reason this is testable at all — `WEBGL_lose_context`
 * can drive the real thing rather than a synthetic event.
 *
 * The fallback itself is CSS: this module only writes `data-gpu` on the root, and
 * `theme/perf.css` / `theme/liquid-tokens.css` flatten the same tokens the
 * transparency ladder already flattens. One vocabulary, not a third one.
 *
 * REVERSIBLE, which is what "recovery" means here: `webglcontextrestored` puts
 * the material back. That only ever fires if `webglcontextlost` was
 * `preventDefault()`-ed — a well-known WebGL trap, and without it this module
 * would degrade permanently on the first blip and look like a leak.
 */

export type GpuState = 'ok' | 'software' | 'lost';

const ATTR = 'data-gpu';
const EVENT = 'jp-gpu-changed';

/**
 * Chromium's software rasterisers all name themselves in the unmasked renderer
 * string. Matched as a list of substrings rather than by asking for a hardware
 * allow-list: vendors are open-ended, software fallbacks are not.
 */
const SOFTWARE_RENDERER =
  /swiftshader|softwarerasterizer|software rasterizer|llvmpipe|basic render|warp|generic renderer/i;

/**
 * Pure so it can be tested without a GL context. `renderer` is
 * `UNMASKED_RENDERER_WEBGL`, or null when the debug extension is unavailable —
 * which is not itself evidence of software rendering, so it stays `ok`.
 */
export function classifyRenderer(renderer: string | null, hasContext: boolean): GpuState {
  if (!hasContext) return 'software';
  if (renderer && SOFTWARE_RENDERER.test(renderer)) return 'software';
  return 'ok';
}

export function applyGpuState(state: GpuState): void {
  const root = document.documentElement;
  // `ok` removes the attribute rather than writing `ok`, so the default install
  // carries no marker and the CSS below needs no `:not()`.
  if (state === 'ok') root.removeAttribute(ATTR);
  else root.setAttribute(ATTR, state);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: state }));
}

export function readGpuState(): GpuState {
  const v = document.documentElement.getAttribute(ATTR);
  return v === 'software' || v === 'lost' ? v : 'ok';
}

export function onGpuChanged(cb: (state: GpuState) => void): () => void {
  const handler = (e: Event): void => cb((e as CustomEvent<GpuState>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/**
 * The detector lives IN the document under a stable id rather than as a detached
 * canvas. Two reasons, both real: Chromium drops contexts on detached canvases
 * more eagerly under its per-renderer context budget, which would make this
 * report a loss that never happened; and an element with an id is the only way
 * the shipped mechanism can be exercised end to end — `getContext('webgl')`
 * returns the SAME context, so `WEBGL_lose_context` on it fires the real
 * `webglcontextlost` this module listens for, instead of a synthetic Event that
 * would prove nothing about the wiring.
 *
 * 1x1, zero-opacity, `aria-hidden`, `pointer-events: none`, and positioned
 * inside the viewport rather than off-screen so a layout sweep does not score it
 * as content that escaped the window.
 */
export const GPU_DETECTOR_ID = 'lq-gpu-detector';

/** Module-scoped so the detector canvas is not collected with its listeners. */
let detector: HTMLCanvasElement | null = null;

function probe(canvas: HTMLCanvasElement): GpuState {
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = (canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
  } catch {
    gl = null;
  }
  if (!gl || gl.isContextLost()) return classifyRenderer(null, false);
  let renderer: string | null = null;
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  } catch {
    renderer = null;
  }
  return classifyRenderer(renderer, true);
}

/**
 * Called once from `main.tsx`, next to `bootPerf()`. Returns a teardown so a
 * test or a future host can stop listening; the app itself never does.
 */
export function bootGpuFallback(): () => void {
  if (detector) return () => undefined;
  const canvas = document.createElement('canvas');
  canvas.id = GPU_DETECTOR_ID;
  canvas.width = 1;
  canvas.height = 1;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(canvas);
  detector = canvas;

  const onLost = (e: Event): void => {
    // Without this the context is gone for good and `webglcontextrestored` never
    // fires — the material would flatten on the first blip and never come back.
    e.preventDefault();
    applyGpuState('lost');
  };
  const onRestored = (): void => {
    applyGpuState(probe(canvas));
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  applyGpuState(probe(canvas));

  return () => {
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    canvas.remove();
    detector = null;
  };
}
