/**
 * The app's one `setDisplayMediaRequestHandler`.
 *
 * Electron lets a session have exactly one display-media handler, and the
 * system-audio capture window installed its own, refusing every other window
 * — so any second feature that needed the screen (the Region Recorder) was
 * refused too, and a second handler would silently replace the first. This
 * broker owns the handler instead. A window that may capture registers itself
 * with a `decide` function that returns the streams to grant for a request;
 * the broker routes each request to the registration whose window's MAIN
 * FRAME made it, and refuses everything else (an unregistered window, a
 * subframe, a destroyed window, a decision that throws).
 *
 * Registering also allows the window through the permission layer
 * (`securityHardening.allowDisplayCapture`), and the returned disposer undoes
 * both, so a registration cannot outlive its window by accident.
 */
import { session } from 'electron';
import { allowDisplayCapture } from './securityHardening';

/** The parts of `DisplayMediaRequestHandlerHandlerRequest` the broker reads. */
export interface DisplayMediaRequestLike {
  frame?: { processId: number; routingId: number } | null;
  audioRequested?: boolean;
  videoRequested?: boolean;
}

/** The streams to grant (Electron's `Streams`), or `null` to refuse. */
export type DisplayMediaDecision = Electron.Streams | null;

export type DisplayMediaDecide = (request: DisplayMediaRequestLike) => DisplayMediaDecision | Promise<DisplayMediaDecision>;

/** The parts of a `WebContents` the broker needs. */
export interface DisplayMediaRequester {
  id: number;
  mainFrame: { processId: number; routingId: number };
  isDestroyed?: () => boolean;
}

interface Registration {
  contents: DisplayMediaRequester;
  decide: DisplayMediaDecide;
  token: number;
}

const registrations = new Map<number, Registration>();
let nextToken = 1;
let installedOn: unknown = null;

function frameOf(contents: DisplayMediaRequester): { processId: number; routingId: number } | null {
  try {
    if (contents.isDestroyed?.()) return null;
    const frame = contents.mainFrame;
    return frame ? { processId: frame.processId, routingId: frame.routingId } : null;
  } catch {
    // A destroyed WebContents throws on `mainFrame`.
    return null;
  }
}

/** The registration whose window's main frame made this request, if any. */
function registrationFor(request: DisplayMediaRequestLike): Registration | null {
  const frame = request?.frame;
  if (!frame) return null;
  for (const registration of registrations.values()) {
    const main = frameOf(registration.contents);
    if (main && main.processId === frame.processId && main.routingId === frame.routingId) return registration;
  }
  return null;
}

/** The handler body, exported for tests that drive it without a session. */
export async function decideDisplayMediaRequest(request: DisplayMediaRequestLike): Promise<DisplayMediaDecision> {
  const registration = registrationFor(request);
  if (!registration) return null;
  try {
    return (await registration.decide(request)) ?? null;
  } catch {
    return null;
  }
}

/** Install the broker on `ses` (the default session unless told otherwise). Idempotent. */
export function installDisplayMediaBroker(ses?: Electron.Session): void {
  const target = ses ?? session?.defaultSession;
  if (!target || installedOn === target) return;
  try {
    target.setDisplayMediaRequestHandler((request, callback) => {
      // A stranger is refused at once, not a tick later.
      if (!registrationFor(request as unknown as DisplayMediaRequestLike)) {
        callback({});
        return;
      }
      void decideDisplayMediaRequest(request as unknown as DisplayMediaRequestLike).then(
        (streams) => callback(streams ?? {}),
        () => callback({}),
      );
    });
    installedOn = target;
  } catch {
    /* an older runtime without the handler: requesters report a stream failure */
  }
}

/**
 * Let `contents` ask for the screen; `decide` chooses what it gets. Replaces an
 * earlier registration of the same window. The disposer is idempotent and only
 * removes this registration, never a later one for the same window.
 */
export function registerDisplayMediaRequester(contents: DisplayMediaRequester, decide: DisplayMediaDecide): () => void {
  installDisplayMediaBroker();
  const token = nextToken;
  nextToken += 1;
  registrations.set(contents.id, { contents, decide, token });
  const releasePermission = allowDisplayCapture(contents.id);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (registrations.get(contents.id)?.token === token) {
      registrations.delete(contents.id);
      releasePermission();
    }
  };
}

/** How many windows may currently capture (diagnostics and tests). */
export function displayMediaRequesterCount(): number {
  return registrations.size;
}
