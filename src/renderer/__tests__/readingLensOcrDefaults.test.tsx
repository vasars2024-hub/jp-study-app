// @vitest-environment jsdom
/**
 * The recognition block in Settings → Study → Reading Lens.
 *
 * This block makes two claims a user acts on, so both are asserted against what
 * main actually returned rather than against what the component chose to show:
 *
 * 1. **The default engine is stored in main**, not in the renderer. The lens is
 *    a separate window created and scanning inside the same tick as the hotkey,
 *    so a default the settings page kept to itself would never reach a capture.
 *    The select must settle on main's *reply*, which is how a value that did not
 *    survive normalization becomes visible instead of silently accepted.
 * 2. **The availability warning is about the selected engine only.** `auto` runs
 *    whenever either recognizer is installed, so warning on `auto` with manga
 *    missing would nag a user whose lens works — and staying silent when a
 *    *forced* engine is missing would let every future scan refuse with no
 *    explanation on the page that offered the choice.
 *
 * The i18n assertion is not decoration; `settings.lens.ocr.*` keys absent from
 * every catalog are invisible to `tools/i18n-check.cjs`, which is keyed on the
 * English catalog. Comparing against the raw key string is what catches it.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ReadingLensEngineStatus } from '../../shared/readingLensEngine';

let engineStatus: ReadingLensEngineStatus = { manga: true, web: true, webLangs: ['ja'], none: false };
let storedEngine = 'auto';
const setCalls: unknown[] = [];

const lensStatus = () => ({
  enabled: true,
  hotkey: 'Ctrl+Shift+Space',
  lastRegion: null,
  supported: true,
  registered: true,
  open: false,
  canRepeatRegion: false,
  defaultEngine: storedEngine,
});

function installApiStub(): void {
  const api: Record<string, unknown> = {
    lensGetSettings: async () => lensStatus(),
    lensOcrEngineStatus: async () => engineStatus,
    // Stands in for main's normalizer: an unknown value is stored as the
    // default, and the *stored* value is what comes back.
    lensSetDefaultEngine: async (engine: unknown) => {
      setCalls.push(engine);
      storedEngine = engine === 'manga' || engine === 'web' || engine === 'auto'
        ? (engine as string)
        : 'auto';
      return lensStatus();
    },
    lensHistoryList: async () => [],
    lensHistoryGetRetention: async () => 0,
  };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('on')) return () => (): void => undefined;
      return async (): Promise<unknown> => null;
    },
  });
}

let Section: typeof import('../components/settings/pages/ReadingLensSection').default;
let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installApiStub();
  Section = (await import('../components/settings/pages/ReadingLensSection')).default;
});

beforeEach(() => {
  engineStatus = { manga: true, web: true, webLangs: ['ja'], none: false };
  storedEngine = 'auto';
  setCalls.length = 0;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

async function render(): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  const mounted = createRoot(host);
  root = mounted;
  await act(async () => {
    mounted.render(<Section />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

const engineSelect = (): HTMLSelectElement => {
  const found = [...host.querySelectorAll('select')].find(
    (s) => s.getAttribute('aria-label') === 'Default engine',
  );
  if (!found) throw new Error('no engine select rendered');
  return found as HTMLSelectElement;
};

async function choose(value: string): Promise<void> {
  const select = engineSelect();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe('Reading Lens recognition settings', () => {
  it('offers all three engines and starts on what main stored', async () => {
    storedEngine = 'manga';
    await render();
    expect([...engineSelect().options].map((o) => o.value)).toEqual(['auto', 'manga', 'web']);
    expect(engineSelect().value).toBe('manga');
  });

  it('writes the choice to main and settles on main’s reply', async () => {
    await render();
    await choose('web');
    expect(setCalls).toEqual(['web']);
    expect(storedEngine).toBe('web');
    expect(engineSelect().value).toBe('web');
  });

  it('says recognition runs on this device, and scopes the claim to recognition', async () => {
    await render();
    const text = host.textContent ?? '';
    expect(text).toContain('Recognition runs on this device');
    // The scoping half. Without it the block reads as a blanket promise that
    // nothing the lens touches leaves the machine, which "Ask the Agent" breaks.
    expect(text).toContain('separate action');
  });

  it('warns about a forced engine whose models are missing', async () => {
    storedEngine = 'manga';
    engineStatus = { manga: false, web: true, webLangs: ['ja'], none: false };
    await render();
    expect(host.textContent).toContain('models are not installed');
  });

  it('NEGATIVE CONTROL: the same missing models produce no warning under auto', async () => {
    // `auto` falls through to whichever recognizer is installed, so this is a
    // working configuration. A warning here would be a false alarm, and its
    // absence is what proves the warning above is about the *selected* engine
    // rather than about any engine being missing.
    storedEngine = 'auto';
    engineStatus = { manga: false, web: true, webLangs: ['ja'], none: false };
    await render();
    expect(host.textContent).not.toContain('models are not installed');
  });

  it('says so plainly when nothing at all is installed', async () => {
    engineStatus = { manga: false, web: false, webLangs: [], none: true };
    await render();
    expect(host.textContent).toContain('No recognition models are installed');
  });

  it('renders translated strings, not raw keys', async () => {
    await render();
    expect(host.textContent).not.toContain('settings.lens.ocr.');
  });
});

describe('the block names itself', () => {
  it('renders the recognition heading, so the key is not a dead catalog entry', async () => {
    // `settings.lens.ocr.title` shipped in all four catalogs before anything
    // rendered it. `tools/i18n-check.cjs` compares catalogs against each other
    // and cannot see an unused key at all.
    await render();
    expect(host.textContent).toContain('Text recognition');
  });
});
