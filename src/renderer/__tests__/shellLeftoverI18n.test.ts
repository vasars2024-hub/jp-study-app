// @vitest-environment jsdom
/**
 * Shell text that stayed English in every language (audit 2026-09-24): atmosphere
 * scene and particle names, the built-in day-cycle wallpaper slots, the generic
 * companion names. Each is module-level data, so each now resolves by id at
 * render; these pin that every one has a real translation, and that a slot or
 * playlist the user renamed is left as typed.
 */
import { describe, expect, it } from 'vitest';
import { CATALOGS } from '../../shared/i18n/catalogs/all';
import { UI_LANGS } from '../../shared/i18n/core';
import { ENVIRONMENT_PRESETS } from '../environment/environmentPresets';
import { PARTICLE_PRESETS } from '../environment/particleEngine';
import {
  buildDefaultDayCyclePlaylist,
  seedPlaylistNameKey,
  seedWallpaperLabelKey,
} from '../environment/types';
import { COMPANION_DEFS, localizedCompanionDef } from '../environment/companionCatalog';

function translatedEverywhere(key: string): void {
  for (const lang of UI_LANGS) {
    const value = CATALOGS[lang][key];
    expect(value, `${lang} ${key}`).toBeTruthy();
    if (lang !== 'en') expect(value, `${lang} ${key} is English`).not.toBe(CATALOGS.en[key]);
  }
}

describe('shell leftovers are translated', () => {
  it('atmosphere scenes and particles', () => {
    for (const scene of ENVIRONMENT_PRESETS) {
      translatedEverywhere(`settings.atmosphere.scene.${scene.id}.name`);
      translatedEverywhere(`settings.atmosphere.scene.${scene.id}.desc`);
    }
    for (const particle of PARTICLE_PRESETS) translatedEverywhere(`settings.atmosphere.particle.${particle.id}`);
  });

  it('day-cycle wallpaper slots, but never a slot the user renamed', () => {
    const playlist = buildDefaultDayCyclePlaylist();
    const nameKey = seedPlaylistNameKey(playlist);
    expect(nameKey).toBeTruthy();
    translatedEverywhere(nameKey as string);
    for (const item of playlist.items) {
      const key = seedWallpaperLabelKey(item);
      expect(key, item.id).toBeTruthy();
      translatedEverywhere(key as string);
    }
    expect(seedWallpaperLabelKey({ ...playlist.items[0], label: 'My sunrise' })).toBeNull();
    expect(seedPlaylistNameKey({ ...playlist, name: 'Mine' })).toBeNull();
  });

  it('generic companion names and every blurb; proper names stay', () => {
    const ru = (key: string) => String(CATALOGS.ru[key] ?? key);
    for (const def of COMPANION_DEFS()) {
      const local = localizedCompanionDef(def, ru);
      expect(local.blurb, def.id).not.toBe(def.blurb);
      if (def.secret) expect(local.label, def.id).toBe(def.label);
      else expect(local.label, def.id).not.toBe(def.label);
    }
  });
});
