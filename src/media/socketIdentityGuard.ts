/**
 * The socket's own identity outranks any id an HTTP response carries.
 *
 * The sidecar routes every `native-player` message — the whole local-open protocol — to the
 * client id it named over the socket in `CLIENT_IDENTITY`. The adopted request layer
 * (`api/client/requests.ts`) also writes the shared identity from the `X-Seanime-Client-Id`
 * header of EVERY response. A request sent before the socket named its id carries the old one,
 * and when its response lands after `CLIENT_IDENTITY` it rolls the identity back.
 * `identityConfirmed` stays true, so the next local open goes out under an id no socket holds:
 * the sidecar prepares the stream, answers 200, signals a client that does not exist, and the
 * player sits silent until the stall message. Measured 2026-09-23 on a packaged build over a
 * fresh profile: 5 of 6 first opens failed. Each time the renderer's first outgoing frame
 * after `CLIENT_IDENTITY` (7ae8887b…) was already signed with the pre-socket id (ba8da64b…),
 * and not one `native-player` frame reached the socket. A retry fails the same way, because
 * nothing ever names the right id again.
 *
 * Pure so the rule is testable without a socket; `seanimeSocketPool.ts` applies it.
 */
export type SocketIdentity = { clientId: string; clientIdProof: string };

/**
 * What to write back, or null when the current identity is already the socket's.
 * `socket` is null while no socket has named an id; there is nothing to defend then, and an
 * HTTP-published id is the best there is.
 */
export function socketIdentityToRestore(
  current: SocketIdentity,
  socket: SocketIdentity | null,
): SocketIdentity | null {
  if (!socket || !socket.clientId) return null;
  if (current.clientId === socket.clientId) return null;
  return socket;
}
