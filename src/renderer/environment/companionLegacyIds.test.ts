// @vitest-environment jsdom
/**
 * The Aero companion's type and routine ids were renamed. A profile saved
 * before that must keep its Aero companion, its routine bindings and Mini's
 * pinned routines, instead of the loaders silently dropping the unknown ids.
 * (Old ids are base64 here for the same reason as in companionLegacyIds.ts.)
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  currentCompanionId,
  migrateLegacyCompanionIds,
  resetLegacyCompanionMigrationForTests,
} from './companionLegacyIds';
import { loadEnvironment } from './environmentStore';
import { loadMiniMode } from '../miniMode';

const OLD_TYPE = atob('bWlrby1zaGltZWpp');
const OLD_CLIMB = atob('YnItbWlrby1jbGltYg==');
const OLD_CHEER = atob('YnItbWlrby1jaGVlcg==');

beforeEach(() => {
  localStorage.clear();
  resetLegacyCompanionMigrationForTests();
});

describe('renamed companion ids', () => {
  it('maps each old id and leaves everything else alone', () => {
    expect(currentCompanionId(OLD_TYPE)).toBe('aero-assistant');
    expect(currentCompanionId(OLD_CLIMB)).toBe('br-aero-climb');
    expect(currentCompanionId(OLD_CHEER)).toBe('br-aero-cheer');
    expect(currentCompanionId('study-buddy')).toBe('study-buddy');
    expect(migrateLegacyCompanionIds({ [OLD_TYPE]: 'orbi', list: [OLD_TYPE, 'x'], n: 3 })).toEqual({
      'aero-assistant': 'orbi',
      list: ['aero-assistant', 'x'],
      n: 3,
    });
  });

  it('an old profile keeps its Aero companion, its bindings and its pinned routines', () => {
    localStorage.setItem(
      'jp-os-environment-v1',
      JSON.stringify({
        companionTypes: ['study-buddy', OLD_TYPE],
        companions: [
          { id: 'c-a', typeId: OLD_TYPE, x: 1, y: 2, facing: 1, mood: 'calm', primaryRoutineId: OLD_CHEER },
          { id: 'c-b', typeId: 'critter', x: 1, y: 2, facing: 1, mood: 'calm' },
        ],
      }),
    );
    localStorage.setItem('jp-study-mini-mode-v1', JSON.stringify({ enabled: false, routines: [OLD_CLIMB] }));

    const env = loadEnvironment();
    expect(env.companionTypes).toEqual(['study-buddy', 'aero-assistant']);
    expect(env.companions.map((c) => c.typeId)).toEqual(['aero-assistant', 'critter']);
    expect(env.companions[0].primaryRoutineId).toBe('br-aero-cheer');
    expect(env.buddyRoutines.filter((r) => r.forType === 'aero-assistant').map((r) => r.id)).toEqual([
      'br-aero-climb',
      'br-aero-cheer',
    ]);
    expect(loadMiniMode().routines).toEqual(['br-aero-climb']);
    // Rewritten on disk, so no old id survives anywhere.
    expect(localStorage.getItem('jp-os-environment-v1')).not.toContain(OLD_TYPE);
    expect(localStorage.getItem('jp-study-mini-mode-v1')).not.toContain(OLD_CLIMB);
  });
});
