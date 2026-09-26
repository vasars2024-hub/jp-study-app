/**
 * jp-study-app: hand SubRip content to the sidecar as WebVTT.
 *
 * The pinned sidecar's `POST /api/v1/directstream/subs/convert-subs` cannot detect SRT at all:
 * measured 2026-09-23 against the bundled seanime.exe, a plain ASCII SRT, a Japanese SRT, LF or
 * CRLF, with or without `url`, all answer 500 "failed to detect subtitle format from content",
 * while the same cues as WebVTT or ASS convert fine. Seanime itself finds the `.srt` beside a
 * local file and pushes it as an external track, so every SRT sidecar in the media workspace
 * failed to convert — and the study overlay then saw "a track already exists" and did not mount
 * its own copy either, leaving the player with no subtitles for any container.
 *
 * SRT and WebVTT differ only in the header and the millisecond separator on timing lines, so the
 * conversion is exact. Content that is not SRT (VTT, ASS, SSA, empty) is returned untouched.
 */

const BOM = String.fromCharCode(0xfeff)
const SRT_TIMING = /^\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/m
const SRT_TIMESTAMP = /(\d{1,2}:\d{2}:\d{2}),(\d{1,3})/g

function stripBom(text: string): string {
    return text.startsWith(BOM) ? text.slice(1) : text
}

export function looksLikeSrt(content: string | undefined | null): boolean {
    if (!content) return false
    const text = stripBom(content).trimStart()
    if (/^WEBVTT/.test(text) || /^\[Script Info\]/i.test(text)) return false
    return SRT_TIMING.test(text)
}

export function srtToWebVtt(content: string | undefined | null): string | undefined {
    if (content == null) return undefined
    if (!looksLikeSrt(content)) return content
    const lines = stripBom(content).replace(/\r\n?/g, "\n").split("\n")
    // Only timing lines change: a time written inside the cue text keeps its comma.
    const body = lines
        .map((line) => (line.includes("-->") ? line.replace(SRT_TIMESTAMP, "$1.$2") : line))
        .join("\n")
        .trim()
    return `WEBVTT\n\n${body}\n`
}

export type ConvertSubsVariables = { url: string, content: string, to: "vtt" | "ass" }

/** The one part of the convert-subs mutation this needs: its promise form. */
export type ConvertSubsMutation = {
    mutateAsync: (variables: ConvertSubsVariables) => Promise<string | undefined>
}

/**
 * jp-study-app: the `fetchAndConvertTo…` callback both subtitle managers are built with.
 *
 * It used to be `new Promise` around `mutate(variables, { onSuccess: resolve, onError: reject })`.
 * TanStack Query runs the callbacks passed to `mutate` for the LATEST call only: a second
 * `mutate` on the same observer detaches the first mutation, so the first promise never settled.
 * Two conversions overlap whenever a sidecar pair opens with its preference already known — the
 * manager's own default pick (the Japanese track) and the study overlay's second line (the
 * English one) ask within the same tick — which is every reopen of a file. The stranded load
 * stayed pending in `MediaCaptionsManager.trackLoads` for the rest of the session, so choosing
 * that track again never finished: no `trackselected`, and the study line and the transcript
 * kept the previous track (subtitle audit 7). `mutateAsync` returns each call's own promise.
 */
export function subtitleConverter(mutation: ConvertSubsMutation, to: "vtt" | "ass") {
    return (url?: string, content?: string): Promise<string | undefined> =>
        mutation.mutateAsync({ url: url ?? "", content: srtToWebVtt(content) ?? "", to })
}
