/**
 * The seek-bar preview's `&thumbnail=true` must not change which file a `playfile://` URL
 * serves (see shared/playfileUrl.ts): before, the whole suffix became part of the token and
 * every local-file preview request 404'd.
 */
import { describe, expect, it } from 'vitest';
import { playfileToken } from '../playfileUrl';

const TOKEN = '4bf056ff-21f2-49c7-ae71-34ed9131e473';

describe('playfile URL token', () => {
  it('reads the token of a plain stream URL', () => {
    expect(playfileToken(`playfile://${TOKEN}`)).toBe(TOKEN);
    expect(playfileToken(`playfile://${TOKEN}/`)).toBe(TOKEN);
  });

  it("ignores the preview's appended &thumbnail=true (the URL the packaged app requested)", () => {
    const previewUrl = `playfile://${TOKEN}` + '&thumbnail=true';
    expect(new URL(previewUrl).host).not.toBe(TOKEN); // why a bare .host lookup missed
    expect(playfileToken(previewUrl)).toBe(TOKEN);
    expect(playfileToken(`${previewUrl}/`)).toBe(TOKEN);
  });

  it('ignores a query the same way', () => {
    expect(playfileToken(`playfile://${TOKEN}?thumbnail=true`)).toBe(TOKEN);
  });
});
