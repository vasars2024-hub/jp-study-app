/*
 * Styles for the reader popup, which lives in a CLOSED shadow root (content.js
 * ensurePopup): page CSS cannot reach it and these rules cannot reach the page.
 * Loaded as a content script before content.js; kept as a string so the popup
 * is styled synchronously without exposing a web-accessible stylesheet.
 */
// eslint-disable-next-line no-unused-vars
var GUM_POPUP_CSS = String.raw`
:host {
  all: initial;
}
#jp-study-popup {
  --rp-width: 360px;
  --rp-font: 14px;
  --rp-bg: #1b1e26;
  --rp-bg2: #21252f;
  --rp-border: rgba(255, 255, 255, 0.09);
  --rp-text: #e8eaef;
  --rp-muted: #98a0af;
  --rp-accent: #9c2b3d;
  --rp-accent-soft: rgba(156, 43, 61, 0.16);
  position: fixed;
  z-index: 2147483646;
  width: var(--rp-width);
  display: none;
  flex-direction: column;
  background: var(--rp-bg);
  color: var(--rp-text);
  border: 1px solid var(--rp-border);
  border-radius: 12px;
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.45);
  font: var(--rp-font) / 1.5 "Segoe UI", system-ui, sans-serif;
  text-align: left;
  overflow: hidden;
}
#jp-study-popup.open { display: flex; }
#jp-study-popup.pinned {
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(156, 43, 61, 0.5);
}
#jp-study-popup .rp-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 6px;
  flex-shrink: 0;
}
#jp-study-popup.pinned .rp-head { cursor: grab; }
#jp-study-popup .rp-headline {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
#jp-study-popup .rp-term {
  font-size: calc(var(--rp-font) + 6px);
  font-weight: 650;
  line-height: 1.3;
  word-break: break-all;
}
#jp-study-popup .rp-reading {
  font-size: calc(var(--rp-font) - 1px);
  color: var(--rp-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#jp-study-popup .rp-head-actions { display: flex; gap: 2px; flex-shrink: 0; }
#jp-study-popup .rp-icon {
  background: none;
  border: 0;
  color: #98a0af;
  font: inherit;
  font-size: 15px;
  line-height: 1;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
#jp-study-popup .rp-icon:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #e8eaef;
}
#jp-study-popup .rp-pin.on { color: #d98a97; background: var(--rp-accent-soft); }
#jp-study-popup .rp-back {
  background: none;
  border: 0;
  color: var(--rp-muted);
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
  border-radius: 6px;
}
#jp-study-popup .rp-back:hover { background: rgba(255, 255, 255, 0.08); }
#jp-study-popup .rp-sub {
  padding: 0 12px 6px;
  font-size: calc(var(--rp-font) - 2px);
  color: var(--rp-muted);
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  flex-shrink: 0;
}
#jp-study-popup .rp-base b { color: var(--rp-text); font-weight: 600; }
#jp-study-popup .rp-deinf { opacity: 0.8; }
#jp-study-popup .rp-badge,
#jp-study-popup .rp-pos {
  font-size: calc(var(--rp-font) - 3px);
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid var(--rp-border);
  background: var(--rp-bg2);
  white-space: nowrap;
}
#jp-study-popup .rp-badge.common { color: #9fd6b5; border-color: rgba(76, 197, 132, 0.35); }
#jp-study-popup .rp-badge.jlpt { color: #d9b96a; border-color: rgba(216, 160, 29, 0.35); }
#jp-study-popup .rp-badge.span-ok { color: #9fd6b5; border-color: rgba(76, 197, 132, 0.35); }
#jp-study-popup .rp-badge.span-guess { color: var(--rp-muted); }
#jp-study-popup .rp-known {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px 8px;
  flex-shrink: 0;
}
#jp-study-popup .rp-known-label {
  font-size: calc(var(--rp-font) - 3px);
  color: var(--rp-muted);
  margin-right: 2px;
}
#jp-study-popup .rp-known-btn {
  background: var(--rp-bg2);
  border: 1px solid var(--rp-border);
  color: var(--rp-muted);
  font: inherit;
  font-size: calc(var(--rp-font) - 3px);
  padding: 2px 8px;
  border-radius: 999px;
  cursor: pointer;
}
#jp-study-popup .rp-known-btn:hover { color: var(--rp-text); }
#jp-study-popup .rp-known-btn.active {
  background: var(--rp-accent-soft);
  border-color: rgba(156, 43, 61, 0.5);
  color: #e8b7bf;
  font-weight: 600;
}
#jp-study-popup .rp-tabs {
  display: flex;
  gap: 0;
  border-top: 1px solid var(--rp-border);
  border-bottom: 1px solid var(--rp-border);
  flex-shrink: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
#jp-study-popup .rp-tab {
  flex: 1;
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--rp-muted);
  font: inherit;
  font-size: calc(var(--rp-font) - 2px);
  padding: 7px 4px;
  cursor: pointer;
  white-space: nowrap;
}
#jp-study-popup .rp-tab:hover { color: var(--rp-text); background: rgba(255, 255, 255, 0.03); }
#jp-study-popup .rp-tab.active {
  color: var(--rp-text);
  font-weight: 600;
  border-bottom-color: var(--rp-accent);
}
#jp-study-popup .rp-body {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 10px 12px;
  flex: 1;
  min-height: 60px;
}
#jp-study-popup .rp-body:focus { outline: none; }
#jp-study-popup .rp-entry { padding: 6px 0; border-bottom: 1px solid var(--rp-border); }
#jp-study-popup .rp-entry:last-child { border-bottom: 0; }
#jp-study-popup .rp-entry-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
#jp-study-popup .rp-entry-word { font-weight: 650; font-size: calc(var(--rp-font) + 1px); }
#jp-study-popup .rp-entry-reading { color: var(--rp-muted); font-size: calc(var(--rp-font) - 1px); }
#jp-study-popup .rp-entry-src {
  margin-left: auto;
  font-size: calc(var(--rp-font) - 4px);
  color: var(--rp-muted);
  opacity: 0.75;
}
#jp-study-popup .rp-senses { margin: 4px 0 2px; padding-left: 20px; }
#jp-study-popup .rp-senses li { margin: 2px 0; }
#jp-study-popup .rp-sense-pos { color: var(--rp-muted); font-size: calc(var(--rp-font) - 3px); }
#jp-study-popup .rp-gloss-html { font-size: calc(var(--rp-font) - 1px); margin: 4px 0; }
#jp-study-popup .rp-gloss-html * { max-width: 100%; }
#jp-study-popup .rp-pitch {
  font-size: calc(var(--rp-font) - 2px);
  color: var(--rp-muted);
  margin: 2px 0 4px;
}
#jp-study-popup .rp-pitch-label {
  font-size: calc(var(--rp-font) - 4px);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-right: 6px;
}
#jp-study-popup .rp-empty { color: var(--rp-muted); padding: 8px 0; font-size: calc(var(--rp-font) - 1px); }
#jp-study-popup .rp-loading { color: var(--rp-muted); padding: 8px 0; }
#jp-study-popup .rp-loading-inline { color: var(--rp-muted); font-size: calc(var(--rp-font) - 2px); }
#jp-study-popup .rp-note {
  color: var(--rp-muted);
  font-size: calc(var(--rp-font) - 3px);
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--rp-border);
}
#jp-study-popup .rp-dim { color: var(--rp-muted); opacity: 0.85; }
#jp-study-popup .rp-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
#jp-study-popup .rp-mini {
  background: var(--rp-bg2);
  border: 1px solid var(--rp-border);
  color: var(--rp-text);
  font: inherit;
  font-size: calc(var(--rp-font) - 3px);
  padding: 3px 10px;
  border-radius: 7px;
  cursor: pointer;
}
#jp-study-popup .rp-mini:hover { background: #2a2f3a; }
#jp-study-popup .rp-sentence-line {
  font-size: var(--rp-font);
  line-height: 1.9;
  margin-bottom: 4px;
  word-break: break-word;
}
#jp-study-popup .rp-sentence-line.big { font-size: calc(var(--rp-font) + 2px); }
#jp-study-popup .rp-hl-term {
  color: #e8b7bf;
  background: var(--rp-accent-soft);
  border-radius: 3px;
  padding: 0 2px;
  font-weight: 650;
}
#jp-study-popup .rp-hl-grammar {
  text-decoration: underline;
  text-decoration-color: #d9b96a;
  text-decoration-thickness: 2px;
  text-underline-offset: 4px;
}
#jp-study-popup .rp-sentence-tools { margin-top: 2px; }
#jp-study-popup .rp-sentence-edit {
  width: 100%;
  margin-top: 8px;
  background: var(--rp-bg2);
  border: 1px solid var(--rp-border);
  border-radius: 8px;
  color: var(--rp-text);
  font: inherit;
  padding: 7px 9px;
  resize: vertical;
  box-sizing: border-box;
}
#jp-study-popup .rp-sentence-stats {
  margin-top: 10px;
  font-size: calc(var(--rp-font) - 2px);
  color: var(--rp-muted);
}
#jp-study-popup .rp-stat b { color: var(--rp-text); }
#jp-study-popup .rp-grammar { padding: 7px 0; border-bottom: 1px solid var(--rp-border); }
#jp-study-popup .rp-grammar:last-of-type { border-bottom: 0; }
#jp-study-popup .rp-grammar-head { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
#jp-study-popup .rp-grammar-title { font-weight: 650; }
#jp-study-popup .rp-grammar-meaning {
  color: var(--rp-muted);
  font-size: calc(var(--rp-font) - 1px);
  margin-top: 2px;
}
#jp-study-popup .rp-kanji {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 7px 0;
  border-bottom: 1px solid var(--rp-border);
}
#jp-study-popup .rp-kanji:last-child { border-bottom: 0; }
#jp-study-popup .rp-kanji-char {
  font-size: calc(var(--rp-font) + 14px);
  line-height: 1.2;
  background: var(--rp-bg2);
  border: 1px solid var(--rp-border);
  border-radius: 9px;
  color: var(--rp-text);
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
}
#jp-study-popup .rp-kanji-char:hover { background: var(--rp-accent-soft); }
#jp-study-popup .rp-kanji-meta { min-width: 0; }
#jp-study-popup .rp-kanji-reading { color: var(--rp-muted); font-size: calc(var(--rp-font) - 2px); }
#jp-study-popup .rp-kanji-meanings { font-size: calc(var(--rp-font) - 1px); margin-top: 1px; }
#jp-study-popup .rp-example { padding: 7px 0; border-bottom: 1px solid var(--rp-border); }
#jp-study-popup .rp-example:last-child { border-bottom: 0; }
#jp-study-popup .rp-example-jp { line-height: 1.8; }
#jp-study-popup .rp-example-en {
  color: var(--rp-muted);
  font-size: calc(var(--rp-font) - 2px);
  margin-top: 1px;
}
#jp-study-popup .rp-example-tools { display: flex; gap: 6px; margin-top: 4px; }
#jp-study-popup .rp-example-credit {
  color: var(--rp-muted);
  font-size: calc(var(--rp-font) - 3px);
  margin: 8px 0 0;
}
#jp-study-popup .rp-example-credit a { color: inherit; text-decoration: underline; }
#jp-study-popup .rp-more-row {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 10px;
  padding: 5px 0;
  font-size: calc(var(--rp-font) - 1px);
}
#jp-study-popup .rp-more-k { color: var(--rp-muted); }
#jp-study-popup .rp-more-v { min-width: 0; word-break: break-word; }
#jp-study-popup .rp-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#jp-study-popup .rp-foot {
  display: flex;
  gap: 6px;
  padding: 8px 12px 10px;
  border-top: 1px solid var(--rp-border);
  flex-shrink: 0;
  align-items: center;
}
#jp-study-popup .rp-act {
  background: #21252f;
  border: 1px solid rgba(255, 255, 255, 0.09);
  color: #e8eaef;
  font: inherit;
  font-size: 12.5px;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
}
#jp-study-popup .rp-act:hover { background: #2a2f3a; }
#jp-study-popup .rp-primary {
  background: rgba(156, 43, 61, 0.2);
  border-color: rgba(156, 43, 61, 0.5);
  font-weight: 600;
}
#jp-study-popup .rp-primary:hover { background: rgba(156, 43, 61, 0.32); }
#jp-study-popup .rp-overflow { margin-left: auto; }
#jp-study-popup .rp-overflow-menu {
  position: absolute;
  right: 10px;
  bottom: 46px;
  background: var(--rp-bg2);
  border: 1px solid var(--rp-border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  min-width: 190px;
  overflow: hidden;
  z-index: 3;
}
#jp-study-popup .rp-overflow-menu[hidden] { display: none; }
#jp-study-popup .rp-overflow-menu button {
  background: none;
  border: 0;
  color: var(--rp-text);
  font: inherit;
  font-size: calc(var(--rp-font) - 2px);
  text-align: left;
  padding: 8px 12px;
  cursor: pointer;
}
#jp-study-popup .rp-overflow-menu button:hover { background: rgba(255, 255, 255, 0.06); }
#jp-study-popup.compact .rp-sub,
#jp-study-popup.compact .rp-known { padding-bottom: 4px; }
#jp-study-popup.compact .rp-body { padding: 8px 12px; }
@media (prefers-contrast: more) {
  #jp-study-popup {
    border-color: rgba(255, 255, 255, 0.45);
  }
  #jp-study-popup .rp-tab.active { border-bottom-width: 3px; }
}
#jp-study-popup[data-theme="light"] {
  --rp-bg: #ffffff;
  --rp-bg2: #f3f4f7;
  --rp-border: rgba(0, 0, 0, 0.12);
  --rp-text: #1d2129;
  --rp-muted: #5f6673;
  --rp-accent: #9c2b3d;
  --rp-accent-soft: rgba(156, 43, 61, 0.1);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
}
#jp-study-popup .rp-body {
  overflow-y: auto;
  overscroll-behavior: contain;
}
#jp-study-popup .rp-entry-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
}
#jp-study-popup .rp-entry-badges {
  display: inline-flex;
  gap: 4px;
}
#jp-study-popup .rp-entry-tools {
  margin-left: auto;
  display: inline-flex;
  gap: 4px;
}
#jp-study-popup .rp-entry-tools .rp-mini {
  min-width: 24px;
  padding: 1px 6px;
}
#jp-study-popup .rp-entry.focused {
  box-shadow: inset 2px 0 0 var(--rp-accent);
}
#jp-study-popup .rp-entry.in-deck .rp-entry-add {
  color: var(--rp-muted);
}
#jp-study-popup .rp-entry.in-deck .rp-entry-add::after {
  content: " \2713";
}
#jp-study-popup .rp-entry-src {
  font-size: calc(var(--rp-font) - 3px);
  color: var(--rp-muted);
  margin-top: 2px;
}
#jp-study-popup .rp-pitch {
  font-size: calc(var(--rp-font) - 1px);
  color: var(--rp-muted);
}
#jp-study-popup .rp-pitch-num {
  margin-left: 3px;
  font-size: calc(var(--rp-font) - 3px);
  color: var(--rp-muted);
}
/* The app's dictionary layout: de-inflection trace, per-dictionary sections, per-sense labels. */
#jp-study-popup .rp-trace {
  font-size: calc(var(--rp-font) - 2px);
  color: var(--rp-muted);
  margin: 0 0 4px;
  line-height: 1.6;
  word-break: break-word;
}
#jp-study-popup .rp-trace-form { color: var(--rp-text); }
#jp-study-popup .rp-trace-step {
  display: inline-block;
  padding: 0 5px;
  border: 1px solid var(--rp-border);
  border-radius: 6px;
}
#jp-study-popup .rp-trace-sep { opacity: 0.7; }
#jp-study-popup .rp-dict { margin-top: 4px; }
#jp-study-popup .rp-dict + .rp-dict { padding-top: 4px; border-top: 1px dashed var(--rp-border); }
#jp-study-popup .rp-dict-name {
  font-size: calc(var(--rp-font) - 3px);
  color: var(--rp-muted);
  letter-spacing: 0.02em;
}
#jp-study-popup .rp-sense-dict {
  display: inline-block;
  font-size: calc(var(--rp-font) - 4px);
  color: var(--rp-muted);
  border: 1px solid var(--rp-border);
  border-radius: 5px;
  padding: 0 4px;
  margin-right: 2px;
}
#jp-study-popup .rp-more-dicts {
  margin-top: 4px;
  min-height: 24px;
}
`;
