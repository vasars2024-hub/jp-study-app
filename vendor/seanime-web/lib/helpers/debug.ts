import chalk from "chalk"
import React from "react"

// Gum: what reaches `console.log` stays alive. Chromium keeps every console message with live
// references to its arguments (up to 1,000 of them) so DevTools can show them when it is opened
// later. The player logs its <video>, the element's TextTrackList, its managers and whole
// playback-info objects, so a closed player stayed reachable from the console store: on the
// packaged build (2026-09-26) the heap-snapshot retainer of a closed player's <video> was
// `(Global handles) / DevTools console -> TextTrackList -> <video>`. Outside development the
// logger now hands the console a bounded text rendering of each argument instead.
const LOG_LIVE_OBJECTS = import.meta.env?.MODE === "development"
const LOG_MAX_KEYS = 12
const LOG_MAX_ITEMS = 10
const LOG_MAX_STRING = 200
const LOG_MAX_TOTAL = 1_000

function logClip(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max)}…` : text
}

function logNodeLabel(node: Node): string {
    if (typeof Element !== "undefined" && node instanceof Element) {
        const id = node.id ? `#${node.id}` : ""
        const cls = typeof node.className === "string" && node.className.trim()
            ? `.${node.className.trim().split(/\s+/).slice(0, 3).join(".")}`
            : ""
        return `<${node.tagName.toLowerCase()}${id}${cls}>`
    }
    return `[${node.nodeName}]`
}

function logRender(value: unknown, depth: number, seen: Set<object>): string {
    if (value === null) return "null"
    const kind = typeof value
    if (kind === "string") return JSON.stringify(logClip(value as string, LOG_MAX_STRING))
    if (kind === "number" || kind === "boolean" || kind === "undefined") return String(value)
    if (kind === "bigint") return `${String(value)}n`
    if (kind === "symbol") return String(value)
    if (kind === "function") return `[function ${(value as { name?: string }).name || "anonymous"}]`
    const obj = value as object
    if (typeof Node !== "undefined" && obj instanceof Node) return logNodeLabel(obj)
    if (obj instanceof Error) return `${obj.name}: ${obj.message}`
    if (obj instanceof Date) return Number.isNaN(obj.getTime()) ? "Invalid Date" : obj.toISOString()
    const tag = Object.prototype.toString.call(obj).slice(8, -1)
    // Browser objects (TextTrackList, MediaSource, EventTarget subclasses...) by name only:
    // their fields are getters over native state, and reading them is not free.
    if (typeof EventTarget !== "undefined" && obj instanceof EventTarget) return `[${obj.constructor?.name || tag}]`
    if (seen.has(obj)) return "[circular]"
    if (depth >= 2) return Array.isArray(obj) ? `[Array(${obj.length})]` : `[${obj.constructor?.name || tag}]`
    seen.add(obj)
    try {
        if (Array.isArray(obj)) {
            const items = obj.slice(0, LOG_MAX_ITEMS).map(item => logRender(item, depth + 1, seen))
            if (obj.length > LOG_MAX_ITEMS) items.push(`…${obj.length - LOG_MAX_ITEMS} more`)
            return `[${items.join(", ")}]`
        }
        if (obj instanceof Map || obj instanceof Set) return `[${tag}(${obj.size})]`
        const keys = Object.keys(obj)
        const parts = keys.slice(0, LOG_MAX_KEYS).map(key => {
            let rendered: string
            try {
                rendered = logRender((obj as Record<string, unknown>)[key], depth + 1, seen)
            }
            catch {
                rendered = "[unreadable]"
            }
            return `${key}: ${rendered}`
        })
        if (keys.length > LOG_MAX_KEYS) parts.push(`…${keys.length - LOG_MAX_KEYS} more`)
        const name = obj.constructor && obj.constructor !== Object ? `${obj.constructor.name} ` : ""
        return `${name}{${parts.join(", ")}}`
    }
    finally {
        seen.delete(obj)
    }
}

/** A console argument that cannot keep anything alive: primitives pass, objects become text. */
export function logArgument(value: unknown): unknown {
    if (LOG_LIVE_OBJECTS) return value
    if (value === null || (typeof value !== "object" && typeof value !== "function")) return value
    try {
        return logClip(logRender(value, 0, new Set()), LOG_MAX_TOTAL)
    }
    catch {
        return "[unloggable]"
    }
}

function logLine(style: (text: string) => string, prefix: string, data: any[]): void {
    console.log(style(`[${prefix}]`) + " ", ...data.map(logArgument))
}

export const logger = (prefix: string, silence?: boolean) => {

    return {
        info: (...data: any[]) => {
            if (silence) return
            logLine(chalk.blue, prefix, data)
        },
        warning: (...data: any[]) => {
            if (silence) return
            logLine(chalk.yellow, prefix, data)
        },
        warn: (...data: any[]) => {
            if (silence) return
            logLine(chalk.yellow, prefix, data)
        },
        success: (...data: any[]) => {
            if (silence) return
            logLine(chalk.green, prefix, data)
        },
        error: (...data: any[]) => {
            if (silence) return
            logLine(chalk.red, prefix, data)
        },
        trace: (...data: any[]) => {
            if (silence || import.meta.env.MODE !== "development") return
            console.log(chalk.bgGray(`[${prefix}]`) + " ", ...data)
        },
    }

}

export const useEffectDebugger = (
    effectHook: () => void | (() => void),
    dependencies: any[],
    dependencyNames: string[] = [],
) => {
    const previousDeps = React.useRef(dependencies)

    React.useEffect(() => {
        const changedDeps = dependencies.reduce((accum, dependency, index) => {
            if (dependency !== previousDeps.current[index]) {
                const keyName = dependencyNames[index] || `Dependency #${index}`
                return {
                    ...accum,
                    [keyName]: {
                        before: previousDeps.current[index],
                        after: dependency,
                    },
                }
            }
            return accum
        }, {})

        if (Object.keys(changedDeps).length) {
            console.log("[useEffectDebugger] Changed dependencies:", changedDeps)
        }

        previousDeps.current = dependencies

        return effectHook()
    }, dependencies) // Pass the original dependencies to useEffect
}

export function useLatestFunction<T extends (...args: any[]) => any>(callback: T): T {
    const callbackRef = React.useRef(callback)

    React.useLayoutEffect(() => {
        callbackRef.current = callback
    }, [callback])

    return React.useCallback(((...args: Parameters<T>): ReturnType<T> => {
        return callbackRef.current(...args)
    }) as T, [])
}
