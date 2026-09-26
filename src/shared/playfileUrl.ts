/**
 * The media token a `playfile://<token>` URL names.
 *
 * The adopted player's seek-bar preview (vendor `video-core-preview.ts`) builds its frame
 * source as `streamUrl + "&thumbnail=true"`. For a sidecar stream
 * (`…/directstream/stream?id=…`) that lands in the query; for a local file's
 * `playfile://<token>` it lands in the HOST, so every preview request asked for the token
 * `<token>&thumbnail=true`, got a 404, and hovering the seek bar showed no frames (round-4
 * console sweep: "404 playfile://…&thumbnail=true/" on every local video). Tokens are UUIDs,
 * so anything from the first `&` on is never part of one.
 */
export function playfileToken(url: string): string {
  return new URL(url).host.split('&')[0];
}
