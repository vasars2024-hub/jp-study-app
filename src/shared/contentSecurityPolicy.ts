/**
 * The packaged app's Content-Security-Policy, as data rather than as a string built inside a
 * function that needs Electron to import.
 *
 * It was inline in `main.ts` until Phase 9 / slice 47g. Nothing about the policy changed in
 * moving it; what changed is that it can now be READ BY A TEST. This is a load-bearing
 * security control — PHASE_6_5_AUDIT.md §3's chained High finding is precisely that a
 * compromised renderer could otherwise load from, or exfiltrate to, an arbitrary https:// host
 * — and it had no test, so a future edit that added `'unsafe-eval'` or widened `connect-src`
 * to blanket `https:` would have been invisible until someone re-read the audit.
 *
 * Scope: this applies to `app://bundle/index.html` and same-origin `app://` sub-resources
 * only, because it is registered alongside the `app://` protocol, which exists in PRODUCTION
 * builds. The Vite dev origin is deliberately untouched — HMR needs `eval` and a websocket
 * this policy would block, which is why a dev run logs Electron's "Insecure
 * Content-Security-Policy" warning and why that warning says nothing about a packaged build.
 *
 * `media:`, `playfile:` and `localfile:` are registered with `bypassCSP: true`
 * (`registerSchemesAsPrivileged`), so resources referenced through them load regardless of
 * what is listed here.
 */

export const CONTENT_SECURITY_POLICY_DIRECTIVES: readonly string[] = [
  "default-src 'self' app: media: playfile: localfile:",
  // `'wasm-unsafe-eval'` lets WebAssembly compile and nothing else — it is not `'unsafe-eval'`,
  // which would also allow JS `eval`/`new Function`. The media workspace's libass renderer
  // (styled .ass subtitles and MKV text tracks) is WebAssembly; without this every packaged
  // open showed "Error initializing libass renderer: CompileError ... violates the following
  // Content Security policy directive" (measured 2026-09-23 on a non-anime MKV).
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // Discovery artwork is provider-owned and rendered directly. Keep this
  // allow-list narrow rather than opening all HTTPS image hosts.
  //
  // `cdn.jiten.moe` joined the two media-discovery hosts when Jiten became a
  // Reading-workspace discovery provider: a deck search returns cover URLs on
  // that host (measured live — `https://cdn.jiten.moe/<deckId>/cover.jpg`), and
  // `ReadingUnifiedDiscovery` paints them directly. Without it every Jiten
  // result renders a CSP-blocked broken image in a PACKAGED build only, which
  // a dev run cannot show because this policy never binds to the Vite origin.
  // It is one more NAMED provider host, which is what the rule above permits;
  // it is not a step toward blanket `https:`. Art for a deck the user has
  // actually planned is still downloaded by main and served over `media://`
  // (`main/jiten.ts`'s `cacheDeckCover`) so it survives offline — this entry is
  // for the not-yet-planned search results that have no local copy to serve.
  //
  // `artworks.thetvdb.com` is the adopted media workspace's episode artwork: the sidecar's
  // episode metadata carries thumbnail URLs on that host, and a packaged build logged every
  // one as `blocked=csp` (measured 2026-09-23, e.g. `/banners/episodes/330692/…jpg` for
  // Laid-Back Camp), so episode lists and the player header showed empty frames. Same rule
  // as above: one more named provider host, not a step toward blanket `https:`.
  "img-src 'self' app: media: playfile: localfile: data: blob: https://cdn.myanimelist.net https://*.anilist.co https://cdn.jiten.moe https://artworks.thetvdb.com",
  // The sidecar origin appears here as well as in `connect-src`, and the two are
  // NOT interchangeable: `connect-src` governs the `fetch()` that prepares the
  // stream, `media-src` governs the `<video>` element that then loads it from
  // `/api/v1/directstream/stream` (StudyPlayerSlice.tsx's `{{SERVER_URL}}`
  // substitution). Fixing only the first gets the player as far as a live socket
  // and a successful POST — and still no picture. `blob:` covers the recorded
  // shadowing audio, which never touches the sidecar. `data:` is the flashcard audio:
  // `flashcardReadAudio` hands the review a `data:audio/...` URL, and without it EVERY
  // card clip failed in a packaged build ("no supported source") while dev — which this
  // policy never binds — played it fine (measured 2026-09-26 on a sentence deck). `img-src`
  // and `font-src` already allow `data:`; media cannot run script.
  "media-src 'self' app: media: playfile: localfile: data: blob: http://127.0.0.1:*",
  "font-src 'self' app: data:",
  // HuggingFace hosts are the one exception to "self only": the on-device
  // Whisper transcription (Transformers.js) streams its ONNX model weights
  // from HuggingFace on first use, then caches them for offline reuse. Scoped
  // to HF's domains — this is deliberately NOT a blanket https: allowance, so
  // a compromised renderer still can't exfiltrate to an arbitrary host
  // (PHASE_6_5_AUDIT.md §3). The onnxruntime engine itself is served locally
  // from app://bundle/ort (see whisperWorker.ts), so it needs no host here.
  // The bundled seanime sidecar is a loopback HTTP+websocket server, and the
  // renderer talks to it directly: the study player gates on
  // `GET /api/v1/status`, opens `POST /api/v1/directstream/play/localfile`,
  // and holds a `ws://127.0.0.1:<port>/events` socket (see
  // media/seanimeSocketPool.ts). Without these two sources every one of those
  // is blocked in a PACKAGED build only — dev runs off the Vite origin, which
  // this CSP never touches — and the failure is near-invisible: no request
  // reaches the network stack, so there is nothing to see in Network events,
  // and the gate's `fetch` rejects with a plain TypeError the caller catches.
  // The player simply never loads.
  //
  // The port is a wildcard rather than the live one on purpose. A CSP binds to
  // a document when it loads, so naming today's port would still fail twice
  // over: Blanc can open before the sidecar has a port at all, and the
  // supervisor can restart the server onto a NEW port while that document
  // stays loaded. Neither is reachable by re-registering a header.
  // Loopback-only keeps the property this list exists for (PHASE_6_5_AUDIT.md
  // §3) — a compromised renderer still cannot reach an off-machine host.
  "connect-src 'self' app: media: playfile: localfile: http://127.0.0.1:* ws://127.0.0.1:* https://huggingface.co https://*.huggingface.co https://*.hf.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
];

/** The header value sent for the `app:` scheme's URLs. */
export function contentSecurityPolicyHeader(): string {
  return CONTENT_SECURITY_POLICY_DIRECTIVES.join('; ');
}

/**
 * The sources a single directive lists, for tests that need to reason about one line rather
 * than about a 1,200-character string. Returns `null` when the directive is absent, which a
 * caller must distinguish from "present and empty" — an absent directive falls back to
 * `default-src`, which is a much weaker statement than an empty one.
 */
export function cspDirectiveSources(name: string): string[] | null {
  const hit = CONTENT_SECURITY_POLICY_DIRECTIVES.find(
    (directive) => directive === name || directive.startsWith(`${name} `),
  );
  if (!hit) return null;
  return hit.slice(name.length).trim().split(/\s+/).filter(Boolean);
}
