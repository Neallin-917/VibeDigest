# Light-theme surface cleanup — design QA

## Comparison target

- Source visual truth: `/Users/xu/.codex/generated_images/019fbc47-5756-71e3-9a3b-30f7a5247564/exec-183d9d78-b4d0-48ba-b087-f31e54cc576e.png`
- Source pixels: 1488 × 1056
- Intended implementation state: desktop chat/task-detail surfaces in light mode, with media canvas remaining dark and all product UI surfaces light.
- Intended viewport: 1440 × 1024 at device scale factor 1.

## Implementation evidence

- Semantic surface and status tokens were added in `frontend/src/app/globals.css`.
- The task status card, five chat tool cards, transcript timeline, input, badge, usage card, and template skeleton now use semantic light/dark tokens.
- `npm run test -- src/components/chat/__tests__/TaskDataGroup.test.tsx src/components/tasks/TranscriptTimeline.test.tsx src/components/ui/input.test.tsx` passed: 3 files, 13 tests.
- `npm run build` passed.

## Browser comparison status

- Implementation screenshot: unavailable.
- The Codex in-app browser runtime is unavailable in this task (`agent` is not defined in the required browser-control runtime), so no browser-rendered capture, console inspection, interaction run, or same-viewport composite comparison could be completed.
- Focused-region comparison is therefore also unavailable.

## Required fidelity surfaces

- Fonts and typography: code review only; existing typography was preserved.
- Spacing and layout rhythm: code review only; no structural layout changes were made.
- Colors and visual tokens: implemented through semantic surface, border, success, and processing tokens; browser evidence is still required.
- Image quality and asset fidelity: no image assets were changed.
- Copy and content: unchanged.

## Findings

- [P1] Browser-rendered light-theme comparison is blocked.
  - Evidence: no implementation screenshot at the target viewport.
  - Impact: visual fidelity to the selected reference and real contrast cannot be accepted yet.
  - Fix: capture `/en/chat` and a task-detail state in both light and dark mode using an available browser surface, then compare against the source reference.

## Implementation checklist

1. Restore or connect the in-app browser runtime.
2. Capture the selected desktop state at 1440 × 1024 in light mode.
3. Verify task progress, tool output, transcript rows, input focus, and usage card in both themes.
4. Update this report with screenshots and resolve any remaining P1/P2 visual differences.

final result: blocked
