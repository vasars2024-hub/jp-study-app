/**
 * Static practical checks for the Chrome extension package (no Chrome UI).
 * Run: node tools/extension-feature-check.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ext = path.join(root, 'extension');
const bundle = path.join(root, 'src', 'main', 'chrome-extension');

const results = [];

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

// 1) Manifest commands ≤ 4 with suggested_key
const manifest = JSON.parse(read(path.join(ext, 'manifest.json')));
const cmds = manifest.commands || {};
const withKey = Object.entries(cmds).filter(([, c]) => c && c.suggested_key);
check(
  'Chrome commands: ≤4 suggested shortcuts',
  withKey.length <= 4,
  `${withKey.length}: ${withKey.map(([k]) => k).join(', ')}`,
);
check(
  'Required shortcuts present (save, dict, mine, wheel)',
  ['save-page', 'dictionary-popup', 'mine-selection', 'action-wheel'].every((k) => cmds[k]),
  Object.keys(cmds).join(', '),
);

// 2) Critical extension files
for (const f of [
  'manifest.json',
  'background.js',
  'popup.html',
  'popup.js',
  'content.js',
  'content.css',
  'shared.js',
  'options.html',
  'options.js',
  'settings.js',
]) {
  check(`extension/${f} exists`, exists(path.join(ext, f)));
}

// 3) Content script capabilities
const content = read(path.join(ext, 'content.js'));
const shared = read(path.join(ext, 'shared.js'));
check('Radial wheel in content.js', content.includes('jp-action-wheel') || content.includes('openWheel'));

// "Mine" was renamed to "Save" when the extension moved onto GrammarX, and the
// message builders moved into shared.js so the popup and content script format
// results identically. Same behaviour these checks always covered, new names.
check(
  'Save toast formatting',
  content.includes('formatSaveToast') && shared.includes('formatSaveResultMessage'),
);
// YouTube no longer has a toast formatter of its own; its cases (a saved video
// vs. a saved playlist) are branches inside the shared capture message builder.
check(
  'YouTube capture result messaging',
  shared.includes('formatCaptureResultMessage') &&
    shared.includes("action === 'video'") &&
    shared.includes("action === 'playlist'"),
);
check(
  'Audio record toggle (MediaRecorder or record action)',
  /MediaRecorder|jp-record|action.*record|runWheelAction.*record/.test(content),
  'need record on wheel',
);

// 4) Background save-text + clipboard
const bg = read(path.join(ext, 'background.js'));
// Formerly the 'mine-text' message — renamed with the GrammarX rework.
check('background save-text handler', bg.includes('save-text'));
check('background action-wheel command', bg.includes('action-wheel'));
check('background dictionary-popup command', bg.includes('dictionary-popup'));

// 5) Options / settings wheel customization
const settings = read(path.join(ext, 'settings.js'));
check('Wheel slot count 4|6', settings.includes('wheelSlotCount'));
check('Wheel slots configurable', settings.includes('wheelSlots'));
const options = read(path.join(ext, 'options.html'));
check('Options page has radial wheel UI', options.includes('Radial wheel') || options.includes('wheel'));
check('Options page has YouTube settings', /youtube|YouTube|Audio only/i.test(options));

// 6) Popup less clustered — has settings link
const popup = read(path.join(ext, 'popup.html'));
check('Popup links to options/settings', /options|Settings|openOptionsPage/i.test(popup + read(path.join(ext, 'popup.js'))));

// 7) Bundle sync (chrome-extension should mirror critical files when copied)
const install = read(path.join(root, 'src', 'main', 'extensionInstall.ts'));
check(
  'extensionInstall copies options/settings OR all files',
  install.includes('options.html') || install.includes('readdirSync') || install.includes('copyFileSync'),
  'may miss options.html in userData sync',
);

// 7b) Mirror parity — src/main/chrome-extension/ must be byte-identical to
// extension/, since it's the packaged-build fallback (see
// EXTENSION_AUDIT_REPORT.md ID 112). Run `node tools/sync-extension-mirror.cjs`
// if this fails.
const MIRROR_FILES = [
  'manifest.json',
  'background.js',
  'content.css',
  'content.js',
  'options.html',
  'options.js',
  'popup.html',
  'popup.js',
  'settings.js',
  'shared.js',
  'tabs.html',
  'tabs.js',
];
const driftedFiles = MIRROR_FILES.filter((name) => {
  const a = path.join(ext, name);
  const b = path.join(bundle, name);
  if (!exists(a) || !exists(b)) return true;
  return fs.readFileSync(a).compare(fs.readFileSync(b)) !== 0;
});
check(
  'chrome-extension mirror is byte-identical to extension/',
  driftedFiles.length === 0,
  driftedFiles.length ? `drifted: ${driftedFiles.join(', ')} — run node tools/sync-extension-mirror.cjs` : '',
);

// 8) App wiring markers
const app = read(path.join(root, 'src', 'renderer', 'App.tsx'));
check(
  'App.tsx uses payload.folder for extension mines',
  /folder:\s*payload\.folder|folder:\s*\(payload\.folder/.test(app) || app.includes("payload.folder"),
  'currently may hardcode Extension',
);
check(
  'App.tsx whisper/transcribe reply for extension audio',
  app.includes('transcribe-request') || app.includes('onExtensionTranscribe'),
  'audio→Whisper path needs renderer reply',
);

const extServer = read(path.join(root, 'src', 'main', 'extensionServer.ts'));
check('Bridge /v1/mine', extServer.includes("pathname === '/v1/mine'"));
check('Bridge /v1/audio/save', extServer.includes("pathname === '/v1/audio/save'"));
check('Bridge /v1/lookup', extServer.includes("pathname === '/v1/lookup'"));
check(
  'handleMine uses profile rules',
  extServer.includes('resolveProfileId') || extServer.includes('loadProfileRules'),
  'profile engine not wired into mine yet',
);

const mainTs = read(path.join(root, 'src', 'main.ts'));
check(
  'registerProfileRulesIpc called from main',
  mainTs.includes('registerProfileRulesIpc'),
  'IPC for rules not registered',
);

const failed = results.filter((r) => !r.ok);
console.log('\n---');
console.log(`Checked ${results.length}, passed ${results.length - failed.length}, failed ${failed.length}`);
process.exit(failed.length ? 1 : 0);
