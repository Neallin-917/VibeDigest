"use client"

export type ScriptRawPayloadV1 = {
  version?: number
  language?: string
  segments?: Array<{ start?: number; end?: number; text?: string }>
}

export function parseScriptRawPayload(scriptRawContent?: string): ScriptRawPayloadV1 | null {
  if (!scriptRawContent) return null
  try {
    const payload = JSON.parse(scriptRawContent) as ScriptRawPayloadV1
    if (!payload || typeof payload !== "object") return null
    return payload
  } catch {
    return null
  }
}

export function formatSeconds(seconds: number) {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  if (h > 0) return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`
  return `${m.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`
}


