import { parseLibraryReturnHref } from "@/lib/library-navigation"
import { localizePath } from "@/lib/locale-navigation"

export type TaskReturnState = {
    from?: string | string[]
    fromShow?: string | string[]
    fromQuery?: string | string[]
    threadId?: string | string[]
}

export const THREAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function getSingleSearchParam(value: string | string[] | undefined) {
    return typeof value === "string" ? value : ""
}

export function buildTaskReturnSuffix(returnState: TaskReturnState, locale: "en" | "zh", targetLocale = locale) {
    const params = new URLSearchParams()
    const from = parseLibraryReturnHref(returnState.from)
    if (from) params.set("from", targetLocale === locale ? from : localizePath(from, targetLocale))
    const source = getSingleSearchParam(returnState.fromShow)
    const query = getSingleSearchParam(returnState.fromQuery)
    const threadId = getSingleSearchParam(returnState.threadId)
    if (/^[a-z0-9-]{1,64}$/.test(source)) params.set("fromShow", source)
    if (query) params.set("fromQuery", query.slice(0, 120))
    if (THREAD_ID_PATTERN.test(threadId)) params.set("threadId", threadId)
    const search = params.toString()
    return search ? `?${search}` : ""
}

