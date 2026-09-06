const MOONCAP_MUSIC_STORAGE_KEY = "jp-mooncap-music-v1";

export interface MooncapMusicSettings {
  enabled: boolean;
  /** 0–1 linear gain. */
  volume: number;
}

// Off by default, deliberately. The garden's ONE primary action — the mushroom
// hitbox — is also the only route to the dossier that holds this switch, so with
// `enabled: true` the first click both started the track and was the user's first
// sight of the control that could stop it. There is no way to decline a sound you
// have not been told about, and this app talks over its own video player. The
// stored boolean still wins, so anyone who has turned music on keeps it: only a
// profile that has never written `jp-mooncap-music-v1` reads this default at all.
const DEFAULT_SETTINGS: MooncapMusicSettings = {
  enabled: false,
  volume: 0.35,
};

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.volume;
  return Math.min(1, Math.max(0, value));
}

export function loadMooncapMusicSettings(
  storage: Pick<Storage, "getItem"> = localStorage,
): MooncapMusicSettings {
  try {
    const parsed = JSON.parse(
      storage.getItem(MOONCAP_MUSIC_STORAGE_KEY) || "null",
    ) as Partial<MooncapMusicSettings> | null;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_SETTINGS };
    return {
      enabled:
        typeof parsed.enabled === "boolean"
          ? parsed.enabled
          : DEFAULT_SETTINGS.enabled,
      volume:
        typeof parsed.volume === "number"
          ? clampVolume(parsed.volume)
          : DEFAULT_SETTINGS.volume,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveMooncapMusicSettings(
  settings: MooncapMusicSettings,
  storage: Pick<Storage, "setItem"> = localStorage,
): MooncapMusicSettings {
  const next: MooncapMusicSettings = {
    enabled: settings.enabled,
    volume: clampVolume(settings.volume),
  };
  storage.setItem(MOONCAP_MUSIC_STORAGE_KEY, JSON.stringify(next));
  return next;
}

/**
 * Singleton garden bed for the Mooncap ambient track. Kept outside React so the
 * loop survives dossier open/close and only tears down when the garden unmounts.
 */
class MooncapMusicPlayer {
  private audio: HTMLAudioElement | null = null;
  private sourceUrl: string | null = null;
  private settings: MooncapMusicSettings = loadMooncapMusicSettings();
  private unlocked = false;

  configure(sourceUrl: string) {
    this.sourceUrl = sourceUrl;
    if (!this.audio) {
      const audio = new Audio();
      audio.loop = true;
      audio.preload = "auto";
      audio.volume = this.settings.volume;
      this.audio = audio;
    }
    if (this.audio.src !== sourceUrl) {
      this.audio.src = sourceUrl;
    }
    this.apply();
  }

  getSettings(): MooncapMusicSettings {
    return { ...this.settings };
  }

  setEnabled(enabled: boolean): MooncapMusicSettings {
    this.unlocked = true;
    this.settings = saveMooncapMusicSettings({
      ...this.settings,
      enabled,
    });
    this.apply();
    return this.getSettings();
  }

  setVolume(volume: number): MooncapMusicSettings {
    this.unlocked = true;
    this.settings = saveMooncapMusicSettings({
      ...this.settings,
      volume: clampVolume(volume),
    });
    this.apply();
    return this.getSettings();
  }

  /** Call from a user gesture (mushroom click) so autoplay can start. */
  unlockFromGesture() {
    this.unlocked = true;
    this.apply();
  }

  dispose() {
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      this.audio = null;
    }
    this.sourceUrl = null;
    // The gesture gate has to close with the audio. This singleton outlives the
    // component, so leaving `unlocked` true meant the NEXT `configure()` — i.e.
    // merely reopening the City window — fell through `apply()` to `play()` with
    // no gesture at all. Measured: reopened with zero clicks, `paused` false at
    // `currentTime` 1.62. Autoplay is a per-visit permission, not a session one.
    this.unlocked = false;
  }

  private apply() {
    const audio = this.audio;
    if (!audio || !this.sourceUrl) return;
    audio.volume = this.settings.volume;
    if (!this.settings.enabled || this.settings.volume <= 0.001) {
      audio.pause();
      return;
    }
    if (!this.unlocked) return;
    const playResult = audio.play();
    if (playResult && typeof playResult.catch === "function") {
      playResult.catch(() => {
        // Autoplay can still be blocked until the next gesture.
      });
    }
  }
}

export const mooncapMusicPlayer = new MooncapMusicPlayer();
