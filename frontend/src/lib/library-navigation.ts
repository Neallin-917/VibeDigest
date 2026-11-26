import { isLocale, type Locale } from "@/lib/i18n"
import { isPodcastTopic } from "@/lib/topic-hubs"

type LibraryParams = { show?: string | string[]; q?: string | string[]; page?: string | string[] }

export function readLibraryParams(params: LibraryParams | URLSearchParams) {
  function single(key: keyof LibraryParams) {
    const value = params instanceof URLSearchParams ? params.getAll(key) : params[key]
    if (typeof value === "string") return value
    return value?.length === 1 ? value[0] : ""
  }
  const show = single("show").trim()
  const page = Number.parseInt(single("page"), 10)
  return {
    source: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(show) ? show : "all",
    query: single("q").slice(0, 120).trim(),
    page: Number.isFinite(page) ? Math.max(1, Math.min(page, 20)) : 1,
  }
}

export function buildLibraryHref(pathname: string, sourceId: string, query: string, page: number) {
  const params = new URLSearchParams()
  if (sourceId !== "all" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sourceId)) params.set("show", sourceId)
  const trimmedQuery = query.trim().slice(0, 120)
  if (trimmedQuery) params.set("q", trimmedQuery)
  if (Number.isSafeInteger(page) && page > 1) params.set("page", String(Math.min(page, 20)))
  const search = params.toString()
  return `${pathname}${search ? `?${search}` : ""}`
}

export function libraryEpisodeAnchor(taskId: string) {
  return `episode-${taskId.replace(/[^a-zA-Z0-9_-]/g, "-")}`
}

/** Accept only an internal library route, optionally restricted to one language. */
export function parseLibraryReturnHref(value: unknown, locale?: Locale): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/.test(value)) return null
  let url: URL
  try {
    url = new URL(value, "https://vibedigest.invalid")
  } catch {
    return null
  }
  const segments = url.pathname.split("/")
  const routeLocale = segments[1]
  if (!isLocale(routeLocale) || (locale && routeLocale !== locale)) return null
  const isExplore = url.pathname === `/${routeLocale}/explore`
  const isTopic = segments.length === 4 && segments[2] === "topics" && isPodcastTopic(segments[3])
  if (!isExplore && !isTopic) return null
  const href = buildLibraryHref(
    url.pathname,
    url.searchParams.get("show") || "all",
    url.searchParams.get("q") || "",
    Number(url.searchParams.get("page")) || 1,
  )
  const anchor = /^#episode-[a-zA-Z0-9_-]+$/.test(url.hash) ? url.hash : ""
  return `${href}${anchor}`
}
