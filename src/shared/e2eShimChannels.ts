/**
 * IPC channels of the e2e harness's page shim (main/e2eHeadless.ts).
 *
 * Headless mode registers a SESSION preload, generated at run time, that installs the
 * shim in every page's main world: `navigator.clipboard` and `execCommand('copy')` go
 * to the in-memory clipboard over these channels, and the shim reports what it
 * answered (a synthetic `getDisplayMedia`, a late install). Both ends exist only under
 * `GUM_E2E_HEADLESS`; the names live here because the renderer-side caller is that
 * generated preload, not a file of src/preload.ts or src/renderer.
 */
export const E2E_SHIM_CHANNELS = {
  clipboardRead: 'e2e:clipboard:read',
  clipboardWrite: 'e2e:clipboard:write',
  note: 'e2e:shim:note',
} as const;
