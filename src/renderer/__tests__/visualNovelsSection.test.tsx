// @vitest-environment jsdom
/**
 * Visual Novels as a first-class app.
 *
 * It was reachable only as Immersion > More > "Visual novel library", with the
 * open state held in a `useState(false)` inside ImmersionView that reset on
 * every close, and nowhere in Start, the desktop icons or the command palette.
 * Every registration point a section needs is asserted by what it resolves to,
 * plus the one behaviour that matters from Immersion: its entry now opens the app.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DESKTOP_WIN_SECTIONS, normalizeWinSection } from '../../shared/desktop';
import { AGENT_NAVIGATION_SECTION_LABEL_KEYS, isAgentNavigableSection } from '../../shared/agentNavigation';
import { POPOUT_LABEL_KEYS, popoutLabel } from '../popoutLabels';
import { BASE_PATHS } from '../components/Icons';
import { en } from '../../shared/i18n/catalogs/en';
import {
  createReadingSurfaceHarness,
  installReadingSurfaceApi,
  installResizeObserver,
  type ReadingSurfaceHarness,
} from './helpers/readingCanvasSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SRC = resolve(__dirname, '..', '..');
const t = (key: string): string => (en as Record<string, string>)[key] ?? key;

describe('the Visual Novels section is registered everywhere a section lives', () => {
  it('is a real desktop section with a translated name and its own icon', () => {
    expect(DESKTOP_WIN_SECTIONS).toContain('visualnovels');
    expect(normalizeWinSection('visualnovels')).toBe('visualnovels');
    expect(popoutLabel(t, 'visualnovels')).toBe('Visual Novels');
    expect(POPOUT_LABEL_KEYS.visualnovels).toBe('palette.section.visualnovels');
    expect(AGENT_NAVIGATION_SECTION_LABEL_KEYS.visualnovels).toBe('palette.section.visualnovels');
    expect(isAgentNavigableSection('visualnovels')).toBe(true);
    expect(BASE_PATHS['visual-novel']).toMatch(/^M/);
  });

  it('appears in Start, the command palette and the section switch', () => {
    const shell = readFileSync(resolve(SRC, 'renderer/components/DesktopShell.tsx'), 'utf8');
    expect(shell).toContain("{ id: 'visualnovels', labelKey: 'palette.section.visualnovels', glyph: 'visual-novel' }");
    expect(shell).toMatch(/sections: \[[^\]]*'visualnovels'[^\]]*\]/);
    const palette = readFileSync(resolve(SRC, 'renderer/components/CommandPalette.tsx'), 'utf8');
    expect(palette).toContain("id: 'visualnovels'");
    const section = readFileSync(resolve(SRC, 'renderer/components/AppSection.tsx'), 'utf8');
    expect(section).toMatch(/case 'visualnovels':\s*view = <VisualNovelsView \/>/);
  });
});

describe('Immersion hands off to the app instead of hiding the panel in local state', () => {
  let harness: ReadingSurfaceHarness | null = null;
  const opened: string[] = [];
  const onOpen = (event: Event): void => {
    opened.push(String((event as CustomEvent).detail));
    event.preventDefault();
  };

  beforeEach(() => {
    installResizeObserver();
    installReadingSurfaceApi({
      immersionListSites: async () => ({ sites: [] }),
      onImmersionSitesChanged: () => () => undefined,
    });
    window.addEventListener('os:open', onOpen);
  });

  afterEach(() => {
    window.removeEventListener('os:open', onOpen);
    harness?.teardown();
    harness = null;
    document.body.replaceChildren();
  });

  it('opens the Visual Novels section from the toolbar entry', async () => {
    const { default: ImmersionView } = await import('../views/ImmersionView');
    harness = createReadingSurfaceHarness({
      render: () => createElement(ImmersionView),
      ready: (container) => container.querySelector('.lq-reading.immersion-body') !== null,
    });
    await harness.mount(1200);
    const button = harness.container.querySelector<HTMLButtonElement>('.visual-novel-open');
    expect(button).not.toBeNull();
    await act(async () => { button!.click(); });
    expect(opened).toEqual(['visualnovels']);
    // The Immersion view stays where it was; nothing swapped it for the panel.
    expect(harness.container.querySelector('.visual-novel-panel')).toBeNull();
  });
});
