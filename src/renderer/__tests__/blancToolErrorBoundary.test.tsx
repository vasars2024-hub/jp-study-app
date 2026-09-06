// @vitest-environment jsdom
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlancToolErrorBoundary } from '../components/blanc/BlancToolErrorBoundary';

/**
 * The per-tool crash guard.
 *
 * The behaviour under test is a BLAST RADIUS, so every case here mounts a
 * sibling alongside the throwing tool and asserts the sibling is still on
 * screen. Asserting only that the failure message appears would pass just as
 * well with no boundary at all — the whole point is what SURVIVES.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;
/**
 * Flipped by a test so the same component can fail and then recover.
 *
 * A counter ("throw the first N renders") does NOT work here: React re-renders
 * a subtree once more after an error boundary catches, so a `times={1}` Boom
 * has already spent its throw before the retry is ever clicked and the crash
 * screen is never seen. An externally controlled flag makes the recovery
 * deterministic and, more honestly, models what actually recovers a transient
 * fault — the world changing, not the component counting.
 */
let shouldThrow = true;

function Boom(): ReactNode {
  if (shouldThrow) throw new Error('tool exploded');
  return <p>tool recovered</p>;
}

function Rail(): ReactNode {
  return <nav data-testid="rail">the rest of Blanc</nav>;
}

async function mount(node: ReactNode): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
}

async function click(el: Element | null | undefined): Promise<void> {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
}

beforeEach(() => {
  shouldThrow = true;
  // React logs a caught render error; silencing it keeps the reporter readable
  // without hiding whether the boundary actually caught anything, which every
  // assertion below measures from the DOM instead.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  (window as unknown as { api: unknown }).api = { logRendererError: vi.fn(() => Promise.resolve()) };
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = null;
  root = null;
  delete (window as unknown as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('a tool that throws loses only itself', () => {
  it('keeps its siblings mounted and names the tool that failed', async () => {
    await mount(
      <div>
        <Rail />
        <BlancToolErrorBoundary toolId="agent" label="Agent">
          <Boom />
        </BlancToolErrorBoundary>
      </div>,
    );
    // The measurement that matters: before this boundary existed, a throw here
    // replaced the WHOLE Blanc window, rail included.
    expect(host?.querySelector('[data-testid="rail"]')).toBeTruthy();
    expect(host?.textContent).toContain('Agent could not be displayed.');
    expect(host?.textContent).toContain('The rest of Blanc is unaffected');
    // And it says so where assistive tech will hear it, not only visually.
    expect(host?.querySelector('.blanc-tool-crash')?.getAttribute('role')).toBe('alert');
  });

  it('reports the failure to the diagnostic log, with the tool in the payload', async () => {
    await mount(
      <BlancToolErrorBoundary toolId="music" label="Music">
        <Boom />
      </BlancToolErrorBoundary>,
    );
    const log = (window as unknown as {
      api: { logRendererError: ReturnType<typeof vi.fn> };
    }).api.logRendererError;
    expect(log).toHaveBeenCalledTimes(1);
    const payload = log.mock.calls[0][0] as { operation: string; detail: string };
    expect(payload.operation).toBe('blancToolErrorBoundary');
    // A bounded crash that cannot be attributed to a tool in the log is a crash
    // nobody can fix.
    expect(payload.detail).toContain('tool=music');
    expect(payload.detail).toContain('tool exploded');
  });
});

describe('recovery is offered and is real', () => {
  it('Try again re-mounts the tool, and a transient failure clears', async () => {
    await mount(
      <BlancToolErrorBoundary toolId="agent" label="Agent">
        <Boom />
      </BlancToolErrorBoundary>,
    );
    expect(host?.textContent).toContain('could not be displayed');
    shouldThrow = false;
    await click(host?.querySelector('.blanc-tool-crash-retry'));
    expect(host?.textContent).toContain('tool recovered');
    expect(host?.querySelector('.blanc-tool-crash')).toBeNull();
  });

  it('a tool that still throws lands back on the failure instead of pretending', async () => {
    await mount(
      <BlancToolErrorBoundary toolId="agent" label="Agent">
        <Boom />
      </BlancToolErrorBoundary>,
    );
    await click(host?.querySelector('.blanc-tool-crash-retry'));
    // "Try again" is a retry, not a claim that the fault is fixed.
    expect(host?.textContent).toContain('Agent could not be displayed.');
  });
});

describe('the boundary is keyed on the tool, so a crash does not follow you', () => {
  it('picking another tool after a crash shows that tool, not the old failure', async () => {
    function Switcher(): ReactNode {
      const [tool, setTool] = useState('agent');
      return (
        <div>
          <button type="button" onClick={() => setTool('music')}>switch</button>
          <BlancToolErrorBoundary key={tool} toolId={tool} label={tool}>
            {tool === 'agent' ? <Boom /> : <p>music is fine</p>}
          </BlancToolErrorBoundary>
        </div>
      );
    }
    await mount(<Switcher />);
    expect(host?.textContent).toContain('agent could not be displayed.');
    await click(Array.from(host?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent === 'switch',
    ));
    // Without the `key`, the boundary keeps its error state and every tool
    // picked after the first crash reads as broken.
    expect(host?.textContent).toContain('music is fine');
    expect(host?.textContent).not.toContain('could not be displayed');
  });

  it('the shell actually passes that key, and mounts the boundary inside the tool detail', () => {
    // The guard is worthless unwired, and neither the key nor the placement is
    // observable from the component alone.
    const shell = readFileSync(
      resolve(process.cwd(), 'src/renderer/components/blanc/BlancShell.tsx'),
      'utf8',
    );
    expect(shell).toMatch(/<BlancToolErrorBoundary\s+key=\{tool\}\s+toolId=\{tool\}/);
    // Outside Suspense: a lazy chunk that fails to load throws while the
    // boundary's child renders, and a boundary nested under the fallback would
    // never see it. This pins the order, not the adjacency.
    const boundaryAt = shell.indexOf('<BlancToolErrorBoundary');
    const suspenseAt = shell.indexOf('<Suspense', boundaryAt);
    const renderAt = shell.indexOf('renderBlancTool(tool', boundaryAt);
    expect(boundaryAt).toBeGreaterThan(-1);
    expect(suspenseAt).toBeGreaterThan(boundaryAt);
    expect(renderAt).toBeGreaterThan(suspenseAt);
  });
});
