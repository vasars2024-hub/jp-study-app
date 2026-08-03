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
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  // Discovery artwork is provider-owned and rendered directly. Keep this
  // allow-list narrow rather than opening all HTTPS image hosts.
  "img-src 'self' app: media: playfile: localfile: data: blob: https://cdn.myanimelist.net https://*.anilist.co",
  // The sidecar origin appears here as well as in `connect-src`, and the two are
  // NOT interchangeable: `connect-src` governs the `fetch()` that prepares the
  // stream, `media-src` governs the `<video>` element that then loads it from
  // `/api/v1/directstream/stream` (StudyPlayerSlice.tsx's `{{SERVER_URL}}`
  // substitution). Fixing only the first gets the player as far as a live socket
  // and a successful POST — and still no picture. `blob:` covers the recorded
  // shadowing audio, which never touches the sidecar.
  "media-src 'self' app: media: playfile: localfile: blob: http://127.0.0.1:*",
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
