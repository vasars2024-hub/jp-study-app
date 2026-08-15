/**
 * The sandboxed document a rendered Anki card is shown in.
 *
 * Shared by the inspector's preview and the representative-card gallery so
 * there is exactly one place the containment rules live. Rendered card HTML
 * comes out of a foreign package: it may carry a script, a remote beacon or a
 * full-page overlay. Every consumer puts this document in a `sandbox=""` iframe
 * — the empty allow-list — and the CSP inside it keeps the deck offline.
 */
export type PreviewTheme = 'light' | 'dark';

/** Anki's own default card colours, so a deck's CSS lands on the background it expects. */
export const PREVIEW_THEME_CSS: Record<PreviewTheme, string> = {
  light: 'background:#ffffff;color:#000000;',
  dark: 'background:#2f2f31;color:#fbfbfb;',
};

export function previewFrameDocument(html: string, css: string, theme: PreviewTheme): string {
  return [
    '<!DOCTYPE html><html><head><meta charset="utf-8">',
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ',
    "img-src data:; style-src 'unsafe-inline'; font-src data:\">",
    `<style>html,body{margin:0;padding:12px;${PREVIEW_THEME_CSS[theme]}}`,
    `.card{${PREVIEW_THEME_CSS[theme]}}`,
    css,
    '</style></head><body><div class="card">',
    html,
    '</div></body></html>',
  ].join('');
}
