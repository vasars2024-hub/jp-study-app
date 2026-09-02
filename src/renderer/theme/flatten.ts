/**
 * Liquid Workplace — L11 "Blur fallback", the half the token ladder cannot reach.
 *
 * Six separate states in this app mean "stop painting translucent material":
 * high contrast, the battery performance tier, the in-product transparency
 * control set to `off`, the OS `prefers-reduced-transparency` preference, GPU
 * software-fallback/loss, and Aero safe mode. Every one of them is already
 * implemented — and every one of them works by re-declaring `--lq-*-blur`,
 * `--glass-blur` and `--blur-*` on `:root`.
 *
 * That grades TOKENS, so it only reaches a surface that reads a token. Counted
 * over every tracked `.css` file by `debug/_bf-count.cjs`, **35
 * `backdrop-filter` rules are token-driven and 61 are hardcoded pixels**
 * (`blur(15px)`, `blur(1px)`, …) that no trigger reaches. 64% of the painted
 * glass in this app ignores all six states at once.
 *
 * `theme/perf.css:46` shows what the alternative costs: an enumerated 18-selector
 * kill list that sets `backdrop-filter: none !important` and never touches the
 * tint, so `.widget-frame` at 72% alpha loses its blur and keeps its
 * transparency — a sharply see-through panel, the worst of both, shipped. That
 * was measured live, not reasoned about; see `flatten.css`.
 *
 * Why a derived attribute instead of repeating the six selectors:
 *
 *   1. One of the six is a `@media` query, so a CSS-only OR would need every
 *      converted rule written twice — once in the cascade and once inside the
 *      media block. At 61 rules that is 122 rules that must stay in sync.
 *   2. The six live in four different sheets (`liquid-tokens.css`, `perf.css`,
 *      `a11y.css`, `aero-safe-mode.css`) owned by four different phases. A
 *      seventh trigger added later would have to find all 61 sites again.
 *
 * So this module computes the OR exactly once and writes `data-lq-flat` on the
 * root; `theme/flatten.css` carries the 60 product conversions under that single
 * attribute (the 61st rule is a dev-only harness sheet). Adding a trigger is
 * then a one-line change here.
 *
 * DELIBERATELY NOT a `:root[data-lq-flat] * { backdrop-filter: none }`
 * catch-all, even though `perf.css` uses that shape for animations. Those 61
 * surfaces carry hardcoded translucent backgrounds; dropping only their blur
 * would leave a sharply see-through panel — the "worst of both" state that
 * `views/mediaCenter.css:6812` names and that clause 1 of this bullet exists to
 * prevent. `flatten.css` converts the tint per surface alongside the blur.
 */

/** The attributes on `<html>` whose values can change the answer. */
export const FLATTEN_ATTRS = [
  'data-theme',
  'data-perf',
  'data-display-transparency',
  'data-gpu',
  'data-materials',
  'data-aero-safe-mode',
] as const;

export const REDUCED_TRANSPARENCY_QUERY = '(prefers-reduced-transparency: reduce)';

const ATTR = 'data-lq-flat';

export interface FlattenInputs {
  theme: string | null;
  perf: string | null;
  transparency: string | null;
  gpu: string | null;
  materials: string | null;
  aeroSafeMode: string | null;
  /** `matchMedia('(prefers-reduced-transparency: reduce)').matches`. */
  reducedTransparency: boolean;
}

/**
 * Pure, so the trigger set is testable without a document. Each arm mirrors an
 * existing token-flattening selector one-for-one; if one of them is ever
 * relaxed in CSS, the matching arm here has to move with it or the two
 * mechanisms disagree about the same state.
 */
export function shouldFlatten(inputs: FlattenInputs): boolean {
  // theme/liquid-tokens.css — :root[data-theme='high-contrast']
  if (inputs.theme === 'high-contrast') return true;
  // theme/liquid-tokens.css — :root[data-perf='battery']
  if (inputs.perf === 'battery') return true;
  // theme/liquid-tokens.css — :root[data-display-transparency='off']
  if (inputs.transparency === 'off') return true;
  // theme/liquid-tokens.css — @media (prefers-reduced-transparency: reduce)
  // qualified on ='full'. `off` is covered above and `reduced` is a deliberate
  // in-product middle state the OS preference does not override, so this arm is
  // narrow on purpose rather than "any transparency value".
  if (inputs.reducedTransparency && inputs.transparency === 'full') return true;
  // theme/liquid-tokens.css — :root[data-gpu='software'], :root[data-gpu='lost']
  if (inputs.gpu === 'software' || inputs.gpu === 'lost') return true;
  // theme/liquid-tokens.css — [data-materials='aero'][data-aero-safe-mode='on']
  if (inputs.materials === 'aero' && inputs.aeroSafeMode === 'on') return true;
  return false;
}

export function readFlattenInputs(
  root: HTMLElement,
  reducedTransparency: boolean,
): FlattenInputs {
  return {
    theme: root.getAttribute('data-theme'),
    perf: root.getAttribute('data-perf'),
    transparency: root.getAttribute('data-display-transparency'),
    gpu: root.getAttribute('data-gpu'),
    materials: root.getAttribute('data-materials'),
    aeroSafeMode: root.getAttribute('data-aero-safe-mode'),
    reducedTransparency,
  };
}

/** Returns whether the attribute changed, so a caller can avoid churn. */
export function applyFlatten(root: HTMLElement, flat: boolean): boolean {
  const had = root.hasAttribute(ATTR);
  if (flat === had) return false;
  // Written as a valueless attribute so the selector is `[data-lq-flat]` and a
  // future third state cannot be introduced by accident.
  if (flat) root.setAttribute(ATTR, '');
  else root.removeAttribute(ATTR);
  return true;
}

export function isFlattened(root: HTMLElement): boolean {
  return root.hasAttribute(ATTR);
}

/**
 * Called once from `main.tsx`, after every module that writes one of the six
 * attributes has had its pre-paint boot — otherwise the first frame paints the
 * blurred material and this corrects it a frame later.
 *
 * A `MutationObserver` rather than listening to each owner's change event: the
 * six attributes are written by `theme.ts`, `perf.ts`, `displayPrefs.ts`,
 * `gpuFallback.ts` and the Aero safe-mode settings, several of which write
 * during their own boot and none of which share one event. Observing the DOM is
 * the only reader that cannot fall out of date with a new writer.
 */
export function bootFlatten(): () => void {
  const root = document.documentElement;
  const media =
    typeof window.matchMedia === 'function'
      ? window.matchMedia(REDUCED_TRANSPARENCY_QUERY)
      : null;

  const sync = (): void => {
    applyFlatten(root, shouldFlatten(readFlattenInputs(root, media?.matches ?? false)));
  };

  sync();

  const observer = new MutationObserver(sync);
  observer.observe(root, { attributes: true, attributeFilter: [...FLATTEN_ATTRS] });
  media?.addEventListener('change', sync);

  return () => {
    observer.disconnect();
    media?.removeEventListener('change', sync);
  };
}
