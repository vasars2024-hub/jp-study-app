// Scraper — the anime scraping application.
//
// This file is deliberately thin. It exists to keep the DesktopWinSection
// wiring (shared/desktop.ts, AppSection.tsx, DesktopShell.tsx, CommandPalette)
// pointing at a stable module while the app itself lives in
// components/scraper/, which is where the shell, pages and settings drawer are.
//
// The catalogue console that used to *be* this view is now one page inside it
// (components/scraper/pages/DiscoverPage.tsx). It still renders the shared
// components/discover/DiscoverContent.tsx unchanged, because Blanc renders that
// same module (BLANC_REFINEMENT_PLAN Pillar 0) — forking it would split a
// working, IPC-backed feature in two.

import ScraperApp from '../components/scraper/ScraperApp';

export default function ScraperView() {
  return <ScraperApp />;
}
