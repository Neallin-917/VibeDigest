export const LANDING_PREVIEW_LIMIT = 8
export const landingPreviewGrid = "grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-8 lg:grid-cols-4"

// A narrower viewport changes layout, not how much of the library is available.
export function landingPreviewVisibility(_index: number) {
  void _index // Keep the shared call signature used by cards and loading placeholders.
  return ""
}
