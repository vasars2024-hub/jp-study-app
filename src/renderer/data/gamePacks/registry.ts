/**
 * The game packs the Arena and the engine read at run time, one per study
 * language, loaded on first use.
 *
 * The Chinese and Russian packs are ~37 KB of source each and a Japanese
 * learner never needs either; a Chinese learner never needs the Russian one.
 * They used to be one eager module (`gamePacks/index.ts`), and since the
 * finding overlays read the Arena's deck readout, Study OS booted all three.
 * Now only Japanese — the engine's default, whose tables the engine imports
 * anyway — is eager; the others are dynamic imports, fetched by `loadGamePack`
 * (the Arena awaits it before its first render and on a study-language switch).
 */
import type { StudyLang } from '../../../shared/levelScale';
import { JA_PACK } from './ja';
import type { GamePack } from './types';

/** Fired on `window` when a lazily loaded pack becomes available. */
export const GAME_PACK_LOADED_EVENT = 'game-pack-loaded';

const loaded = new Map<StudyLang, GamePack>([['ja', JA_PACK]]);
const pending = new Map<StudyLang, Promise<GamePack>>();

const LOADERS: Record<Exclude<StudyLang, 'ja'>, () => Promise<GamePack>> = {
  zh: () => import('./zh').then((m) => m.ZH_PACK),
  ru: () => import('./ru').then((m) => m.RU_PACK),
};

function emptyPack(lang: StudyLang): GamePack {
  return { lang, sentences: [], vocab: [], cloze: [], sprint: [], reading: [], particles: [], counters: [] };
}

/** Make a loaded pack available synchronously. */
function registerGamePack(pack: GamePack): void {
  if (loaded.get(pack.lang) === pack) return;
  loaded.set(pack.lang, pack);
  try {
    window.dispatchEvent(new CustomEvent(GAME_PACK_LOADED_EVENT, { detail: pack.lang }));
  } catch {
    /* no window (node tests) */
  }
}

/** The pack if it is loaded, else null. */
export function loadedGamePack(lang: StudyLang): GamePack | null {
  return loaded.get(lang) ?? null;
}

/** Load a study language's pack (once); resolves with it. */
export function loadGamePack(lang: StudyLang): Promise<GamePack> {
  const have = loaded.get(lang);
  if (have) return Promise.resolve(have);
  // Not a language with its own pack: Japanese, as `GAME_PACKS[lang] ?? JA_PACK` always did.
  if (!Object.hasOwn(LOADERS, lang)) return Promise.resolve(JA_PACK);
  let wait = pending.get(lang);
  if (!wait) {
    wait = LOADERS[lang as Exclude<StudyLang, 'ja'>]().then(
      (pack) => {
        pending.delete(lang);
        registerGamePack(pack);
        return pack;
      },
      (err: unknown) => {
        // A failed chunk fetch may succeed on the next attempt.
        pending.delete(lang);
        throw err;
      },
    );
    pending.set(lang, wait);
  }
  return wait;
}

/**
 * The bundled pack for a study language, synchronously. Not loaded yet means
 * an empty pack of that language (never another language's material), and the
 * load starts: `GAME_PACK_LOADED_EVENT` says when to read it again. The Arena
 * waits for the pack before it first renders, so this is only the moment
 * between a study-language switch and the new pack arriving.
 */
export function gamePack(lang: StudyLang): GamePack {
  const have = loaded.get(lang);
  if (have) return have;
  if (!Object.hasOwn(LOADERS, lang)) return JA_PACK;
  void loadGamePack(lang).catch((err: unknown) =>
    console.warn(`[games] could not load the ${lang} game pack:`, err instanceof Error ? err.message : String(err)),
  );
  return emptyPack(lang);
}

/** The bundled pack for a study language, extended by the player's imported items. */
export function packFor(lang: StudyLang, extra?: Partial<Omit<GamePack, 'lang'>>): GamePack {
  const base = gamePack(lang);
  if (!extra) return base;
  return {
    lang: base.lang,
    sentences: [...base.sentences, ...(extra.sentences ?? [])],
    vocab: [...base.vocab, ...(extra.vocab ?? [])],
    cloze: [...base.cloze, ...(extra.cloze ?? [])],
    sprint: [...base.sprint, ...(extra.sprint ?? [])],
    reading: [...base.reading, ...(extra.reading ?? [])],
    particles: [...base.particles, ...(extra.particles ?? [])],
    counters: [...base.counters, ...(extra.counters ?? [])],
  };
}

/** Total bundled items in a pack, for the tests that compare the languages. */
export function packSize(pack: GamePack): number {
  return (
    pack.sentences.length +
    pack.vocab.length +
    pack.cloze.length +
    pack.sprint.length +
    pack.reading.length +
    pack.particles.length +
    pack.counters.length
  );
}
