# AI Podcast Community — Design QA

## Evidence

- Source visual truth: `/Users/haoran/.codex/generated_images/01a031e9-18df-7810-9a82-139d0ca44d5a/exec-d3b2f29a-94f7-47b5-a255-956278639c10.png`
- Browser-rendered implementation: `/Users/haoran/.codex/visualizations/2026/08/24/01a031e9-18df-7810-9a82-139d0ca44d5a/vibedigest-podcast-community/design-qa-implementation.png`
- Full-view comparison: `/Users/haoran/.codex/visualizations/2026/08/24/01a031e9-18df-7810-9a82-139d0ca44d5a/vibedigest-podcast-community/design-qa-comparison.png`
- Focused source-shelf/card comparison: `/Users/haoran/.codex/visualizations/2026/08/24/01a031e9-18df-7810-9a82-139d0ca44d5a/vibedigest-podcast-community/design-qa-focused.png`
- Route: `http://localhost:3002/zh/explore`
- State: dark theme, default `All` filter, source shelf collapsed to five featured shows, page at scroll top.
- Requested CSS viewport: `1440 × 1024`; browser content width: `1435 × 1020` because the visible scrollbar occupies 5 px; device pixel ratio: `1`.
- Source pixels: `1487 × 1058`; normalized source pixels: `1435 × 1020` for the side-by-side comparison.
- Implementation pixels: `1435 × 1020`.

## Findings

- No actionable P0, P1, or P2 findings remain.
- Fonts and typography: the existing VibeDigest Syne/Jakarta system preserves the mock's bold display heading and compact UI hierarchy. Chinese uses the system fallback without clipping; card titles wrap to two or three lines as intended.
- Spacing and layout rhythm: desktop margins, navigation height, source rail, four-column shelf, dividers, and card proportions now track the selected concept. Mobile collapses to one column without horizontal overflow.
- Colors and tokens: existing charcoal surfaces and emerald product accent match the target. Borders remain restrained and cards avoid added shadows or glass effects.
- Image quality: episode cards use real YouTube thumbnails and official show avatars. Dynamic imagery intentionally differs from the concept's illustrative covers while preserving crop and hierarchy.
- Copy and content: the structure matches the selected direction. Production titles and actual organized counts replace the concept's illustrative copy and fake counts.
- Icons and controls: the existing product icon family is used consistently. Search, source filters, the 21-source expansion, theme toggle, digest links, and source links are keyboard-focusable.
- Accessibility and responsiveness: semantic headings/regions, labeled search, pressed source state, visible focus rings, 40 px minimum primary controls, reduced-motion-safe image scaling, and readable mobile wrapping are present.

## Primary interactions tested

- Expanded the shelf from five featured shows to all 21 sources.
- Filtered to Anthropic and confirmed one matching episode card.
- Reset to All, searched `Robots`, and confirmed one matching episode card.
- Opened the page at `390 × 844` and checked the single-column mobile layout.
- Checked browser console output; no application-origin errors were present.

## Comparison history

1. Initial capture found a P1 image-loading failure: Next image optimization rejected local DNS resolution for YouTube thumbnails. Fixed by rendering these already-allowlisted dynamic thumbnails unoptimized, consistent with the existing task-detail behavior. Revised capture shows all four images.
2. Initial full-view comparison found a P2 desktop density mismatch: page content began 32 px from the viewport while the concept used approximately 56 px. Added the `lg:px-14` desktop margin to navigation and main content. Revised comparison aligns the content frame and four-column shelf.
3. Post-fix full-view and focused comparisons found no remaining P0/P1/P2 issues. The visible search field and real episode art are accepted functional/data deviations from the static concept.

## Card-ratio refinement — 2026-08-24

- User reference: `/var/folders/jv/2vc403h93qq37tj4xg5sgd_w0000gn/T/codex-clipboard-6a327786-e14c-4467-97bc-7b6bf78c5ade.png` (`2518 × 870`).
- Revised desktop capture: `/Users/haoran/.codex/visualizations/2026/08/24/01a031e9-18df-7810-9a82-139d0ca44d5a/vibedigest-podcast-community/card-ratio-desktop.png` (`1435 × 897`, CSS viewport `1440 × 900`, DPR `1`).
- Revised mobile capture: `/Users/haoran/.codex/visualizations/2026/08/24/01a031e9-18df-7810-9a82-139d0ca44d5a/vibedigest-podcast-community/card-ratio-mobile.png` (`438 × 890`, CSS viewport `443 × 900`, DPR `1`).
- Normalized focused comparison: `/Users/haoran/.codex/visualizations/2026/08/24/01a031e9-18df-7810-9a82-139d0ca44d5a/vibedigest-podcast-community/card-ratio-comparison.png` (`1435 × 1000`).
- P2 finding: the `2.55:1` cover slot cropped the top and bottom of standard `16:9` YouTube thumbnails, while the information block used more vertical space than its content required.
- Fix: changed the cover slot to `16:9`; reduced the in-card source mark from 36 px to 28 px; reduced information padding and gaps; limited titles to two lines; preserved 40 px primary actions and focus states.
- Post-fix evidence: full thumbnail compositions are visible on desktop and mobile. The title, metadata, divider, and actions remain readable without increasing the card's overall visual weight. No horizontal overflow or application-origin console errors were observed.
- Required surfaces: typography remains legible at two lines; spacing is tighter but not cramped; colors/tokens are unchanged; real source imagery is no longer materially cropped; copy and actions are unchanged.
- Result: no remaining P0/P1/P2 findings for this refinement.

## Follow-up polish

- P3: once the ingestion backfill is live, replace local visual fixtures with the newest processed episodes and let real summary key-point counts populate every card.

final result: passed

## Library navigation shell alignment — 2026-08-27

### Evidence

- Source visual truth (reported misalignment): `/var/folders/jv/2vc403h93qq37tj4xg5sgd_w0000gn/T/codex-clipboard-ccf01be7-dfc0-407d-979a-0d651a17e0c5.png` (`2652 × 676`). The source is an approximately 1.85× density capture of the Chinese library's dark-theme top-of-page state.
- Browser-rendered implementation: `/tmp/vibedigest-library-nav-1440.png` (`1435 × 718`), captured from `http://localhost:3003/zh/explore` at CSS `1440 × 720`, DPR `1`; the browser reserves 5 px for the vertical scrollbar.
- Full-view comparison: `/tmp/vibedigest-library-nav-layout-comparison-1440.png`. The source was normalized to the same logical `1440 × 367` top-of-page region; the implementation was cropped to its equivalent top region.
- Mobile implementation: `/tmp/vibedigest-library-nav-390.png` (`385 × 833`), captured at CSS `390 × 844`, DPR `1` with a 5 px scrollbar.
- State: Chinese library route, initial source filter, page at scroll top. The source is the reported before-state; the wider top-bar boundary is the intentional requested change.

### Findings

- [Resolved P1] The old library top bar ended at the marketing-page frame while the library header, search, source shelf, and cards occupied the broader content frame. It made the global navigation look detached from the browsing surface.
  - Fix: added a semantic `shell="library"` option to `LandingNav`; `/zh/explore` now uses it. The library shell is `1440px` and uses the same `20 / 32 / 56px` responsive gutters as the library main content. Marketing and reading surfaces retain their `1080px` shell.
  - Post-fix evidence: at CSS width `1440`, the navigation-frame and source-shelf rectangles are both `left: 56`, `right: 1379`, `width: 1323`. The heading also starts at `left: 56`.
- Fonts and typography: no typography token, text, or weighting changed. The existing compact navigation hierarchy remains intact.
- Spacing and layout rhythm: the outer navigation boundary now shares the library grid; its 12 px internal padding remains intentionally independent from main-content padding.
- Colors and visual tokens: no color, surface, border, radius, or shadow token changed in this patch. The dark/light visual difference in the before/after comparison belongs to the pre-existing working-tree state and is not evaluated as part of this change.
- Image quality and assets: no image handling or asset changed. The screenshots show unrelated local thumbnail-loading behavior outside this navigation-shell scope.
- Copy and content: no user-facing copy changed by this patch.
- Accessibility and responsive reflow: at `390px`, the top-bar frame is `20–365px`; the document scroll width is `385px` within a `390px` viewport, so the change adds no horizontal overflow. The existing mobile menu still replaces desktop navigation.

### Primary interactions and verification

- `npm test -- --run src/components/landing/LandingNav.test.tsx`: passed, 8 tests.
- `npm run build`: passed.
- Opened `/zh/explore` in an isolated local preview at desktop and mobile widths; navigation, search, source shelf, and mobile-menu controls rendered in their expected semantic structure.
- The pre-existing port-3000 preview had a stale-chunk error after a production build. Verification used an isolated port-3003 preview; no new application-origin error was observed there.

### Comparison history

1. Before-state screenshot showed an intentional P1 layout mismatch: a marketing-width (`1080px`) nav against a library-width (`1440px`) content canvas.
2. Added the page-specific library shell and aligned the library breakpoint gutters without changing marketing-page widths.
3. Re-captured at CSS `1440px` and `390px`; no actionable P0/P1/P2 issue remains for this requested alignment change.

### Follow-up polish

- No additional polish is needed for this scope. Future new browse surfaces should choose an explicit shell variant instead of inheriting the marketing width by default.

final result: passed
