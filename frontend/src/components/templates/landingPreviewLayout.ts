export const LANDING_PREVIEW_LIMIT = 8
export const landingPreviewGrid = "grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-8 lg:grid-cols-3 xl:grid-cols-4"

export function landingPreviewVisibility(index: number) {
  if (index < 4) return ""
  if (index < 6) return "hidden lg:block"
  return "hidden xl:block"
}
