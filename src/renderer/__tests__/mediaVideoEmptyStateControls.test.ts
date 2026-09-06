import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en, ja, ru, zh } from '../../shared/i18n/catalogs/all';

const VIEW = readFileSync(resolve(__dirname, '..', 'views', 'MediaCenterView.tsx'), 'utf8');

/**
 * Pre-sweep D85 — the Video pane's empty state must name controls that are on screen
 * WHILE it is on screen.
 *
 * With nothing loaded the inspector read "Choose a file from your library or use Open
 * video." and no control on the surface was called Open video. Measured live 2026-09-06
 * (pid 14128 window 2): the window text matched /Open video/ while a walk of all 29 named
 * buttons found none by that name.
 *
 * The two are mutually exclusive *by construction*, which is why it could never be right:
 * the Open video button renders only `{state.src && ...}`, and `inspectorEmpty` renders
 * only when `current` is falsy. `MediaCenterView.tsx`'s own comment records that Open video
 * was deliberately removed from the empty stage in favour of Select a video / Browse
 * folder — the string was simply not updated with it.
 *
 * So the guard is the mutual exclusion, asserted in both directions, plus the four
 * catalogs actually naming the surviving controls in their own language.
 */
const CATALOGS = { en, ja, zh, ru } as const;

/** The two controls the empty stage really offers, and the one it must not name. */
const OFFERED = ['mediaCenter.video.selectFile', 'mediaCenter.video.browseFolder'] as const;
const ABSENT = 'mediaCenter.action.openVideo';

describe('the Video empty state names controls that exist beside it', () => {
  it('keeps Open video conditional on a loaded source, which is when the empty text is gone', () => {
    // If either guard is ever dropped the two can coexist and this test stops meaning
    // anything, so both are pinned rather than assumed.
    expect(VIEW).toContain("{state.src && (");
    expect(VIEW).toMatch(/\{current \? \([\s\S]*?<p className="mc-muted">\{t\('mediaCenter\.video\.inspectorEmpty'\)\}<\/p>/);
  });

  it('names Select a video and Browse folder, in every language', () => {
    for (const [lang, catalog] of Object.entries(CATALOGS)) {
      const text = catalog['mediaCenter.video.inspectorEmpty'];
      expect(text, `${lang} has the key`).toBeTruthy();
      for (const key of OFFERED) {
        const label = catalog[key];
        expect(label, `${lang}:${key} has a label`).toBeTruthy();
        expect(text, `${lang} empty state names ${label}`).toContain(label);
      }
    }
  });

  it('does not name Open video, in every language', () => {
    for (const [lang, catalog] of Object.entries(CATALOGS)) {
      // Not a substring ban on the words themselves — ja's "ビデオを選択" and the old
      // "ビデオを開いて" share characters — but the button's own label must not appear.
      expect(
        catalog['mediaCenter.video.inspectorEmpty'],
        `${lang} must not send the user to a control that is not rendered`,
      ).not.toContain(catalog[ABSENT]);
    }
  });

  it('control: the pre-fix English string fails all three checks', () => {
    // Non-vacuity. Without this, a catalog that lost the key entirely could pass.
    const stale = 'Choose a file from your library or use Open video. The source file stays in place.';
    expect(stale).toContain(en[ABSENT]);
    expect(stale).not.toContain(en['mediaCenter.video.selectFile']);
    expect(stale).not.toContain(en['mediaCenter.video.browseFolder']);
  });
});
