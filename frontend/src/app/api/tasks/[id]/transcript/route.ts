import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { parseScriptRawPayload } from "@/components/tasks/transcript"

type RouteParams = {
    params: Promise<{ id: string }>
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(_request: Request, { params }: RouteParams) {
    const { id } = await params
    if (!UUID_PATTERN.test(id)) {
        return NextResponse.json({ error: "Invalid task ID" }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: task, error: taskError } = await supabase
        .from("tasks")
        .select("id, status")
        .eq("id", id)
        .single()

    if (taskError || !task) {
        const status = taskError?.code === "PGRST116" || !task ? 404 : 500
        return NextResponse.json(
            { error: status === 404 ? "Task not found" : "Failed to load task" },
            { status }
        )
    }
    if (task.status !== "completed") {
        return NextResponse.json({ error: "Transcript is not ready" }, { status: 409 })
    }

    const { data: outputs, error: outputError } = await supabase
        .from("task_outputs")
        .select("kind, content")
        .eq("task_id", id)
        .in("kind", ["script_raw", "script"])
        .eq("status", "completed")

    if (outputError) {
        return NextResponse.json({ error: "Failed to load transcript" }, { status: 500 })
    }

    const raw = outputs?.find((output) => output.kind === "script_raw")
    const payload = parseScriptRawPayload(raw?.content || undefined)
    const segments = (payload?.segments || [])
        .filter((segment) => typeof segment.text === "string" && segment.text.trim())
        .map((segment) => ({
            start: typeof segment.start === "number" ? Math.max(0, segment.start) : 0,
            end: typeof segment.end === "number" ? Math.max(0, segment.end) : undefined,
            text: segment.text!.trim(),
        }))

    if (segments.length > 0) {
        return NextResponse.json(
            { language: payload?.language || null, segments },
            { headers: { "Cache-Control": "private, max-age=300" } }
        )
    }

    const script = outputs?.find((output) => output.kind === "script")?.content?.trim()
    if (!script) {
        return NextResponse.json({ error: "Transcript not found" }, { status: 404 })
    }

    return NextResponse.json(
        { language: null, text: script },
        { headers: { "Cache-Control": "private, max-age=300" } }
    )
}
