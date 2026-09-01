/**
 * The extension deep-link allow-list also exists TWICE, across the process boundary.
 *
 * `main/extensionServer.ts` decides which `POST /v1/ui/open` targets are accepted at
 * all (`UI_OPEN_TARGETS`), and its own comment states the invariant in as many words:
 * "every target accepted here must resolve to a real case there, or the renderer will
 * silently no-op on focus". `renderer/extensionBridgeUi.ts` holds the other half in
 * `resolveExtensionUiOpen`, whose miss case is literally `{ kind: 'noop' }`.
 *
 * Nothing compared the two. That is the same shape as the pop-out allow-list defect
 * that `popoutSectionParity.test.ts` was written for (gate 8 deleted the Notebook
 * section, the label map lost `notebook` and never gained `files`, and main went on
 * offering `?popout=files` to a renderer that answered `null`). Here the equivalent
 * casualty is live and load-bearing in the other direction: an INSTALLED extension is
 * not upgraded in lockstep with the app, so it still sends `notebook` forever, and the
 * only thing keeping that working is one line mapping it onto the Files app.
 *
 * A `noop` here is silent by construction — main focuses a window, broadcasts, and
 * reports success; the renderer opens nothing. So the test has to assert the absence
 * of `noop` rather than wait for a thrown error.
 *
 * Main's list is read from source, not imported: `main/extensionServer.ts` pulls in
 * Electron at module-evaluation time, which is not something a parity assertion should
 * need.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveExtensionUiOpen } from '../extensionBridgeUi';
import { normalizeWinSection, DESKTOP_WIN_SECTIONS } from '../../shared/desktop';

const SRC = resolve(__dirname, '../..');

/** The members of `UI_OPEN_TARGETS` in main/extensionServer.ts. */
function mainUiOpenTargets(): string[] {
  const source = readFileSync(resolve(SRC, 'main/extensionServer.ts'), 'utf8');
  const body = /const UI_OPEN_TARGETS = new Set\(\[([\s\S]*?)\]\);/.exec(source)?.[1];
  if (!body) throw new Error('could not find UI_OPEN_TARGETS in main/extensionServer.ts');
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('the extension deep-link allow-list agrees with itself across the process boundary', () => {
  /*
   * Positive control first. Every assertion below is "no member of main's list
   * resolves to noop", and an empty list satisfies that perfectly — so the parser
   * has to be proven to find something before its silence means anything.
   */
  it('main’s list parses, so an agreement is a real agreement', () => {
    expect(mainUiOpenTargets().length).toBeGreaterThan(15);
    expect(mainUiOpenTargets()).toContain('clipboard');
  });

  it('every target main accepts resolves to a real route in the desktop shell', () => {
    const dead = mainUiOpenTargets().filter(
      (t) => resolveExtensionUiOpen(t, false).kind === 'noop',
    );
    expect(dead).toEqual([]);
  });

  it('every target main accepts resolves to a real route inside Blanc too', () => {
    // Blanc is a whole second shell for the same targets. A target that routes in one
    // and dead-ends in the other is a capability that depends on which window the user
    // happens to have focused, which is exactly the "never a gatekeeper" failure.
    const dead = mainUiOpenTargets().filter(
      (t) => resolveExtensionUiOpen(t, true).kind === 'noop',
    );
    expect(dead).toEqual([]);
  });

  it('every os-section route names a section the desktop can actually open', () => {
    // `openAppSection` only dispatches the string; the desktop resolves it with
    // `normalizeWinSection`, so an unknown section is another silent no-op.
    const unresolvable = mainUiOpenTargets()
      .map((t) => resolveExtensionUiOpen(t, false))
      .filter((r) => r.kind === 'os-section')
      .map((r) => (r as { kind: 'os-section'; section: string }).section)
      .filter((section) => normalizeWinSection(section) === null);
    expect(unresolvable).toEqual([]);
  });

  it('the Notebook target an installed extension still sends reaches the Files app', () => {
    // Gate 8's casualty, asserted by name. Deleting this mapping would leave every
    // already-installed extension's "open Notebook" button doing nothing at all.
    expect(mainUiOpenTargets()).toContain('notebook');
    expect(resolveExtensionUiOpen('notebook', false)).toEqual({
      kind: 'os-section',
      section: 'files',
    });
    expect(DESKTOP_WIN_SECTIONS).toContain('files');
    expect(DESKTOP_WIN_SECTIONS).not.toContain('notebook');
  });
});
