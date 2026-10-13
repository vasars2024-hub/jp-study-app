import { describe, expect, it } from 'vitest';
import { isKeyHelpPress, studyKeyHelpRows } from '../studyKeyHelp';

describe('studyKeyHelpRows', () => {
  it('lists the player study commands, bound ones first, catalog order kept', () => {
    const rows = studyKeyHelpRows([
      { id: 'nav.open.video', label: 'Open', keys: 'Ctrl+V' },
      { id: 'video.subEarlierLarge', label: 'Earlier 500', keys: '' },
      { id: 'video.replayLine', label: 'Replay', keys: 'R' },
      { id: 'workspace.customize', label: 'Customize', keys: '' },
      { id: 'video.resumeLast', label: 'Resume', keys: '' },
      { id: 'video.mineCurrentLine', label: 'Mine', keys: 'C' },
      { id: 'video.custom', label: 'Mine', keys: 'Q', custom: true },
    ]);
    expect(rows.map((row) => row.id)).toEqual([
      'video.replayLine',
      'video.mineCurrentLine',
      'video.subEarlierLarge',
      'workspace.customize',
    ]);
  });
});

describe('isKeyHelpPress', () => {
  const press = (over: Partial<KeyboardEvent> = {}) => ({
    key: '?',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    ...over,
  });

  it('is "?" alone (Shift is how it is typed)', () => {
    expect(isKeyHelpPress(press())).toBe(true);
    expect(isKeyHelpPress(press({ key: '/' }))).toBe(false);
    expect(isKeyHelpPress(press({ ctrlKey: true }))).toBe(false);
    expect(isKeyHelpPress(press({ altKey: true }))).toBe(false);
    expect(isKeyHelpPress(press({ repeat: true }))).toBe(false);
  });
});
