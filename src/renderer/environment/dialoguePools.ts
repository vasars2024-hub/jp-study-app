/**
 * Personality-seeded dialogue pools + context hooks for companion beep speech.
 * Study content is never translated here — these are chrome lines.
 */
import type { CompanionTypeId } from './companionCatalog';

export type DialogueContext =
  | 'idle'
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'music'
  | 'study'
  | 'flashcard'
  | 'levelUp'
  | 'click';

const POOLS: Record<CompanionTypeId, Partial<Record<DialogueContext, string[]>>> = {
  'study-buddy': {
    idle: ['Ready when you are.', 'Shall we review?', 'I brought flashcards.'],
    morning: ['Good morning — warm-up cards?', 'Sunlight and kanji.'],
    afternoon: ['Afternoon focus!', 'One more page?'],
    evening: ['Evening review time.', 'Wind down with a deck.'],
    night: ['Late session? I am with you.', 'Quiet study hours.'],
    music: ['Nice beat for vocab.', 'I can keep rhythm.'],
    study: ['Nice reading streak.', 'That sentence was solid.'],
    flashcard: ['Card cleared!', 'Keep going.'],
    levelUp: ['Level up! You earned that.', 'Stronger every day.'],
    click: ['Hi!', 'Let’s study.', 'Tap me anytime.'],
  },
  critter: {
    idle: ['Sniff sniff…', 'What’s over there?', 'Boop.'],
    morning: ['Morning stretch!', 'Floor feels warm.'],
    night: ['Curling up…', 'Zzz… almost.'],
    music: ['Dance paws!', 'Wiggle wiggle.'],
    study: ['You read; I explore.', 'Found a dust bunny.'],
    levelUp: ['You leveled! Bounce!', 'Sparkles!'],
    click: ['Hey!', 'Pet? Okay.', 'Boop.'],
  },
  timekeeper: {
    idle: ['Tick.', 'Still on schedule.', 'Watching the clock.'],
    morning: ['Good morning.', 'Day watch begins.'],
    afternoon: ['Midday check.', 'Hours are steady.'],
    evening: ['Evening hours.', 'Wind the dial.'],
    night: ['Night watch.', 'Stars keep time too.'],
    music: ['Tempo noted.', 'In time.'],
    study: ['Logged.', 'Progress stamped.'],
    levelUp: ['Milestone clocked.', 'Level advanced.'],
    click: ['Yes?', 'On the hour.', 'Listening.'],
  },
  noctis: {
    idle: ['Listening for light…', 'The canopy hums.', 'Crystal steady.'],
    morning: ['Dawn under the canopy.', 'Soft light rising.'],
    night: ['Night ecology awake.', 'City lights below.'],
    music: ['Resonating.', 'Signal in the song.'],
    study: ['Growth from study.', 'Crystal warmed.'],
    flashcard: ['Another facet.', 'Bright.'],
    levelUp: ['The city brightens.', 'You climbed a tier.'],
    click: ['…yes.', 'I hear you.', 'Speak softly.'],
  },
  'miko-shimeji': {
    idle: ['Still climbing.', 'Wall or ceiling?', 'Hmm.'],
    morning: ['Morning climb!', 'Up we go.'],
    music: ['Climb to the beat.', 'Higher!'],
    study: ['You study; I scale.', 'Frame feels sturdy.'],
    levelUp: ['Secret strength!', 'You leveled — celebrate.'],
    click: ['Yes?', 'Climb show?', 'Hehe.'],
  },
  'wired-navi': {
    idle: ['Signal acquired.', 'Channel open.', '…'],
    morning: ['Boot sequence… morning.', 'Link online.'],
    night: ['Night band clear.', 'Low power mode?'],
    music: ['Audio channel locked.', 'Waveform pretty.'],
    study: ['Data ingested.', 'Knowledge uplink.'],
    levelUp: ['Level packet received.', 'Upgrade complete.'],
    click: ['Ready.', 'Command?', 'Ping.'],
  },
};

function hourContext(h = new Date().getHours()): DialogueContext {
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

function pick(list: string[] | undefined, seed: string): string | null {
  if (!list?.length) return null;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return list[(h >>> 0) % list.length] ?? list[0] ?? null;
}

/** Personality-seeded line for a companion + context. */
export function pickDialogueLine(
  typeId: CompanionTypeId,
  context: DialogueContext | 'auto',
  seedExtra = '',
): string | null {
  const ctx = context === 'auto' ? hourContext() : context;
  const pool = POOLS[typeId];
  const primary = pool?.[ctx];
  const line = pick(primary, `${typeId}:${ctx}:${seedExtra}:${Math.floor(Date.now() / 60_000)}`);
  if (line) return line;
  return pick(pool?.idle, `${typeId}:idle:${seedExtra}`);
}

export function dialogueContextFromHour(h?: number): DialogueContext {
  return hourContext(h);
}
