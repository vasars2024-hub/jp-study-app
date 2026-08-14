// The subtitle/lyrics parser moved to `shared/subtitleCues.ts` so the main process
// can use it too — the EN→JA fusion job parses the English track in main, and main
// importing from renderer is a layer violation the architecture audit rejects.
//
// This file stays as the import path every existing consumer already names
// (`renderer/liveLyrics.ts`, `media/VideoCoreStudyOverlay.tsx`, the Blanc and
// Discover panels, and a dozen more). Nothing here re-implements anything.

export * from '../shared/subtitleCues';
