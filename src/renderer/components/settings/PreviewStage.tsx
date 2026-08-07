/**
 * PreviewStage — a live, isolated miniature of the app's own chrome.
 * -----------------------------------------------------------------------------
 * v1.0 audit §2.3 / §2.4. Both items ask for the same missing thing: somewhere to
 * *see* a look change before it becomes the look. This is that surface, built once and
 * driven by two callers — the CSS Playground feeds it draft CSS, the Appearance preview
 * feeds it draft design tokens.
 *
 * **Why an iframe.** The stage has to render markup that carries the app's real class
 * names — `.os-taskbar`, `.fwin`, `.os-set-card` — because that is what a user's CSS and
 * the app's own stylesheets target. In the main document those rules would apply to the
 * preview *and* the preview's rules would apply to the app, so a draft would already have
 * escaped by the time you looked at it. A same-origin iframe gives real isolation with no
 * selector rewriting: the app's stylesheets are cloned in, so the preview inherits the
 * whole design system, and anything the preview adds stays inside it.
 *
 * The alternative considered was `@scope (.preview) { … }` in the live document. It is
 * cheaper, but `:root` does not match inside a scope — so the one case that matters most
 * here, a design-token override, is exactly the case it cannot show — and at-rules like
 * `@keyframes` do not survive the wrapping either.
 *
 * **Cost.** Mirroring clones every `<style>`/`<link>` in the document: ~27 nodes and
 * ~700 KB of CSS in this app. That is a one-time parse when the stage mounts, not
 * per-keystroke — draft updates only rewrite one small `<style>` inside the frame.
 */

import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';

/** The sandbox's own live stylesheet: the preview supplies its own draft instead. */
const LIVE_USER_CSS_ID = 'jp-user-css';
const DRAFT_STYLE_ID = 'jp-preview-draft';

export interface PreviewStageProps {
  /** Draft CSS, applied inside the preview only. */
  css?: string;
  /** Design tokens to override on the preview's own `<html>` (without the `--`). */
  tokens?: Record<string, string>;
  /** `data-*` attributes to override on the preview's `<html>`; `null` removes one. */
  attrs?: Record<string, string | null>;
  /** Bump to re-clone the app's stylesheets (after a theme switch, say). */
  mirrorKey?: string | number;
  /** Reported after each draft update: how many root variables had to be promoted. */
  onPromoted?: (count: number) => void;
  className?: string;
}

/**
 * Representative chrome, in the app's real class names. Hand-written rather than cloned
 * from the live DOM: a cloned `.fwin` drags its React-managed subtree, its inline
 * geometry and whatever state it happened to be in into a surface that must stay inert.
 * Structures verified against the running app (taskbar, window bar, settings card).
 */
function stageMarkup(labels: Record<string, string>): string {
  return `
<div class="os-desktop jp-preview-desk">
  <div class="jp-preview-icons">
    <div class="os-desk-icon"><div class="os-desk-icon-img app-dictionary"></div><span class="os-desk-icon-label">${labels.icon1}</span></div>
    <div class="os-desk-icon"><div class="os-desk-icon-img app-library"></div><span class="os-desk-icon-label">${labels.icon2}</span></div>
  </div>
  <section class="fwin jp-preview-win">
    <div class="fwin-bar">
      <span class="fwin-title"><span class="fwin-title-text">${labels.window}</span></span>
      <span class="fwin-btns">
        <button class="fwin-b" type="button">&#8211;</button>
        <button class="fwin-b" type="button">&#9633;</button>
        <button class="fwin-b fwin-close" type="button">&#10005;</button>
      </span>
    </div>
    <div class="fwin-body jp-preview-body">
      <section class="os-set-card">
        <header class="os-set-card-head">
          <div class="os-set-card-text">
            <h3 class="os-set-card-title">${labels.cardTitle}</h3>
            <p class="os-set-card-desc muted">${labels.cardDesc}</p>
          </div>
        </header>
        <div class="os-set-card-body">
          <div class="os-set-btns">
            <button class="btn small primary" type="button">${labels.primary}</button>
            <button class="btn small" type="button">${labels.secondary}</button>
          </div>
          <label class="os-toggle"><input type="checkbox" checked /><span>${labels.toggle}</span></label>
          <input class="os-input" type="text" value="${labels.field}" readonly />
        </div>
      </section>
    </div>
  </section>
  <div class="os-taskbar os-taskbar-full jp-preview-taskbar">
    <button class="os-start-btn" type="button"><span>${labels.start}</span></button>
    <div class="os-task-wins"><button class="os-task-win active" type="button">${labels.window}</button></div>
    <div class="os-tray"><button class="os-tray-btn" type="button">&#9679;</button></div>
  </div>
</div>`;
}

/**
 * The stage renders at a fixed desktop size and is scaled to fit its container, so it is
 * a true miniature: proportions stay right and nothing is clipped, whatever box it is
 * dropped into. Laying it out at container size instead produced a cramped desktop whose
 * sample window was cut in half — which reads as a rendering bug, not a preview.
 */
const BASE_W = 1000;
const BASE_H = 680;

/** Layout for the stage itself — deliberately separate from anything a draft can reach. */
const STAGE_CSS = `
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
  .jp-preview-desk {
    position: relative; height: 100%; padding: 20px; box-sizing: border-box;
    display: flex; flex-direction: column; gap: 16px;
    /*
     * A wallpaper stand-in, not var(--bg). Desktop icon labels are white with a drop
     * shadow because the real desktop always has a wallpaper behind them — on a light
     * theme a flat --bg desk rendered them white-on-white and they disappeared.
     * A dark accent-tinted gradient is also what the core wall presets actually are.
     * (No backticks in here: this block lives inside a template literal.)
     */
    background:
      radial-gradient(120% 90% at 12% 0%, color-mix(in srgb, var(--accent) 26%, transparent), transparent 60%),
      linear-gradient(150deg, #14161f, #0a0b10);
  }
  /* The real .os-desk-icon is absolutely positioned from an inline x/y the shell
     writes per icon. Without that inline style every icon stacks at the same origin —
     which is exactly what the first version of this stage rendered. */
  .jp-preview-icons { display: flex; gap: 14px; align-items: flex-start; }
  .jp-preview-icons .os-desk-icon {
    position: relative; inset: auto; left: auto; top: auto; transform: none;
  }
  .jp-preview-win { position: relative; flex: 1; display: flex; flex-direction: column;
    min-height: 0; inset: auto; transform: none; width: auto; height: auto; }
  .jp-preview-body { flex: 1; overflow: auto; padding: 12px; }
  .jp-preview-taskbar { position: relative; inset: auto; }
  /* Laid out in a row, not the app's column: the stage is short, and a clipped sample
     card reads as a rendering bug rather than a preview. */
  .os-set-card-body {
    display: flex; flex-flow: row wrap; gap: 10px; align-items: center;
  }
  .os-set-card-body .os-input { max-width: 160px; }
`;

/** Copy `<html>`'s identity so the preview resolves the same tokens as the app. */
function mirrorRoot(target: HTMLElement, source: HTMLElement): void {
  for (const attr of Array.from(target.attributes)) target.removeAttribute(attr.name);
  for (const attr of Array.from(source.attributes)) target.setAttribute(attr.name, attr.value);
}

function mirrorStyles(doc: Document): void {
  doc.head.replaceChildren();
  for (const node of Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))) {
    if (node.id === LIVE_USER_CSS_ID) continue;
    doc.head.appendChild(node.cloneNode(true));
  }
  const stage = doc.createElement('style');
  stage.textContent = STAGE_CSS;
  doc.head.appendChild(stage);
}

/**
 * The same promotion `customCss.applyCustomCss` performs on the live sandbox — without
 * it the preview would show a token override working when the real app would ignore it,
 * which is worse than no preview at all. See that module for why it is needed.
 */
function promoteRootVars(rules: CSSRuleList | undefined): number {
  if (!rules) return 0;
  let promoted = 0;
  for (const rule of Array.from(rules)) {
    const styleRule = rule as CSSStyleRule;
    if (typeof styleRule.selectorText === 'string' && styleRule.style) {
      const targetsRoot = styleRule.selectorText
        .split(',')
        .some((selector) => /^\s*(:root|html)(?![\w-])/i.test(selector));
      if (targetsRoot) {
        for (const name of Array.from(styleRule.style).filter((n) => n.startsWith('--'))) {
          if (styleRule.style.getPropertyPriority(name)) continue;
          styleRule.style.setProperty(name, styleRule.style.getPropertyValue(name), 'important');
          promoted += 1;
        }
      }
    }
    const nested = (rule as CSSGroupingRule).cssRules;
    if (nested) promoted += promoteRootVars(nested);
  }
  return promoted;
}

export default function PreviewStage({
  css = '',
  tokens,
  attrs,
  mirrorKey,
  onPromoted,
  className = '',
}: PreviewStageProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const { t, lang } = useT();

  // Fit the fixed-size desktop into whatever box the caller gave us.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const fit = (): void => {
      const { width, height } = wrap.getBoundingClientRect();
      if (!width || !height) return;
      setScale(Math.min(width / BASE_W, height / BASE_H));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);
  // Read in the draft effect but deliberately NOT a dependency of it: re-running that
  // effect on every render would rewrite the draft sheet for no reason.
  const promotedRef = useRef(onPromoted);
  promotedRef.current = onPromoted;

  // Build (and rebuild) the frame's document.
  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    mirrorRoot(doc.documentElement, document.documentElement);
    mirrorStyles(doc);
    doc.body.innerHTML = stageMarkup({
      icon1: t('settings.preview.icon.dictionary'),
      icon2: t('settings.preview.icon.library'),
      window: t('settings.preview.window'),
      cardTitle: t('settings.preview.card.title'),
      cardDesc: t('settings.preview.card.desc'),
      primary: t('settings.preview.button.primary'),
      secondary: t('settings.preview.button.secondary'),
      toggle: t('settings.preview.toggle'),
      field: t('settings.preview.field'),
      start: t('settings.preview.start'),
    });
    // Inert by construction: the stage is a picture of the app, not a second copy of it.
    doc.body.addEventListener('click', (e) => e.preventDefault(), true);
    doc.body.addEventListener('keydown', (e) => e.preventDefault(), true);
  }, [mirrorKey, lang, t]);

  // Draft CSS.
  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    let node = doc.getElementById(DRAFT_STYLE_ID) as HTMLStyleElement | null;
    if (!node) {
      node = doc.createElement('style');
      node.id = DRAFT_STYLE_ID;
      doc.head.appendChild(node);
    }
    node.textContent = css;
    let promoted = 0;
    try {
      promoted = promoteRootVars(node.sheet?.cssRules);
    } catch {
      /* an unparsed sheet is a degraded preview, not a failure */
    }
    promotedRef.current?.(promoted);
  }, [css, mirrorKey]);

  // Token overrides land as inline custom properties, exactly as the real
  // `osPersonalization` writes them — including their precedence over plain rules.
  useEffect(() => {
    const root = frameRef.current?.contentDocument?.documentElement;
    if (!root) return;
    for (const [token, value] of Object.entries(tokens ?? {})) {
      root.style.setProperty(`--${token}`, value);
    }
  }, [tokens, mirrorKey]);

  useEffect(() => {
    const root = frameRef.current?.contentDocument?.documentElement;
    if (!root) return;
    for (const [name, value] of Object.entries(attrs ?? {})) {
      if (value === null) root.removeAttribute(name);
      else root.setAttribute(name, value);
    }
  }, [attrs, mirrorKey]);

  return (
    <div ref={wrapRef} className={`os-preview-stage-wrap ${className}`.trim()}>
      <iframe
        ref={frameRef}
        className="os-preview-stage"
        title={t('settings.preview.frameTitle')}
        style={{ width: BASE_W, height: BASE_H, transform: `scale(${scale})` }}
        // Scripts off, same-origin on. Both halves are load-bearing: dropping
        // `allow-same-origin` gives the frame an opaque origin, and `contentDocument`
        // then reads `null` from here — the stage would silently never populate.
        sandbox="allow-same-origin"
        aria-label={t('settings.preview.frameTitle')}
      />
    </div>
  );
}
