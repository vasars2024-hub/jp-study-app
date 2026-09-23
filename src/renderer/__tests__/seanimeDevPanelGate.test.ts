// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SeanimeStatus, SeanimeStatusKind } from '../../shared/seanime';
import {
  DEV_PANEL_ATTR,
  devPanelIsVisible,
  isDevServerRuntime,
} from '../components/SeanimeDevPanel';

/** A full `SeanimeStatus` — the gate reads `kind`, but the type is not `{kind}` alone. */
function statusOf(kind: SeanimeStatusKind): SeanimeStatus {
  return {
    kind,
    port: 0,
    pid: null,
    dataDir: null,
    version: null,
    simulatedUser: null,
    error: null,
    logTail: [],
  };
}

/**
 * `SeanimeDevPanel` is a development tool — a 460px monospace console with
 * Start / Stop / Probe buttons, fixed at the bottom-right of the desktop at
 * z-index 99,999.
 *
 * Its gate used to be `status.kind !== 'disabled'`, and its header said that meant
 * "a normal build never shows it". That was true only while `SEANIME_SIDECAR` was
 * off by default. The 2026-07-31 flip changed the initial status from `disabled` to
 * `stopped` — precisely and only what that flip's own note says it does — and the
 * panel started rendering for every user. Nothing failed. Two correct-looking
 * decisions in different files simply added up to shipping a debug console.
 *
 * So the rule is a function now, not a sentence in a comment, and these tests are
 * the thing the comment could not be: checkable.
 */
describe('the dev panel is dev-only', () => {
  const STATUSES: SeanimeStatusKind[] = ['stopped', 'starting', 'ready', 'offline', 'failed'];

  it('never renders outside development, whatever the sidecar reports', () => {
    // The regression, stated directly. Every one of these was `disabled` before the
    // flag flip and is reachable in a normal run after it.
    for (const kind of STATUSES) {
      expect(
        devPanelIsVisible(statusOf(kind), false),
        `${kind} must not show the panel in production`,
      ).toBe(false);
    }
    expect(devPanelIsVisible(statusOf('disabled'), false)).toBe(false);
    expect(devPanelIsVisible(null, false)).toBe(false);
  });

  it('renders in development once a live sidecar status arrives', () => {
    for (const kind of STATUSES) {
      expect(devPanelIsVisible(statusOf(kind), true), `${kind} should show the panel in dev`)
        .toBe(true);
    }
  });

  it('stays hidden in development with no status or a disabled sidecar', () => {
    // Nothing to report, so nothing to show — the original half of the gate, kept.
    expect(devPanelIsVisible(null, true)).toBe(false);
    expect(devPanelIsVisible(statusOf('disabled'), true)).toBe(false);
  });

  it('gates the rendered component on the runtime, not only on status', () => {
    // devPanelIsVisible could be correct and unused. Read the call site.
    const source = readFileSync(
      resolve(__dirname, '..', 'components', 'SeanimeDevPanel.tsx'),
      'utf8',
    );
    expect(source).toContain('devPanelIsVisible(status, isDevServerRuntime())');
    expect(source).toContain('if (!visible) return null;');
  });
});

describe('what counts as a development runtime', () => {
  it('accepts the dev server', () => {
    expect(isDevServerRuntime({ protocol: 'http:', hostname: 'localhost' })).toBe(true);
    expect(isDevServerRuntime({ protocol: 'http:', hostname: '127.0.0.1' })).toBe(true);
  });

  it('rejects a packaged build', () => {
    // A packaged build here serves app://bundle/index.html from a registered custom
    // protocol — measured against the real package, not assumed. It is NOT file://,
    // which is what an earlier harness in this track filtered on and matched nothing.
    expect(isDevServerRuntime({ protocol: 'app:', hostname: 'bundle' })).toBe(false);
    expect(isDevServerRuntime({ protocol: 'file:', hostname: '' })).toBe(false);
  });

  it('rejects a remote origin served over http', () => {
    // Fails closed. A dev tool that fails open is the thing this slice is fixing.
    expect(isDevServerRuntime({ protocol: 'https:', hostname: 'example.test' })).toBe(false);
    expect(isDevServerRuntime({ protocol: 'http:', hostname: '10.0.0.5' })).toBe(false);
  });
});

describe('the removed corner launcher leaves no offset behind', () => {
  const CSS = readFileSync(resolve(__dirname, '..', 'styles.css'), 'utf8');

  it('has no launcher rule to step over the dev panel', () => {
    // The media workspace's corner pill was removed (2026-09-23); its dev-panel offset went
    // with it, and nothing else may be left positioned for it.
    expect(DEV_PANEL_ATTR).toBe('data-seanime-dev-panel');
    expect(CSS).not.toContain('.seanime-host-launcher');
  });
});
