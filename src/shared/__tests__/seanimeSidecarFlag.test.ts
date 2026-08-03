import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SEANIME_SIDECAR_OPT_OUT_VALUES,
  seanimeSidecarEnabledFrom,
} from '../seanime';

/**
 * The sidecar flag flipped to **on by default** on 2026-07-31, closing old-player
 * retirement's first step. These pin the semantics of that flip.
 *
 * Why this matters more than a one-line constant suggests: `supervisor.ts` derives the
 * initial `SeanimeStatus` from this flag, and `MediaWorkspaceHost` renders `null` on
 * `disabled`. So a regression here does not surface as an error — the entire media
 * surface simply is not there, exactly as it was for every run before the flip.
 */
describe('seanimeSidecarEnabledFrom', () => {
  it('is ON when the variable is unset — this is the 2026-07-31 flip', () => {
    expect(seanimeSidecarEnabledFrom(undefined)).toBe(true);
  });

  it('treats an empty or whitespace value as unset, not as an opt-out', () => {
    // Matches how forge.config.ts reads its own sidecar env (`?.trim()` truthiness).
    expect(seanimeSidecarEnabledFrom('')).toBe(true);
    expect(seanimeSidecarEnabledFrom('   ')).toBe(true);
  });

  it('still honours =1, so every existing harness and recipe keeps its meaning', () => {
    expect(seanimeSidecarEnabledFrom('1')).toBe(true);
  });

  it.each(SEANIME_SIDECAR_OPT_OUT_VALUES)('opts out on %s', (value) => {
    expect(seanimeSidecarEnabledFrom(value)).toBe(false);
  });

  it('accepts an opt-out with surrounding whitespace or odd casing', () => {
    // A rollback that looks applied but is not is the worst failure mode this flag has.
    expect(seanimeSidecarEnabledFrom(' 0 ')).toBe(false);
    expect(seanimeSidecarEnabledFrom('False')).toBe(false);
    expect(seanimeSidecarEnabledFrom('OFF')).toBe(false);
  });

  it('leaves any other value enabled rather than guessing', () => {
    expect(seanimeSidecarEnabledFrom('yes')).toBe(true);
    expect(seanimeSidecarEnabledFrom('2')).toBe(true);
  });
});

describe('the flag source', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'seanime.ts'),
    'utf8',
  );

  it('does not gate on SEANIME_SIDECAR === \'1\' again', () => {
    // The pre-flip shape. Restoring it would return the app to default-OFF, which
    // presents as "the media workspace vanished" with nothing logged anywhere.
    expect(source).not.toMatch(/SEANIME_SIDECAR\s*===\s*'1'/);
  });

  it('derives the exported constant from the pure resolver', () => {
    // Not a style rule: a second, hand-inlined parse here is a second chance to
    // disagree with the one these tests cover.
    expect(source).toMatch(
      /SEANIME_SIDECAR_ENABLED\s*=[\s\S]{0,120}seanimeSidecarEnabledFrom\(/,
    );
  });
});
