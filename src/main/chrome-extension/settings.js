/* Settings model shared by popup / options / content / background.
 *
 * Schema v2. v1 settings (preferAnki, localFolderLabel, generic wheel slots,
 * FAB badge toggles) are migrated in place the first time they are loaded —
 * pairing, folder label, YouTube prefs, hidden-site list and wheel layout are
 * preserved; nothing is silently dropped except keys whose feature no longer
 * exists (fabShowDest / fabShowContext — the destination and profile badges
 * were removed from the on-page panel).
 */
const JP_SETTINGS_KEY = 'jpStudySettings';
/**
 * 3: the hover scan became one batched request, so the old 140 ms default
 * hover delay (stored verbatim by every v2 save) is lowered to 40 ms — only
 * when it is still that untouched default; a delay the user chose is kept.
 */
const JP_SETTINGS_VERSION = 3;
const JP_V2_DEFAULT_HOVER_DELAY = 140;

/** Fixed wheel positions, clockwise from the top. */
const JP_WHEEL_POSITIONS = ['top', 'upper-right', 'lower-right', 'bottom', 'lower-left', 'upper-left'];

const JP_DEFAULT_WHEEL_SLOTS = [
  'lookup.selection',
  'save.word',
  'save.sentence',
  'card.create',
  'capture.page',
  'wheel.more',
];

/** v1 wheel-slot ids → v2 command ids (kept for migration). */
const JP_V1_SLOT_MAP = {
  save: 'capture.page',
  download: 'media.download',
  mine: 'save.word',
  dictionary: 'lookup.selection',
  clipboard: 'clipboard.send',
  ocr: 'capture.ocr',
  'bulk-tabs': 'tabs.picker',
  record: 'capture.audio.record',
  'audio-save': 'capture.audio.save',
  theme: 'reader.theme',
  highlight: 'reader.highlight',
  learn: 'reader.knownTint',
  epub: 'capture.page',
  grammar: 'grammar.match',
  translate: 'translate.selection',
};

const JP_HOVER_KEYS = ['shift', 'alt', 'ctrl'];

const JP_DEFAULT_SETTINGS = {
  version: JP_SETTINGS_VERSION,
  // Pairing
  token: '',
  port: 18765,
  // AI OCR / Dictionary AI — what a highlight or an OCR resolves to. The two
  // are separate because highlighting is a constant, low-intent gesture while
  // an OCR is deliberate: wanting a full AI read of every drag-select but not
  // of every screenshot (or the reverse) is the normal case, not an edge one.
  aiOnHighlight: false,
  aiOnOcr: false,
  // Minimum selected characters before a highlight is treated as a sentence
  // worth a cloud call rather than a word worth a dictionary lookup.
  aiMinChars: 6,
  // Hover lookup
  hoverLookup: true,
  hoverKey: 'shift', // shift | alt | ctrl
  // 0–1000. The scan is one batched request now, so a short rest is enough to
  // skip the words the pointer only crosses; 140 felt sluggish next to 10ten.
  hoverDelayMs: 40,
  closeOnRelease: false, // popup closes when the key is released (unless pinned/hovered)
  clickLookup: true, // key+click also opens the popup
  scanLength: 12, // max characters in the hover scan window (4–24)
  lookupInEditable: false,
  // Keep recent lookups on this machine so the popup still answers with Gum closed.
  offlineCache: true,
  // Word status: ruby furigana over new / learning words (mutates the page, so opt-in).
  furigana: false,
  // Also run in embedded frames (registered dynamically; the manifest stays top-frame only).
  allFrames: false,
  // Reader popup
  popupWidth: 360, // 280–560
  popupFontSize: 14, // 12–18
  popupCompact: false,
  popupPinOnClick: true,
  popupTheme: 'auto', // auto (follow the page, then the OS) | light | dark
  popupAutoAudio: false, // play the word's audio when the popup opens
  // Recording
  recordMaxMinutes: 60, // 1–240; a recording stops itself after this
  recordAutoCrop: true, // a tab recording on a page with a video records just the video
  recordMicWithTab: false, // the microphone recording also takes the tab's sound
  recordTranscribe: true, // ask Gum to transcribe a finished tab recording
  // Saving
  saveDestination: 'both', // 'app' (Gum only) | 'both' (Gum + Anki)
  folderLabel: 'Extension',
  confirmBeforeCard: true, // show the card preview before Create card sends
  // Media
  youtubeMode: 'download', // 'metadata' | 'download'
  youtubeAudioOnly: false,
  // Radial wheel
  wheelEnabled: true,
  wheelSlots: JP_DEFAULT_WHEEL_SLOTS.slice(),
  // On-page panel
  fabVisible: true,
  fabStartCollapsed: false,
  fabCorner: 'bottom-right', // bottom-right | bottom-right-mid | top-right
  fabShowLevel: true,
  fabShowComprehensibility: true,
  fabShowTheme: true,
  fabShowHighlight: true,
  fabShowLearn: true,
  fabShowOcr: true,
  fabHiddenOrigins: [],
  // Misc
  logImmersion: true,
  notes: '',
};

function jpClampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function jpResolveSlotId(raw) {
  const id = String(raw || '').trim();
  if (!id) return null;
  const S = typeof globalThis !== 'undefined' ? globalThis.jpStudyShared : null;
  if (S && typeof S.resolveCommandId === 'function') {
    const resolved = S.resolveCommandId(id);
    if (resolved) {
      const cmd = S.getCommand(resolved);
      return cmd && cmd.wheel ? resolved : null;
    }
    return null;
  }
  return JP_V1_SLOT_MAP[id] || (id.includes('.') ? id : null);
}

/** Migrate a raw stored object (any version) to the v2 shape. Non-destructive. */
function jpMigrateSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  if (src.version === JP_SETTINGS_VERSION) return src;
  const out = { ...src, version: JP_SETTINGS_VERSION };

  // v2 → v3: the old default hover delay becomes the new one (see VERSION).
  if (src.hoverDelayMs === JP_V2_DEFAULT_HOVER_DELAY) delete out.hoverDelayMs;

  // v1 → v2 renames
  if (src.localFolderLabel != null && out.folderLabel == null) {
    out.folderLabel = src.localFolderLabel;
  }
  if (src.preferAnki != null && out.saveDestination == null) {
    out.saveDestination = src.preferAnki === false ? 'app' : 'both';
  }

  // v1 wheel slots (4 or 6 generic ids) → v2 six-position command layout
  if (Array.isArray(src.wheelSlots) && src.wheelSlots.some((id) => !String(id).includes('.'))) {
    const mapped = src.wheelSlots
      .map((id) => jpResolveSlotId(id))
      .filter(Boolean);
    const slots = [];
    for (const id of mapped) {
      if (!slots.includes(id)) slots.push(id);
    }
    for (const id of JP_DEFAULT_WHEEL_SLOTS) {
      if (slots.length >= 6) break;
      if (!slots.includes(id)) slots.push(id);
    }
    out.wheelSlots = slots.slice(0, 6);
  }

  delete out.wheelSlotCount; // wheel is always 6 positions now
  delete out.fabShowDest; // destination badge removed
  delete out.fabShowContext; // category·profile badge removed
  return out;
}

function jpNormalizeSettings(raw) {
  const migrated = jpMigrateSettings(raw);
  const s = Object.assign({}, JP_DEFAULT_SETTINGS, migrated);
  s.version = JP_SETTINGS_VERSION;
  s.port = jpClampInt(s.port, 1, 65535, 18765);
  s.token = typeof s.token === 'string' ? s.token : '';

  s.aiOnHighlight = s.aiOnHighlight === true;
  s.aiOnOcr = s.aiOnOcr === true;
  s.aiMinChars = jpClampInt(s.aiMinChars, 2, 60, 6);

  s.hoverLookup = s.hoverLookup !== false;
  s.hoverKey = JP_HOVER_KEYS.includes(s.hoverKey) ? s.hoverKey : 'shift';
  s.hoverDelayMs = jpClampInt(s.hoverDelayMs, 0, 1000, 40);
  s.closeOnRelease = !!s.closeOnRelease;
  s.clickLookup = s.clickLookup !== false;
  s.scanLength = jpClampInt(s.scanLength, 4, 24, 12);
  s.lookupInEditable = !!s.lookupInEditable;
  s.offlineCache = s.offlineCache !== false;
  s.furigana = s.furigana === true;
  s.allFrames = s.allFrames === true;

  s.popupWidth = jpClampInt(s.popupWidth, 280, 560, 360);
  s.popupFontSize = jpClampInt(s.popupFontSize, 12, 18, 14);
  s.popupCompact = !!s.popupCompact;
  s.popupPinOnClick = s.popupPinOnClick !== false;
  s.popupTheme = s.popupTheme === 'light' || s.popupTheme === 'dark' ? s.popupTheme : 'auto';
  s.popupAutoAudio = s.popupAutoAudio === true;

  s.recordMaxMinutes = jpClampInt(s.recordMaxMinutes, 1, 240, 60);
  s.recordAutoCrop = s.recordAutoCrop !== false;
  s.recordMicWithTab = s.recordMicWithTab === true;
  s.recordTranscribe = s.recordTranscribe !== false;

  s.saveDestination = s.saveDestination === 'app' ? 'app' : 'both';
  s.folderLabel = String(s.folderLabel || 'Extension').slice(0, 40) || 'Extension';
  s.confirmBeforeCard = s.confirmBeforeCard !== false;

  s.youtubeMode = s.youtubeMode === 'metadata' ? 'metadata' : 'download';
  s.youtubeAudioOnly = !!s.youtubeAudioOnly;

  s.wheelEnabled = s.wheelEnabled !== false;
  let slots = Array.isArray(s.wheelSlots)
    ? s.wheelSlots.map((id) => jpResolveSlotId(id)).filter(Boolean)
    : [];
  const seen = new Set();
  slots = slots.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  for (const id of JP_DEFAULT_WHEEL_SLOTS) {
    if (slots.length >= 6) break;
    if (!seen.has(id)) {
      slots.push(id);
      seen.add(id);
    }
  }
  s.wheelSlots = slots.slice(0, 6);

  s.fabVisible = s.fabVisible !== false;
  s.fabStartCollapsed = !!s.fabStartCollapsed;
  s.fabCorner =
    s.fabCorner === 'top-right' || s.fabCorner === 'bottom-right-mid'
      ? s.fabCorner
      : 'bottom-right';
  s.fabShowLevel = s.fabShowLevel !== false;
  s.fabShowComprehensibility = s.fabShowComprehensibility !== false;
  s.fabShowTheme = s.fabShowTheme !== false;
  s.fabShowHighlight = s.fabShowHighlight !== false;
  s.fabShowLearn = s.fabShowLearn !== false;
  s.fabShowOcr = s.fabShowOcr !== false;
  s.fabHiddenOrigins = Array.isArray(s.fabHiddenOrigins)
    ? s.fabHiddenOrigins.filter((o) => typeof o === 'string').slice(0, 200)
    : [];

  s.logImmersion = s.logImmersion !== false;
  s.notes = typeof s.notes === 'string' ? s.notes : '';

  // Drop dead v1 keys so exports stay clean.
  delete s.localFolderLabel;
  delete s.preferAnki;
  delete s.wheelSlotCount;
  delete s.fabShowDest;
  delete s.fabShowContext;
  return s;
}

async function jpLoadSettings() {
  const data = await chrome.storage.local.get([JP_SETTINGS_KEY, 'jpStudyToken', 'jpStudyPort']);
  const raw = data[JP_SETTINGS_KEY] || {};
  if (!raw.token && typeof data.jpStudyToken === 'string') raw.token = data.jpStudyToken;
  if (raw.port == null && typeof data.jpStudyPort === 'number') raw.port = data.jpStudyPort;
  return jpNormalizeSettings(raw);
}

async function jpSaveSettings(partial) {
  const cur = await jpLoadSettings();
  const next = jpNormalizeSettings(Object.assign({}, cur, partial));
  await chrome.storage.local.set({
    [JP_SETTINGS_KEY]: next,
    // Legacy mirror keys read by the background worker's fast path.
    jpStudyToken: next.token,
    jpStudyPort: next.port,
  });
  return next;
}

if (typeof globalThis !== 'undefined') {
  globalThis.jpStudySettings = {
    KEY: JP_SETTINGS_KEY,
    VERSION: JP_SETTINGS_VERSION,
    DEFAULTS: JP_DEFAULT_SETTINGS,
    WHEEL_POSITIONS: JP_WHEEL_POSITIONS,
    DEFAULT_WHEEL_SLOTS: JP_DEFAULT_WHEEL_SLOTS,
    HOVER_KEYS: JP_HOVER_KEYS,
    normalize: jpNormalizeSettings,
    migrate: jpMigrateSettings,
    load: jpLoadSettings,
    save: jpSaveSettings,
  };
}
