// @vitest-environment jsdom
/**
 * Audit A9: the Agent's theme tools must change the theme the window actually
 * uses — Study OS, Aero or Wired — or refuse in words. They used to style Blanc
 * from every window and report `applied: true`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  t: (key: string): string => key,
}));
import { applyTheme, loadThemeId, registerTheme } from '../theme/engine';
import {
  agentSelectableThemeIds,
  agentThemeTargetsBlanc,
  applyAppTheme,
  previewAppTheme,
  refuseAppCustomCss,
  resetAgentAppThemeHistoryForTests,
  resetAppTheme,
  undoAppTheme,
} from '../agentAppThemeTools';
import { createCentralAgentToolRegistry } from '../agentToolRegistry';

const t = (key: string, vars?: Record<string, string | number>) => (vars ? `${key} ${JSON.stringify(vars)}` : key);

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
  resetAgentAppThemeHistoryForTests();
  registerTheme({
    id: 'test-wired', label: 'Wired', kind: 'custom', hidden: true, light: false, version: 1, materialSet: 'wired',
    swatch: { bg: '#000', text: '#fff', border: '#888' },
  });
  applyTheme('study-os');
});

afterEach(() => {
  document.documentElement.className = '';
});

describe('agent theme tools outside Blanc', () => {
  it('applies a real app theme by id or by name, persists it, and can undo', () => {
    expect(agentThemeTargetsBlanc()).toBe(false);
    const applied = applyAppTheme({ theme: 'dark-nebula' }, t);
    expect(applied).toMatchObject({ applied: true, scope: 'app', theme: 'dark-nebula', previous: 'study-os' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark-nebula');
    expect(loadThemeId()).toBe('dark-nebula');

    applyAppTheme({ preset: 'Classic Light' }, t);
    expect(loadThemeId()).toBe('classic-light');

    expect(undoAppTheme(t)).toMatchObject({ restored: true, theme: 'dark-nebula' });
    expect(undoAppTheme(t)).toMatchObject({ restored: true, theme: 'study-os' });
    expect(() => undoAppTheme(t)).toThrow('blanc.agent.error.noThemeHistory');
  });

  it('works from Wired: reset leaves it, undo returns to it', () => {
    applyTheme('test-wired');
    expect(document.documentElement.getAttribute('data-materials')).toBe('wired');
    // The active hidden theme is offered; other hidden themes are not.
    expect(agentSelectableThemeIds()).toContain('test-wired');
    resetAppTheme();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.documentElement.hasAttribute('data-materials')).toBe(false);
    undoAppTheme(t);
    expect(loadThemeId()).toBe('test-wired');
  });

  it('will not switch to a hidden theme the user has not unlocked, and names the choices', () => {
    expect(() => applyAppTheme({ theme: 'test-wired' }, t)).toThrow(/aiAgent\.theme\.unknown/);
    expect(() => applyAppTheme({ theme: 'no-such-theme' }, t)).toThrow(/dark-nebula/);
    expect(loadThemeId()).toBe('study-os');
  });

  it('previews without persisting and flags Blanc-only overrides', () => {
    const preview = previewAppTheme({ theme: 'paper', overrides: { accent: '#f00' } }, t);
    expect(preview).toMatchObject({ preview: true, theme: 'paper', overridesIgnored: true });
    expect(document.documentElement.getAttribute('data-theme')).toBe('paper');
    expect(loadThemeId()).toBe('study-os');
  });

  it('refuses custom CSS in words instead of reporting success', () => {
    expect(() => refuseAppCustomCss(t)).toThrow('aiAgent.theme.cssBlancOnly');
  });

  it('the registry routes each theme operation by shell', async () => {
    const handlers = createCentralAgentToolRegistry(t);
    await expect(Promise.resolve(handlers['settings.apply-theme']!({ theme: 'ocean-blue' })))
      .resolves.toMatchObject({ applied: true, scope: 'app', theme: 'ocean-blue' });
    expect(loadThemeId()).toBe('ocean-blue');
    expect(() => handlers['settings.apply-css']!({ css: '.x{}' })).toThrow('aiAgent.theme.cssBlancOnly');

    // Inside Blanc the same operation styles Blanc and leaves the app theme alone.
    document.documentElement.classList.add('blanc-shell');
    expect(agentThemeTargetsBlanc()).toBe(true);
    const blanc = await Promise.resolve(handlers['settings.apply-theme']!({ preset: 'default' }));
    expect(blanc).toMatchObject({ applied: true });
    expect(blanc).not.toHaveProperty('scope');
    expect(loadThemeId()).toBe('ocean-blue');
  });
});
