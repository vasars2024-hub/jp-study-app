export type ShimejiMotion = 'stand' | 'walk' | 'sit' | 'wall' | 'ceiling' | 'fall' | 'drag' | 'celebrate';

export type ShimejiPackId =
  | 'bonzi-buddy'
  | 'ene'
  | 'fateburn'
  | 'konoha'
  | 'maka'
  | 'remilia'
  | 'tamamo';

type ShimejiPack = Record<ShimejiMotion, string[]>;
type GlobEntries = [string, string][];

const STANDARD_SEQUENCES: Record<ShimejiMotion, string[]> = {
  stand: ['shime1.png'],
  walk: ['shime1.png', 'shime2.png', 'shime1.png', 'shime3.png'],
  sit: ['shime11.png', 'shime26.png'],
  wall: ['shime14.png', 'shime12.png', 'shime13.png', 'shime13.png', 'shime12.png', 'shime14.png'],
  ceiling: ['shime25.png', 'shime23.png', 'shime24.png', 'shime24.png', 'shime23.png', 'shime25.png'],
  fall: ['shime4.png'],
  drag: ['shime7.png', 'shime8.png', 'shime9.png', 'shime10.png'],
  celebrate: ['shime5.png', 'shime6.png', 'shime5.png', 'shime6.png', 'shime1.png'],
};

const TAMAMO_SEQUENCES: Record<ShimejiMotion, string[]> = {
  stand: ['shime1.png', 'shime1b.png', 'shime1c.png', 'shime1b.png', 'shime1a.png', 'shime1.png'],
  walk: ['shime1.png', 'shime2.png', 'shime1.png', 'shime3.png', 'shime1a.png', 'shime2.png'],
  sit: ['shime11.png', 'shime11a.png', 'shime11.png', 'shime11b.png', 'shime11c.png'],
  wall: STANDARD_SEQUENCES.wall,
  ceiling: STANDARD_SEQUENCES.ceiling,
  fall: STANDARD_SEQUENCES.fall,
  drag: ['shime7.png', 'shime8.png', 'shime9.png', 'shime10.png'],
  celebrate: ['resisting1.png', 'resisting2.png', 'resisting3.png', 'resisting4.png', 'resisting5.png'],
};

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function makeLookup(entries: GlobEntries): Map<string, string> {
  const map = new Map<string, string>();
  for (const [path, url] of entries) {
    map.set(basename(path).toLowerCase(), url);
  }
  return map;
}

function pick(lookup: Map<string, string>, names: string[], fallbackNames = STANDARD_SEQUENCES.stand): string[] {
  const frames = names
    .map((name) => lookup.get(name.toLowerCase()))
    .filter((url): url is string => typeof url === 'string');
  if (frames.length) return frames;
  return fallbackNames
    .map((name) => lookup.get(name.toLowerCase()))
    .filter((url): url is string => typeof url === 'string');
}

function buildPack(entries: GlobEntries, sequences: Record<ShimejiMotion, string[]> = STANDARD_SEQUENCES): ShimejiPack {
  const lookup = makeLookup(entries);
  const stand = pick(lookup, sequences.stand);
  const pack = {} as ShimejiPack;
  for (const motion of Object.keys(STANDARD_SEQUENCES) as ShimejiMotion[]) {
    pack[motion] = pick(lookup, sequences[motion]);
    if (!pack[motion].length) pack[motion] = stand;
  }
  return pack;
}

const PACKS: Record<ShimejiPackId, ShimejiPack> = {
  'bonzi-buddy': buildPack(
    Object.entries(import.meta.glob('../assets/shimeji/bonzi/*.png', { eager: true, import: 'default' })) as GlobEntries,
  ),
  ene: buildPack(
    Object.entries(import.meta.glob('../assets/shimeji/ene/*.png', { eager: true, import: 'default' })) as GlobEntries,
  ),
  fateburn: buildPack(
    Object.entries(import.meta.glob('../assets/shimeji/fateburn/*.png', { eager: true, import: 'default' })) as GlobEntries,
  ),
  konoha: buildPack(
    Object.entries(import.meta.glob('../assets/shimeji/konoha/*.png', { eager: true, import: 'default' })) as GlobEntries,
  ),
  maka: buildPack(
    Object.entries(import.meta.glob('../assets/shimeji/maka/*.png', { eager: true, import: 'default' })) as GlobEntries,
  ),
  remilia: buildPack(
    Object.entries(import.meta.glob('../assets/shimeji/remilia/*.png', { eager: true, import: 'default' })) as GlobEntries,
  ),
  tamamo: buildPack(
    Object.entries(import.meta.glob('../assets/shimeji/tamamo/*.png', { eager: true, import: 'default' })) as GlobEntries,
    TAMAMO_SEQUENCES,
  ),
};

export function getShimejiPack(packId?: ShimejiPackId): ShimejiPack | null {
  if (!packId) return null;
  return PACKS[packId] ?? null;
}
