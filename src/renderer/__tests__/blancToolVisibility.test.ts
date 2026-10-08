import { describe, expect, it } from 'vitest';
import {
  isRegistryGovernedTool,
  isToolLaunchable,
  mergeFavoriteTools,
} from '../components/blanc/blancToolVisibility';
import { DEFAULT_TOOLBOX_SETTINGS } from '../../shared/toolboxSettings';

/**
 * Blanc's launcher listed 32 of its 42 tools.
 *
 * Measured on `/blanc-harness.html`, 2026-09-06: the nine Pillar 2 ports —
 * Notebook, Translate, Music, Novels, Discover, Games, Immersion, Visualizer,
 * Local AI Agent — had no button in the rail. They are Blanc-only ids, so they
 * cannot be members of `enabledTools`, which is a `ToolboxModuleId[]` and is
 * re-sanitised against `TOOLBOX_MODULES` on every load; the rail gated on
 * exactly that list.
 *
 * These tests run the real predicate against the real default settings and the
 * real registry. Nothing here is a source scan.
 */

/** The Blanc-only ids, i.e. the ones with no `TOOLBOX_MODULES` entry. */
const BLANC_ONLY = [
  'coverage',
  'notebook',
  'translate',
  'music',
  'novels',
  'discover',
  'games',
  'immersion',
  'visualizer',
  'local-agent',
] as const;

const defaults = DEFAULT_TOOLBOX_SETTINGS;

describe('a Blanc-only tool is not governed by the module lists', () => {
  it.each(BLANC_ONLY)('%s has no TOOLBOX_MODULES entry', (id) => {
    expect(isRegistryGovernedTool(id)).toBe(false);
  });

  it.each(BLANC_ONLY)('%s is absent from the default enabledTools', (id) => {
    // This is the fact that made the rail gate unsatisfiable, stated directly:
    // the settings schema has no way to say "yes" about these ids.
    expect(defaults.enabledTools as readonly string[]).not.toContain(id);
  });

  it.each(BLANC_ONLY.filter((id) => id !== 'coverage'))('%s is still launchable', (id) => {
    expect(isToolLaunchable(id, defaults, false)).toBe(true);
  });

  it('coverage, a developer tool, is launchable only with Developer tools on (round-2 Blanc)', () => {
    // An implementation map of which features are real read as "this app is unfinished" to a
    // learner; it is listed only behind Blanc's developer flag, off by default.
    expect(isToolLaunchable('coverage', defaults, false)).toBe(false);
    expect(isToolLaunchable('coverage', { ...defaults, developerTools: true }, false)).toBe(true);
  });
});

describe('a registry-governed tool still obeys the user settings', () => {
  it('lists a ready module that is enabled by default', () => {
    expect(isRegistryGovernedTool('calculator')).toBe(true);
    expect(isToolLaunchable('calculator', defaults, false)).toBe(true);
  });

  it('does NOT list an experimental module the defaults leave out', () => {
    // The negative control for the whole change. `automation-builder` is
    // `status: 'experimental'`, so it is not in READY_MODULE_IDS and must stay
    // out of the rail. If the Blanc-only exemption were written as "anything
    // not in enabledTools is exempt", this assertion is what would catch it.
    expect(isRegistryGovernedTool('automation-builder')).toBe(true);
    expect(defaults.enabledTools as readonly string[]).not.toContain('automation-builder');
    expect(isToolLaunchable('automation-builder', defaults, false)).toBe(false);
  });

  it('hides a hidden module while browsing', () => {
    const settings = { ...defaults, hiddenTools: ['calculator'] };
    expect(isToolLaunchable('calculator', settings, false)).toBe(false);
  });

  it('brings a hidden module back in search only when the user asked for that', () => {
    const shown = { ...defaults, hiddenTools: ['calculator'], showHiddenToolsInSearch: true };
    const notShown = { ...defaults, hiddenTools: ['calculator'], showHiddenToolsInSearch: false };
    expect(isToolLaunchable('calculator', shown, true)).toBe(true);
    expect(isToolLaunchable('calculator', notShown, true)).toBe(false);
  });

  it('hides a Blanc-only tool the user hid, like any other tool', () => {
    // Reversed deliberately (2026-10 refinement pass). `hiddenTools` used to be
    // registry-only, so a Blanc-only id in it "could not mean anything" and was
    // ignored — which left 13 tools impossible to hide. The settings schema now
    // stores Blanc-only ids for hide/order/default (shared/blancTools.ts), so
    // the user's choice must act.
    const settings = { ...defaults, hiddenTools: ['discover'] };
    expect(isToolLaunchable('discover', settings, false)).toBe(false);
    expect(isToolLaunchable('discover', { ...settings, showHiddenToolsInSearch: true }, true)).toBe(true);
  });

  it('still lists a Blanc-only tool that is not in enabledTools', () => {
    // The original defect stays fixed: enable/disable is registry-only.
    expect(isToolLaunchable('discover', { ...defaults, enabledTools: [] }, false)).toBe(true);
  });
});

describe('pinning a Blanc-only tool survives the settings round trip', () => {
  it('keeps a Blanc-only pin that settings cannot represent', () => {
    // The observable defect: `saveToolboxSettings` sanitises `discover` away,
    // the change event fires, and re-reading settings alone dropped the pin.
    expect(mergeFavoriteTools([], ['discover', 'calculator'])).toEqual(['discover']);
    expect(mergeFavoriteTools(['calculator'], ['discover', 'calculator'])).toEqual([
      'discover',
      'calculator',
    ]);
  });

  it('lets settings unpin a tool it CAN represent', () => {
    // The other half: Blanc's local list still names `calculator`, but
    // settings is authoritative for governed ids, so removing it there wins.
    expect(mergeFavoriteTools([], ['calculator'])).toEqual([]);
  });

  it('appends a governed pin made elsewhere that Blanc has not seen', () => {
    expect(mergeFavoriteTools(['calculator'], ['discover'])).toEqual(['discover', 'calculator']);
  });

  it('follows the local order, which is the most-recent-first arrangement', () => {
    expect(mergeFavoriteTools(['calculator', 'focus-timer'], ['focus-timer', 'calculator'])).toEqual(
      ['focus-timer', 'calculator'],
    );
  });

  it('drops duplicates and honours the cap', () => {
    expect(mergeFavoriteTools([], ['discover', 'discover', 'music'])).toEqual(['discover', 'music']);
    expect(mergeFavoriteTools([], ['discover', 'music', 'games'], 2)).toEqual(['discover', 'music']);
  });
});
