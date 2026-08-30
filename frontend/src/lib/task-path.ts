export function buildTaskSlug(title?: string | null) {
  return encodeURIComponent((title?.trim() || "video").replace(/\s+/g, "-"))
}

export function buildTaskPath(task: { id: string; video_title?: string | null }) {
  return `/tasks/${task.id}/${buildTaskSlug(task.video_title)}`
}
