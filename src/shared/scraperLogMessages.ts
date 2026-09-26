// Fixed sentences main writes into the scraper log that the renderer shows.
//
// Main keeps writing English — the rotating log files are read by people filing
// bugs, and a log line must not change meaning with the UI language. The
// renderer recognises these exact sentences and shows them translated
// (`renderer/components/scraper/localize.ts`), so both sides import one constant
// rather than each spelling the sentence and drifting apart.

export const SCRAPER_LOG_MESSAGE = {
  backendReady: 'Scraper backend ready.',
} as const;
