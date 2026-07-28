/**
 * STUDY OS SUBSTITUTION — replaces seanime-web's `app/(main)/_features/mpv-core/mpv-core.atoms.ts`.
 *
 * The ONLY change is the removal of `import type { MpvPrismTrack } from "@mpv-prism/core"`,
 * replaced by the structural interface below. Every other line is byte-identical to the
 * pinned checkout (9bdd052).
 *
 * Why: `@mpv-prism/core` is the one dependency of the entry closure that ADR-002 defers, and
 * the risk register carries it as "licence unknown — don't ship it". Two things are now known:
 *
 *   1. It is LGPL-3.0 (`node_modules/@mpv-prism/core/LICENSE` in the pinned checkout), which
 *      is compatible with the GPL-3.0 this repo took on under ADR-001. The licence is no
 *      longer unknown — but ADR-002 still defers the *feature*, so it stays out.
 *   2. It is not a registry package. Upstream's package.json pins it to a tarball URL on
 *      seanime.app (`.../mpv-prism/0.1.8/...tgz?sha256=...`), so adopting it would add an
 *      out-of-registry supply-chain dependency for an alternative player we do not use.
 *
 * The import was type-only and `MpvPrismTrack` is referenced exactly once in this file
 * (`atom<MpvPrismTrack[]>([])`). Nothing else in the adopted tree reaches mpv-prism — the
 * other three importers (`mpv-core.tsx`, `mpv-core-player-inner.tsx`, `mpv-core-stats.tsx`)
 * are NOT in the entry closure.
 *
 * CORRECTION for the next sync: ADOPTION.md previously recorded `mpv-core.tsx` as the
 * reachable importer and proposed stubbing it. That was wrong. Measured in Phase 3, the
 * reachable file is this one, reached via
 * `entry/page.tsx → entry/_containers/torrent-stream/playback-play-pill.tsx`.
 * Stubbing `mpv-core.tsx` would have removed nothing.
 *
 * Whole-file replacement, not an edit — see `vendor/seanime-web/ADOPTION.md`.
 */

/**
 * Structural stand-in for `MpvPrismTrack`, copied verbatim from `@mpv-prism/core`'s
 * `dist/types.d.ts` at 0.1.8.
 */
export interface MpvPrismTrack {
    id?: number | string
    type?: string
    title?: string
    lang?: string
    selected?: boolean
    external?: boolean
    [key: string]: unknown
}

import type { Player_PlaybackInfo, Player_SkipData } from "@/api/generated/types"
import { mediaCorePreferencesAtom } from "@/app/(main)/_features/media-core/media-core-preferences"
import { vc_defaultKeybindings, vc_highlightOPEDChaptersAtom, type VideoCoreKeybindings } from "@/app/(main)/_features/video-core/video-core.atoms"
import { atom } from "jotai"
import { atomWithImmer } from "jotai-immer"
import { atomWithStorage } from "jotai/utils"

export type MpvCoreState = {
    active: boolean
    playbackInfo: Player_PlaybackInfo | null
    playbackError: string | null
    loadingState: string | null
    miniPlayer: boolean
}

export const mpvCore_initialState: MpvCoreState = {
    active: false,
    playbackInfo: null,
    playbackError: null,
    loadingState: null,
    miniPlayer: false,
}

export const mpvCore_stateAtom = atomWithImmer<MpvCoreState>(mpvCore_initialState)

// Video state atoms
export const mc_paused = atom(true)
export const mc_currentTime = atom(0)
export const mc_duration = atom(0)
export const mc_buffered = atom(0)
export const mc_buffering = atom(false)
export const mc_tracks = atom<MpvPrismTrack[]>([])
export const mc_skipData = atom<Player_SkipData | null>(null)
export type MpvCoreOverlayFeedback = { message: string, type: "message" | "time" | "icon" }
export const mc_overlayFeedback = atom<MpvCoreOverlayFeedback | null>(null)
export const mc_isFullscreen = atom(false)
export const mc_isPip = atom(false)

export type MpvCoreKeybindings = VideoCoreKeybindings
export const mc_defaultKeybindings = vc_defaultKeybindings

const mc_keybindingsRaw = atomWithStorage<Partial<MpvCoreKeybindings>>(
    "sea-video-core-keybindings",
    mc_defaultKeybindings,
    undefined,
    { getOnInit: true },
)

export const mc_keybindingsAtom = atom(
    get => ({ ...mc_defaultKeybindings, ...get(mc_keybindingsRaw) } as MpvCoreKeybindings),
    (_get, set, update: MpvCoreKeybindings) => set(mc_keybindingsRaw, update),
)

export const mc_highlightOPEDChapters = vc_highlightOPEDChaptersAtom

export interface MpvCoreSubtitleCustomization {
    enabled: boolean
    fontName: string
    fontSize: number
    primaryColor: string
    outlineColor: string
    backColor: string
    backColorOpacity: number
    outline: number
    shadow: number
}

export interface MpvCoreSettings {
    preferredSubtitleLanguage: string
    preferredSubtitleBlacklist: string
    preferredAudioLanguage: string
    subtitleDelay: number
    subtitleCustomization: MpvCoreSubtitleCustomization
    customMpvConfig: string
    deband: boolean
}

export const mc_initialSettings: MpvCoreSettings = {
    preferredSubtitleLanguage: "en,eng,english",
    preferredSubtitleBlacklist: "",
    preferredAudioLanguage: "jpn,jp,jap,japanese",
    subtitleDelay: 0,
    subtitleCustomization: {
        enabled: false,
        fontName: "",
        fontSize: 38,
        primaryColor: "#FFFFFF",
        outlineColor: "#000000",
        backColor: "#000000",
        backColorOpacity: 0.8,
        outline: 3,
        shadow: 0,
    },
    customMpvConfig: "",
    deband: false,
}

const mc_settingsRaw = atomWithStorage<Partial<MpvCoreSettings>>(
    "sea-mpv-core-settings-v2",
    mc_initialSettings,
    undefined,
    { getOnInit: true },
)

export const mc_settings = atom(
    get => {
        const stored = get(mc_settingsRaw)
        return {
            ...mc_initialSettings,
            ...stored,
            subtitleCustomization: {
                ...mc_initialSettings.subtitleCustomization,
                ...(stored.subtitleCustomization ?? {}),
            },
        } as MpvCoreSettings
    },
    (get, set, update: MpvCoreSettings | ((current: MpvCoreSettings) => MpvCoreSettings)) => {
        const stored = get(mc_settingsRaw)
        const current = {
            ...mc_initialSettings,
            ...stored,
            subtitleCustomization: {
                ...mc_initialSettings.subtitleCustomization,
                ...(stored.subtitleCustomization ?? {}),
            },
        } as MpvCoreSettings
        set(mc_settingsRaw, typeof update === "function" ? update(current) : update)
    },
)

export type MpvCoreShaderMode = "off" | "anime4k" | "custom"
export type MpvCoreAnime4KQuality = "fast" | "hq"

export interface MpvCoreShaderSettings {
    directory: string;
    mode: MpvCoreShaderMode;
    anime4kMode: string;
    anime4kQuality: MpvCoreAnime4KQuality;
    customShaders: string[];
}

const mc_shaderSettingsRaw = atomWithStorage<Partial<MpvCoreShaderSettings>>(
    "sea-mpv-core-shaders-v2",
    {},
    undefined,
    { getOnInit: true },
)

export const mc_shaderSettings = atom(
    get => {
        const stored = get(mc_shaderSettingsRaw)
        return {
            directory: "",
            mode: "off",
            anime4kMode: "mode-a",
            anime4kQuality: "fast",
            customShaders: [],
            ...stored,
        } as MpvCoreShaderSettings
    },
    (get, set, update: MpvCoreShaderSettings | ((current: MpvCoreShaderSettings) => MpvCoreShaderSettings)) => {
        const current = get(mc_shaderSettingsRaw)
        const currentFull = {
            directory: "",
            mode: "off",
            anime4kMode: "mode-a",
            anime4kQuality: "fast",
            customShaders: [],
            ...current,
        } as MpvCoreShaderSettings
        set(mc_shaderSettingsRaw, typeof update === "function" ? update(currentFull) : update)
    },
)

// Proxy configuration atoms pointing to mediaCorePreferencesAtom
export const mc_storedVolume = atom(
    (get) => get(mediaCorePreferencesAtom).volume,
    (get, set, newValue: number | ((prev: number) => number)) => {
        const current = get(mediaCorePreferencesAtom)
        const next = typeof newValue === "function" ? newValue(current.volume) : newValue
        set(mediaCorePreferencesAtom, { ...current, volume: next })
    }
)
export const mc_storedMuted = atom(
    (get) => get(mediaCorePreferencesAtom).muted,
    (get, set, newValue: boolean | ((prev: boolean) => boolean)) => {
        const current = get(mediaCorePreferencesAtom)
        const next = typeof newValue === "function" ? newValue(current.muted) : newValue
        set(mediaCorePreferencesAtom, { ...current, muted: next })
    }
)
export const mc_storedSpeed = atom(
    (get) => get(mediaCorePreferencesAtom).playbackRate,
    (get, set, newValue: number | ((prev: number) => number)) => {
        const current = get(mediaCorePreferencesAtom)
        const next = typeof newValue === "function" ? newValue(current.playbackRate) : newValue
        set(mediaCorePreferencesAtom, { ...current, playbackRate: next })
    }
)

export const mc_autoPlay = atom(
    (get) => get(mediaCorePreferencesAtom).autoPlay,
    (get, set, newValue: boolean | ((prev: boolean) => boolean)) => {
        const current = get(mediaCorePreferencesAtom)
        const next = typeof newValue === "function" ? newValue(current.autoPlay) : newValue
        set(mediaCorePreferencesAtom, { ...current, autoPlay: next })
    }
)
export const mc_autoNext = atom(
    (get) => get(mediaCorePreferencesAtom).autoNext,
    (get, set, newValue: boolean | ((prev: boolean) => boolean)) => {
        const current = get(mediaCorePreferencesAtom)
        const next = typeof newValue === "function" ? newValue(current.autoNext) : newValue
        set(mediaCorePreferencesAtom, { ...current, autoNext: next })
    }
)
export const mc_autoSkip = atom(
    (get) => get(mediaCorePreferencesAtom).autoSkip,
    (get, set, newValue: boolean | ((prev: boolean) => boolean)) => {
        const current = get(mediaCorePreferencesAtom)
        const next = typeof newValue === "function" ? newValue(current.autoSkip) : newValue
        set(mediaCorePreferencesAtom, { ...current, autoSkip: next })
    }
)
export const mc_showChapterMarkers = atom(
    (get) => get(mediaCorePreferencesAtom).chapterMarkers,
    (get, set, newValue: boolean | ((prev: boolean) => boolean)) => {
        const current = get(mediaCorePreferencesAtom)
        const next = typeof newValue === "function" ? newValue(current.chapterMarkers) : newValue
        set(mediaCorePreferencesAtom, { ...current, chapterMarkers: next })
    }
)
export const mc_showStats = atom(
    (get) => get(mediaCorePreferencesAtom).showStats,
    (get, set, newValue: boolean | ((prev: boolean) => boolean)) => {
        const current = get(mediaCorePreferencesAtom)
        const next = typeof newValue === "function" ? newValue(current.showStats) : newValue
        set(mediaCorePreferencesAtom, { ...current, showStats: next })
    }
)

export const mc_cacheState = atom<any>(null)
export const mc_frameDrops = atom<Record<string, number>>({})

export const mc_screenshotPromptOpenAtom = atom(false)
export const mc_pendingScreenshotAtom = atom<{ base64Data: string } | null>(null)
