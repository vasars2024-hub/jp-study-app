/**
 * L8 category 8 — a disabled control has to say what would turn it back on.
 *
 * Measured on the live Torrent Manager before this landed: `mutePairCount: 6`.
 * Six buttons were off with no `title`, no `aria-describedby` and no prose beside
 * them — "Send selected to Seanime", "Send selected to debrid", "Run
 * auto-downloader", "Simulate enabled rules", "Send 0 to qBittorrent" and "Clear
 * Selection". A neighbouring button's caption is NOT an explanation (cat8
 * correction 11), which is exactly why a row of six explained nothing.
 *
 * Two things are pinned, because they are the two ways this comes back:
 *
 *  1. THE REASON IS THE FIRST FAILING CLAUSE. Every one of those conditions is
 *     compound, so a fixed hint per button would name the wrong cause most of the
 *     time — "select a torrent first" on a button that is off because the sidecar
 *     is unreachable is a false statement, which is worse than silence.
 *  2. EVERY `disabled=` IN THE PAGE IS PAIRED WITH A `title=`. Adding a seventh
 *     unexplained button is the regression; a source guard catches it at the point
 *     it is written rather than the next time somebody runs the harness.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { engineReason, firstReason } from '../components/scraper/disabledReason';
import { SCRAPER_TEXT, sx } from '../components/scraper/strings';

const PAGE_SRC = readFileSync(
  join(__dirname, '..', 'components', 'scraper', 'pages', 'TorrentManagerPage.tsx'),
  'utf8',
);

describe('firstReason — the reason and the disabled value are one expression', () => {
  it('returns undefined when nothing is blocking, which is also "enabled"', () => {
    expect(firstReason([false, 'a'], [false, 'b'])).toBeUndefined();
    expect(firstReason()).toBeUndefined();
  });

  it('names the FIRST failing clause, not the last and not a merged sentence', () => {
    expect(firstReason([true, 'busy'], [true, 'nothing selected'])).toBe('busy');
    expect(firstReason([false, 'busy'], [true, 'nothing selected'])).toBe('nothing selected');
  });

  it('skips clauses that are not failing', () => {
    expect(firstReason([false, 'busy'], [false, 'nothing selected'], [true, 'engine off'])).toBe(
      'engine off',
    );
  });
});

describe('engineReason — the sidecar supplies its own reason', () => {
  it('quotes the engine message when there is one', () => {
    const said = engineReason('Debrid', { state: 'error', message: 'TorBox rejected the token.' });
    expect(said).toContain('Debrid');
    expect(said).toContain('TorBox rejected the token');
  });

  it('drops the message’s own full stop rather than doubling it', () => {
    // Measured live before this was added: the auto-downloader read
    // "… Seanime sidecar is stopped.. Fix it in Seanime, then Refresh."
    const said = engineReason('Auto-downloader', {
      state: 'offline',
      message: 'Seanime sidecar is stopped.',
    });
    expect(said).not.toContain('..');
    expect(said).toContain('stopped.');
  });

  it('falls back to the state word the status pill already shows', () => {
    expect(engineReason('Torrent client', { state: 'offline', message: '   ' })).toContain('offline');
  });

  it('distinguishes "no snapshot yet" from "an engine answered and said no"', () => {
    // Both leave the button off, and they need different actions from the user:
    // one is Refresh, the other is a fix in Seanime.
    expect(engineReason('Debrid', undefined)).toBe(sx('why.noSidecar'));
    expect(engineReason('Debrid', { state: 'disabled', message: 'not configured' })).not.toBe(
      sx('why.noSidecar'),
    );
  });

  it('is long enough to read as an explanation, not as a label', () => {
    // The harness only counts an explanation once it weighs >= 12 characters, so
    // a terse reason would score as a mute pair while looking present in source.
    expect(engineReason('Debrid', { state: 'offline', message: '' }).length).toBeGreaterThan(12);
    const whyKeys = (Object.keys(SCRAPER_TEXT) as Array<keyof typeof SCRAPER_TEXT>).filter((key) =>
      key.startsWith('why.'),
    );
    expect(whyKeys.length, 'the why.* keys exist at all').toBeGreaterThanOrEqual(10);
    for (const key of whyKeys) {
      const entry = SCRAPER_TEXT[key];
      const text =
        typeof entry === 'function'
          ? (entry as (a: string, b: string) => string)('Debrid', 'it is off')
          : entry;
      expect(text, `${key} interpolates both halves`).not.toContain('undefined');
      expect(text.length, `${key} is long enough to explain`).toBeGreaterThan(12);
    }
  });
});

describe('TorrentManagerPage — no control goes off without saying why', () => {
  /** Each `<Button` … `>` opening tag in the page, as its own slice of source. */
  function buttonTags(): string[] {
    const tags: string[] = [];
    let at = PAGE_SRC.indexOf('<Button');
    while (at > -1) {
      // Walk to the end of the opening tag, ignoring `>` inside arrow functions
      // by tracking brace depth — `onClick={() => …}` is full of them.
      let depth = 0;
      let i = at;
      for (; i < PAGE_SRC.length; i += 1) {
        const c = PAGE_SRC[i];
        if (c === '{') depth += 1;
        else if (c === '}') depth -= 1;
        else if (c === '>' && depth === 0) break;
      }
      tags.push(PAGE_SRC.slice(at, i));
      at = PAGE_SRC.indexOf('<Button', i);
    }
    return tags;
  }

  it('finds the buttons at all, so an empty sweep cannot pass', () => {
    expect(buttonTags().length).toBeGreaterThanOrEqual(8);
  });

  it('pairs every disabled button with a title', () => {
    const mute = buttonTags()
      .filter((tag) => tag.includes('disabled='))
      .filter((tag) => !tag.includes('title='));
    expect(mute, `unexplained disabled buttons:\n${mute.join('\n---\n')}`).toEqual([]);
  });

  it('spends the same value on both, rather than a caption written beside it', () => {
    // `disabled={!!whyX} title={whyX}` is the shape; a `disabled` that recomputes
    // its own condition is how the two drift apart again.
    for (const key of ['whySendClient', 'whySendDebrid', 'whyRunAuto', 'whySimulate']) {
      expect(PAGE_SRC, `${key} drives disabled`).toContain(`disabled={!!${key}}`);
      expect(PAGE_SRC, `${key} drives title`).toContain(`title={${key}}`);
    }
  });

  it('names the stopped engine before it asks for a selection', () => {
    // "Tick a torrent first" is true and useless when the engine is down: the
    // user selects a row and the button stays off. Pinned as an ordering, since
    // that is the only thing distinguishing an honest hint from a dead end.
    const sendBlock = PAGE_SRC.slice(
      PAGE_SRC.indexOf('const whySendClient'),
      PAGE_SRC.indexOf('const whyRunAuto'),
    );
    expect(sendBlock.length).toBeGreaterThan(100);
    expect(sendBlock.indexOf('engineReason')).toBeLessThan(sendBlock.indexOf('unselected'));
  });
});
