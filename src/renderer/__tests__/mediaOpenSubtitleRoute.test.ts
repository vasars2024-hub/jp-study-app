// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '..', '..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf8');

/*
  `media:open` resolves which stored track belongs to the file it is opening —
  `pickPlaybackSubtitle` over the item's records, honouring the id the library
  stored — and returns it as `MediaOpen.subtitle`. For the whole life of that
  field the only renderer paths that read it were the YouTube download branch and
  an explicit study-context record id; the ordinary library open threw it away,
  which is why `media.ts` describes its own discovery pipeline as "write-only:
  tracks are downloaded, listed in the drawer, and never actually shown while
  watching".

  These are source assertions rather than a mount, because `useMedia` is a
  1,700-line hook over ~40 `window.api` calls and the sibling
  `mediaCenterIntegration.test.ts` established the local pattern. Each one pins a
  property that, when it was false, produced the defect named above.
*/
describe('the open route delivers the resolved subtitle to the player', () => {
  const player = read('renderer/components/media/MediaContent.tsx');
  const loadOpened = player.slice(
    player.indexOf('const loadOpened = useCallback'),
    player.indexOf('// Deep-open from playlist manager'),
  );

  it('applies MediaOpen.subtitle from loadOpened, which every open path goes through', () => {
    expect(loadOpened, 'loadOpened must be found in the source').not.toHaveLength(0);
    expect(loadOpened).toContain('if (r.subtitle) applySubtitleFile(r.subtitle.name, r.subtitle.text);');
  });

  it('applies it after the reset that would otherwise clear it', () => {
    // `setCues([])` / `setSubName('')` run first on purpose: a new file must not
    // inherit the last one's track. The apply has to come after them or the
    // reset wins and the status line stays empty.
    expect(loadOpened.indexOf('setCues([]);')).toBeLessThan(
      loadOpened.indexOf('if (r.subtitle)'),
    );
  });

  it('restores the item stored offset after the apply zeroes it', () => {
    // `applySubtitleFile` calls `setSubOffset(0)`. The alignment the user saved
    // on the item outranks a fresh track's default, so the item's offset is
    // written last.
    expect(loadOpened.indexOf('if (r.subtitle)')).toBeLessThan(
      loadOpened.indexOf('setSubOffset(r.item.subOffsetSec ?? 0);'),
    );
  });

  it('declares applySubtitleFile before loadOpened, so the dependency is not a TDZ read', () => {
    // `loadOpened` names it in its dependency array, and a dependency array is
    // evaluated on every render — a later `const` would throw before paint.
    const apply = player.indexOf('const applySubtitleFile = useCallback');
    expect(apply).toBeGreaterThan(-1);
    expect(apply).toBeLessThan(player.indexOf('const loadOpened = useCallback'));
    expect(loadOpened).toContain('}, [applySubtitleFile]);');
  });

  it('has exactly one applySubtitleFile, so the study split cannot be bypassed', () => {
    expect(player.match(/const applySubtitleFile = useCallback/g)).toHaveLength(1);
    // A stored record read as study material goes through `parseStudySubtitles`.
    // The YouTube branch used to re-parse the same text with the bare parser
    // straight after `loadOpened`, which put both languages of a dual-language
    // track back on screen.
    expect(player).not.toContain('parseSubtitles(r.subtitle.text)');
  });

  it('keeps main computing the pick, rather than restating the ranking in the renderer', () => {
    const main = read('main/media.ts');
    expect(main).toContain('pickPlaybackSubtitle(');
    expect(main).toContain('item.preferredSubtitleId');
    // A mention in a comment is fine; a call is the renderer keeping a second
    // copy of the ranking, which is how the two would drift apart.
    expect(player).not.toMatch(/[^`]pickPlaybackSubtitle\(/);
  });
});
