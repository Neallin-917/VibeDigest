export const LANDING_PREVIEW_LIMIT = 8
export const landingPreviewGrid = "grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"

export function landingPreviewVisibility(index: number) {
  if (index < 2) return ""
  if (index < 4) return "hidden sm:block"
  if (index < 6) return "hidden lg:block"
  return "hidden xl:block"
}
