const fs = require('fs');
const file = 'src/renderer/theme/aeroIconPack.ts';
let content = fs.readFileSync(file, 'utf8');
const nl = content.includes('\r\n') ? '\r\n' : '\n';

const start = content.indexOf('const FAMILIES');
const endMarker = '};' + nl + nl + '/** Shorthand for an application plate. */';
const end = content.indexOf(endMarker);
if (start < 0 || end < 0) { console.error('markers not found', start, end); process.exit(1); }

const block = [
  'const FAMILIES: IconPack[\'families\'] = {',
  '  /** Playback, video, music. Warm rose. */',
  '  media: { top: \'#e0738f\', bottom: \'#a8113d\', edge: \'#6d0c27\', accent: \'#f2cdd8\' },',
  '  /** Dictionary, grammar, translation. Aqua-teal — the Aero house colour. */',
  '  language: { top: \'#56bdb0\', bottom: \'#0d7a73\', edge: \'#04443f\', accent: \'#c8ebe5\' },',
  '  /** Reading and immersion. Deep glass blue. */',
  '  reading: { top: \'#6aa9de\', bottom: \'#17549f\', edge: \'#0b3568\', accent: \'#cfdff0\' },',
  '  /** Cards and review. Warm amber plastic. */',
  '  cards: { top: \'#e0a668\', bottom: \'#b4521e\', edge: \'#71300e\', accent: \'#f0d9bd\' },',
  '  /** Progress, planning, resources. Fresh green. */',
  '  study: { top: \'#9cc873\', bottom: \'#3a7c2d\', edge: \'#1f4d18\', accent: \'#d6eecb\' },',
  '  /** Settings, shell utilities, the desktop itself. Brushed steel. */',
  '  system: { top: \'#a6bdcd\', bottom: \'#445f71\', edge: \'#22323d\', accent: \'#dde9f0\' },',
  '  /** Games and delight. Violet. */',
  '  play: { top: \'#a98ede\', bottom: \'#5b37a3\', edge: \'#331b63\', accent: \'#dcd0f0\' },',
  '  /** Folders and containers. Manila. */',
  '  manila: { top: \'#e3c582\', bottom: \'#c08b24\', edge: \'#6f5010\', accent: \'#f0e6c8\' },',
  '  // Paper is the one family whose body is too light for white detail, so it',
  '  // overrides `detail` with a slate ink instead.',
  '  /** Documents. Paper white with a cool edge. */',
  '  paper: {',
  '    top: \'#edf1f4\',',
  '    bottom: \'#c0d0db\',',
  '    edge: \'#3d5665\',',
  '    accent: \'#82a2b5\',',
  '    detail: \'#3a566b\',',
  '  },',
  '  /** Informational status. */',
  '  info: { top: \'#6aa9de\', bottom: \'#1b5da6\', edge: \'#0b3568\', accent: \'#d2e2f0\' },',
  '  /** Caution status. */',
  '  alert: { top: \'#e3bc54\', bottom: \'#bd7509\', edge: \'#6d4200\', accent: \'#f0e4c2\' },',
  '  /** Failure status. */',
  '  danger: { top: \'#dd7969\', bottom: \'#a82312\', edge: \'#611006\', accent: \'#f0cdc6\' },',
  '  /** Success status. */',
  '  ok: { top: \'#8bcb6f\', bottom: \'#2c8438\', edge: \'#14501e\', accent: \'#d4eec9\' },',
  '  /** Sleep and night. */',
  '  night: { top: \'#8ba1dd\', bottom: \'#2c3985\', edge: \'#141c50\', accent: \'#d1d9f0\' },',
  '  /** The Secret OS emblem: glass leaf, aqua to leaf-green. */',
  '  leaf: { top: \'#9ed163\', bottom: \'#0e9b8f\', edge: \'#0a5a52\', accent: \'#e2f0d2\' },',
  '};',
  '',
  '/** Shorthand for an application plate. */',
].join(nl);

content = content.slice(0, start) + block + content.slice(end + endMarker.length);
fs.writeFileSync(file, content);
console.log('done');
