/**
 * Latency-measurement escape hatch, off unless `?noReactTrack=1` is in the URL,
 * and compiled out of production builds entirely.
 *
 * React's DEV build logs every re-rendered component to the DevTools "Components"
 * track, and for any fiber whose props identity changed it SERIALIZES the whole
 * props diff first (`addObjectDiffToProperties`, react-dom dev only). On a surface
 * that passes a list as a prop the cost is proportional to the list, lands outside
 * React's own render measurement, and reads as product latency.
 *
 * `supportsUserTiming` is computed once when react-dom evaluates, from
 * `console.timeStamp`, so this must run before react-dom does. It used to be an
 * inline <script> in index.html, which the packaged app's Content-Security-Policy
 * (no 'unsafe-inline') refused on EVERY launch — a console error in production for
 * a dev-only switch. As the first import of `main.tsx` it still evaluates before
 * react-dom (ES modules evaluate their imports in order), and `import.meta.env.DEV`
 * removes it from the production bundle.
 */
if (import.meta.env.DEV && typeof location !== 'undefined' && location.search.includes('noReactTrack')) {
  delete (console as { timeStamp?: unknown }).timeStamp;
}

export {};
