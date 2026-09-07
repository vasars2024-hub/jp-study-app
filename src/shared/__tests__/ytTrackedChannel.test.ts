import { describe, expect, it } from 'vitest';
import { resolveTrackedChannel } from '../ytPlaylists';
import type { YtChannel } from '../ytPlaylists';

/**
 * D300 — the Channel tracking card never rendered for the user's one subscribed
 * channel.
 *
 * Measured live 2026-09-07 on pid 14128: the store held playlist `オノマトペ`
 * (16 videos, `channelTitle: 'ゆる言語学ラジオ'`, **no `channelId`**), playlist
 * `Extension` (`channelId: UCmpkIzF3xFzhPez7gXOyhVg`) and channel
 * `ゆる言語学ラジオ` (subscribed, `videoCount: 3`). The tree renders one item,
 * because `isImmersionPlaylist` deliberately excludes the extension playlist — so
 * the only reachable playlist was the one with no `channelId`, and the card that
 * guards on that id read `NO CHANNEL CARD RENDERED` off the live DOM.
 *
 * The shape worth remembering: two fields that identify the same thing, only one
 * of which the guard consults, and a data source that fills the other one far more
 * often.
 */

const ch = (channelId: string, title: string, videoCount?: number): YtChannel =>
  ({
    id: `ytc-${channelId}`,
    channelId,
    title,
    subscriptionStatus: 'subscribed',
    playlistIds: [],
    videoCount,
    createdAt: 0,
  }) as unknown as YtChannel;

const YURU = ch('UCmpkIzF3xFzhPez7gXOyhVg', 'ゆる言語学ラジオ', 3);
const OTHER = ch('UCother', 'Another channel', 9);

describe('resolveTrackedChannel', () => {
  it('resolves by channelId when the playlist carries one', () => {
    const p = { channelId: 'UCmpkIzF3xFzhPez7gXOyhVg', channelTitle: undefined };
    expect(resolveTrackedChannel(p, [OTHER, YURU])?.title).toBe('ゆる言語学ラジオ');
  });

  it('resolves by channelTitle when the id is absent — the live case', () => {
    const p = { channelId: undefined, channelTitle: 'ゆる言語学ラジオ' };
    const found = resolveTrackedChannel(p, [OTHER, YURU]);
    expect(found?.channelId).toBe('UCmpkIzF3xFzhPez7gXOyhVg');
    expect(found?.videoCount).toBe(3);
  });

  it('lets the id win over a title that names a different channel', () => {
    // A stale or duplicated title must never override a real id match.
    const decoy = ch('UCdecoy', 'ゆる言語学ラジオ', 999);
    const p = { channelId: 'UCmpkIzF3xFzhPez7gXOyhVg', channelTitle: 'ゆる言語学ラジオ' };
    expect(resolveTrackedChannel(p, [decoy, YURU])?.channelId).toBe('UCmpkIzF3xFzhPez7gXOyhVg');
  });

  it('falls back to the title when the id matches nothing', () => {
    const p = { channelId: 'UCgone', channelTitle: 'ゆる言語学ラジオ' };
    expect(resolveTrackedChannel(p, [YURU])?.channelId).toBe('UCmpkIzF3xFzhPez7gXOyhVg');
  });

  it('returns undefined rather than guessing when nothing matches', () => {
    // The caller renders no tracked-count line on undefined, so a miss shows
    // nothing instead of asserting a confident "0 videos tracked".
    expect(resolveTrackedChannel({ channelId: 'UCgone', channelTitle: 'Nobody' }, [YURU])).toBeUndefined();
    expect(resolveTrackedChannel({ channelId: undefined, channelTitle: undefined }, [YURU])).toBeUndefined();
    expect(resolveTrackedChannel(null, [YURU])).toBeUndefined();
  });

  it('picks the first of two channels sharing a title, deterministically', () => {
    const a = ch('UCa', 'Same name', 1);
    const b = ch('UCb', 'Same name', 2);
    expect(resolveTrackedChannel({ channelTitle: 'Same name' }, [a, b])?.channelId).toBe('UCa');
  });
});
