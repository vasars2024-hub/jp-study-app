/**
 * Pre-sweep D92 — Playlist settings was half-translated.
 *
 * Measured live on 2026-09-06 (pid 14128 window 2, playlist オノマトペ): of the nine
 * field labels on the panel, **five** were bare English JSX literals in every UI
 * language — "Channel id", "Channel title", "Channel icon URL", "Subscription status",
 * "Update frequency (hours)" — as were the "Channel name" placeholder and all four
 * values of the Subscription status dropdown, which rendered the raw
 * `YtSubscriptionStatus` enum member. The four labels directly above them (Whisper
 * lang, Prefer subs, Auto-update, Folder, Sort) go through `t()`, so the panel read
 * half-translated rather than untranslated.
 *
 * Two further sites in the same class were off-screen because the playlist has no
 * `channelId` — the header's `Channel` button and the channel card ("Channel tracking",
 * the raw status again, and "<n> videos tracked"). They are covered here too, since a
 * live walk cannot reach them on this data set.
 *
 * A source scan: `vitest.config.ts` is `environment: 'node'` and this view reaches
 * singletons at module eval, so it cannot be rendered here.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const SRC = fs.readFileSync('src/renderer/views/YouTubePlaylistsView.tsx', 'utf8');
const CATALOGS = ['en', 'ja', 'zh', 'ru'] as const;

/** The exact literals the live walk read off the panel. None may return. */
const LITERALS = [
  'Channel id',
  'Channel title',
  'Channel icon URL',
  'Subscription status',
  'Update frequency (hours)',
  'Channel tracking',
  'videos tracked',
];

/** Every key the fix introduced, each of which must exist in all four catalogs. */
const KEYS = [
  'yt.pref.channelId',
  'yt.pref.channelTitle',
  'yt.pref.channelNamePlaceholder',
  'yt.pref.channelIcon',
  'yt.pref.subStatus',
  'yt.pref.updateFreq',
  'yt.channel.refresh',
  'yt.channel.tracking',
  'yt.channel.videosTracked',
  'yt.subStatus.subscribed',
  'yt.subStatus.watching',
  'yt.subStatus.custom',
  'yt.subStatus.unsubscribed',
];

describe('D92 — Playlist settings speaks the UI language', () => {
  it('has no English literal left on the panel', () => {
    const left = LITERALS.filter((lit) => SRC.includes(`>${lit}<`) || SRC.includes(`"${lit}"`));
    expect(left).toEqual([]);
  });

  it('renders the subscription status through the catalog, not as the raw enum', () => {
    // `{status}` and `{playlist.subscriptionStatus}` were the two raw renders.
    expect(SRC).not.toMatch(/>\s*\{status\}\s*</);
    expect(SRC).not.toMatch(/<div>\{playlist\.subscriptionStatus\}<\/div>/);
    expect(SRC).toContain('t(`yt.subStatus.${status}`)');
    expect(SRC).toContain('t(`yt.subStatus.${playlist.subscriptionStatus}`)');
  });

  it('covers every member of the enum, so a dynamic key cannot miss one', () => {
    // The dynamic `yt.subStatus.${status}` key is only safe if SUB_STATUS_OPTS and the
    // catalog agree — a missing member would render the key itself to the user.
    const opts = SRC.match(/const SUB_STATUS_OPTS: YtSubscriptionStatus\[\] = \[([^\]]+)\]/);
    expect(opts).not.toBeNull();
    const members = [...(opts?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(members).toEqual(['subscribed', 'watching', 'custom', 'unsubscribed']);
    const en = fs.readFileSync('src/shared/i18n/catalogs/en.ts', 'utf8');
    for (const m of members) expect(en).toContain(`'yt.subStatus.${m}'`);
  });

  for (const lang of CATALOGS) {
    it(`${lang}: carries all ${KEYS.length} keys`, () => {
      const cat = fs.readFileSync(`src/shared/i18n/catalogs/${lang}.ts`, 'utf8');
      const missing = KEYS.filter((k) => !cat.includes(`'${k}'`));
      expect(missing).toEqual([]);
    });
  }

  it('gives every plural arm both of its slots', () => {
    // A `{name}`/`{count}` present in one arm and absent from another is unrenderable
    // in the language that selects the other arm, and no key-count check sees it.
    for (const lang of CATALOGS) {
      const cat = fs.readFileSync(`src/shared/i18n/catalogs/${lang}.ts`, 'utf8');
      for (const [key, slots] of [
        ['yt.channel.videosTracked', ['{count}']],
        ['yt.confirm.deleteFolder', ['{name}', '{count}']],
      ] as const) {
        const at = cat.indexOf(`'${key}'`);
        expect(at, `${lang} ${key}`).toBeGreaterThan(-1);
        const block = cat.slice(at, cat.indexOf('},', at) + 2);
        const arms = [...block.matchAll(/\b(one|few|many|other):\s*'([^']*)'/g)];
        expect(arms.length, `${lang} ${key} arms`).toBeGreaterThan(0);
        for (const [, arm, text] of arms) {
          for (const slot of slots) expect(text, `${lang} ${key}.${arm} missing ${slot}`).toContain(slot);
        }
      }
    }
  });
});

describe('the scan detects what it claims to', () => {
  it('would catch the pre-fix panel', () => {
    const before = '<label className="yt-pref"><span>Channel id</span><input /></label>';
    expect(LITERALS.filter((lit) => before.includes(`>${lit}<`))).toEqual(['Channel id']);
  });

  it('would catch the raw enum option returning', () => {
    const before = '<option key={status} value={status}>\n{status}\n</option>';
    expect(before).toMatch(/>\s*\{status\}\s*</);
  });
});
