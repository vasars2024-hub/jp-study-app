/**
 * wid6 — a live, inert preview of a widget for the gallery.
 *
 * The gallery described widgets in a sentence each; you only saw one by adding
 * it. This renders the real component at its default size, scaled into the
 * gallery's preview stage, wearing the current theme's frame (an Aero gadget, a
 * Wired module rack, the plain card) — so what you see is what lands on the desk.
 *
 * It is a picture, not a second copy of the widget: `inert` takes it out of the
 * tab order and the pointer, `aria-hidden` out of the accessibility tree (the
 * gallery card already says what it is), and no `instanceId` is passed, which is
 * the widgets' own contract for "this is a preview — keep no per-instance state".
 * A widget that throws while previewed shows its description instead of taking
 * the gallery down.
 */
import { Component, type ReactNode } from 'react';
import type { WidgetDef } from './types';

/** The stage the preview is scaled into. */
export const PREVIEW_STAGE = { w: 232, h: 176 } as const;

const NO_SETTINGS: Record<string, unknown> = Object.freeze({}) as Record<string, unknown>;
const ignoreSettings = (): void => undefined;

class PreviewBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    /* A preview that cannot render is replaced by its description; nothing to log. */
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** The scale that fits a widget's default size into the stage (never enlarged). */
export function previewScale(size: { w: number; h: number }, stage: { w: number; h: number } = PREVIEW_STAGE): number {
  return Math.min(1, stage.w / Math.max(1, size.w), stage.h / Math.max(1, size.h));
}

export interface WidgetPreviewProps {
  def: WidgetDef;
  title: string;
  description: string;
  aero: boolean;
  wired: boolean;
}

export default function WidgetPreview({ def, title, description, aero, wired }: WidgetPreviewProps) {
  const { w, h } = def.defaultSize;
  const scale = previewScale(def.defaultSize);
  const Body = def.component;
  const fallback = <div className="widget-preview-fallback">{description}</div>;
  return (
    <div className="widget-preview-stage" style={{ width: PREVIEW_STAGE.w, height: PREVIEW_STAGE.h }} data-widget-preview={def.type}>
      <div
        className={`widget-frame widget-preview-frame${aero ? ' aero-gadget' : ''}${wired ? ' widget-preview-wired' : ''}`}
        inert
        aria-hidden="true"
        style={{ width: w, height: h, transform: `scale(${scale})` }}
      >
        {!aero && (
          <div className="widget-bar">
            <span className="widget-title">{title}</span>
          </div>
        )}
        <div className="widget-body">
          {def.previewLive === false ? (
            fallback
          ) : (
            <PreviewBoundary fallback={fallback}>
              <Body settings={NO_SETTINGS} setSettings={ignoreSettings} size={{ w, h: aero ? h : h - 30 }} />
            </PreviewBoundary>
          )}
        </div>
      </div>
    </div>
  );
}
