// The two renderer tests the root include glob has never matched — slice 40.
//
// `vitest.config.ts` collects `src/renderer/__tests__/**/*.test.ts`. That is `.ts`, not
// `.tsx`, and two files in that directory are `.tsx`:
//
//   src/renderer/__tests__/externalPlayerPanel.test.tsx
//   src/renderer/__tests__/mediaTrackingSourcesHistory.test.tsx
//
// **Neither had ever been executed.** Phase 5 recorded the gap and correctly left the glob
// alone — `CLAUDE.md` keeps root configs out of scope — but "out of scope to fix" became "out
// of sight", and both files had drifted out of agreement with the components they describe.
// A test that never runs is not a test; it is a claim with no expiry date, which is the same
// disease `audit-carried-items.mjs` exists for.
//
// This config lives in tools/ rather than at the root so it changes nothing about the repo's
// configured test surface, and it does not import `vitest/config` because it may be run from
// anywhere.
//
// usage:
//   npx vitest run --config docs/migration/tools/vitest.tsx.config.mjs
//
// THE REAL FIX IS ONE CHARACTER, and it belongs to the owner of the root config: widen the
// glob to `*.test.{ts,tsx}`. Until then this file is how the two of them get run.

export default {
  test: {
    include: ['src/renderer/__tests__/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 20000,
  },
};
