import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Blanc's `toolbox:open-tool` deep link used to lose the tool it was asked for
 * whenever it arrived from a tab other than the toolbox.
 *
 * `onOpenTool` switched to the `tools` tab and, in the same tick, dispatched
 * `toolbox:select-tool`. The listener for that event lives in `BlancToolsPanel`,
 * which only mounts once `tools` renders, and it registers in a `useEffect` —
 * which React runs after paint. Measured on the Blanc harness: `open-tool`
 * dispatched at t=801.1 ms, the next animation frame at t=819.4 ms, the listener
 * registered at t=825.7 ms. So the event had no listener, and deferring the
 * dispatch by one frame (the shape used by the master-search paths) still landed
 * 6.3 ms early. The tab switched and the previously open tool simply stayed.
 *
 * The fix carries the request as a keyed PROP instead, so there is no race to
 * lose. These assertions read the SOURCE with comments stripped, so the prose
 * above cannot satisfy any of them.
 */

const SHELL_PATH = resolve(__dirname, '../components/blanc/BlancShell.tsx');

/** Strip block and line comments so documentation can never satisfy a match. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** The body of the `onOpenTool` handler, which is where the defect lived. */
function onOpenToolBody(code: string): string {
  const start = code.indexOf('const onOpenTool');
  expect(start).toBeGreaterThan(-1);
  const end = code.indexOf("window.addEventListener('blanc:select-tab'", start);
  expect(end).toBeGreaterThan(start);
  return code.slice(start, end);
}

describe('Blanc toolbox deep link survives arriving from another tab', () => {
  const code = stripComments(readFileSync(SHELL_PATH, 'utf8'));

  it('does not deliver the requested tool through toolbox:select-tool', () => {
    // The racy shape: the toolbox is not mounted yet, so nothing hears this.
    expect(onOpenToolBody(code)).not.toContain('toolbox:select-tool');
  });

  it('records the request as state that survives the toolbox mounting', () => {
    expect(onOpenToolBody(code)).toContain('setToolRequest');
  });

  it('bumps a key so the same tool can be requested twice in a row', () => {
    // Without the key, re-requesting the tool already in `toolRequest` would be
    // an identical value and the consuming effect would never re-run.
    expect(onOpenToolBody(code)).toMatch(/key:\s*\(previous\?\.key\s*\?\?\s*0\)\s*\+\s*1/);
  });

  it('threads the request into the toolbox panel as a prop', () => {
    expect(code).toMatch(/<BlancToolsPanel[\s\S]{0,200}?toolRequest=\{toolRequest\}/);
    expect(code).toMatch(/function BlancToolsPanel\(\{[\s\S]{0,200}?toolRequest,/);
  });

  it('applies the request from an effect keyed on the request, not on render', () => {
    // Keying on `chooseTool`'s identity would re-run every render and pin the
    // user to the deep-linked tool; keying on the request applies it once.
    const effect = code.match(/useEffect\(\(\) => \{[^}]*toolRequestId[\s\S]{0,200}?\}, \[([^\]]*)\]\)/);
    expect(effect).not.toBeNull();
    const deps = (effect?.[1] ?? '').replace(/\s/g, '');
    expect(deps).toBe('toolRequestKey,toolRequestId');
  });

  it('still routes ids that own a whole tab to that tab instead of the toolbox', () => {
    // The deep link serves both kinds of id; the fix must not swallow the first.
    const body = onOpenToolBody(code);
    expect(body).toContain('const direct = directTabs[feature]');
    expect(body).toMatch(/if \(direct\) \{\s*chooseTab\(direct\);\s*return;/);
  });
});
