# VibeDigest Design Direction

> This is the design decision source of truth for VibeDigest. It governs product language, page composition, visual hierarchy, interaction, and visual verification. `AGENTS.md` owns repository guardrails. `frontend/src/app/globals.css` owns exact visual tokens. `docs/codemaps/frontend.md` owns implementation structure.

This document adapts the decision-first method in [Vercel's design guidance](https://vercel.com/design.md): start from the reader's job, evidence, priority, and composition before styling. It does not copy Vercel's report shell, monochrome brand system, or typography.

## Design objective

VibeDigest helps people understand podcasts and long-form video without first watching the entire source. The interface should make the Agent's work easy to inspect: summaries, key ideas, evidence, source context, and grounded follow-up.

The product should feel calm, direct, informed, and human. Confidence comes from clear structure, useful output, honest states, and visible source grounding. It must not manufacture an "AI" feeling through gradients, glow, glass, oversized type, animated decoration, or speculative claims.

The public library is evidence that the Agent produces useful work. It is not the product's primary identity. Landing pages activate the Agent, the library proves the result, and task pages deliver the result.

## Decision priority

When design requirements compete, protect them in this order:

1. Preserve facts, source meaning, locale, legal requirements, accessibility, privacy, and safe recovery.
2. Make the user's current job and next meaningful action clear.
3. Preserve the product hierarchy: Agent first, public output as proof, source supply as implementation detail.
4. Preserve content contracts, publication rules, analytics semantics, routes, and established interaction behavior.
5. Establish hierarchy through information order, typography, grid, spacing, and density.
6. Preserve the existing VibeDigest brand system and shared components.
7. Add motion, surface treatment, and visual detail only when they improve comprehension or feedback.

Do not trade a higher-priority requirement for a more impressive screenshot.

## Work in four passes

### Frame the user's job

Before changing a page, establish:

- Who opens this surface, and what are they trying to understand or do?
- What is the strongest supported answer or most important state?
- What evidence or source context earns trust?
- What uncertainty, limit, or error changes the decision?
- What is the shortest safe path to the next action?

Inspect the real page, real components, real content shapes, and current responsive behavior. Do not design from a single screenshot or from the generic category of "AI product."

### Choose the composition

Privately compare at least two materially different compositions before implementation. Change the information order, focal relationship, density, or evidence placement. Changing only colors or card styles does not count.

Choose the composition that makes the user's job clearest with the least mediation. The first viewport should communicate the central value, result, or active task. It should not merely establish mood.

Every major section must answer a new question. Combine repeated summaries, repeated calls to action, and equal-weight blocks that restate the same idea.

### Build with the existing system

Use existing semantic tokens, layout shells, typography roles, and local UI primitives. Check `frontend/src/components/ui/` before creating a component and use CVA for meaningful variants.

Do not introduce a parallel design system or page-local theme. New visual tokens require a reusable semantic role, not one screenshot-specific value.

Follow the rendering and component boundaries in `docs/codemaps/frontend.md`. Design changes do not justify moving static content into Client Components or creating another state path.

### Inspect and revise

Render the actual result. Inspect the first viewport, the full page, required interaction states, and responsive reflow. Fix the highest-impact systemic problem first, then render again.

Review in this order:

1. User job and first read.
2. Content order and language.
3. Grid, hierarchy, density, and grouping.
4. Typography, line length, and line breaks.
5. Actions, state, evidence, and source context.
6. Restraint and removable elements.
7. Responsive behavior and accessibility.
8. Motion, performance, and finish.

## Surface contracts

### Landing

**User job:** Decide whether VibeDigest can help with a long video, then submit a source or inspect a real result.

**First read:** The Agent's concrete value and one primary activation path.

**Proof:** A real, compact representation of the output hierarchy, followed by selected published work. Product previews must reuse real product concepts and data shapes. Do not invent dashboards, status consoles, transcript panels, or fake terminal UI.

**Avoid:** Source counts as the main promise, refresh-cadence copy, feature-card walls, repeated trust statements, multiple equivalent calls to action, and explanatory text that only repeats the headline.

### Explore and topic pages

**User job:** Find a relevant finished digest and judge output quality before submitting a personal source.

**First read:** What this collection contains, what can be filtered, and the strongest available content.

**Proof:** Real published summaries, source identity, useful titles, and honest metadata. The page is a browsable evidence surface, not an artificial media catalog.

**Avoid:** Making every item visually equal when the content roles differ, displaying internal ingestion details, excessive badges, duplicated links, and decorative counts without a user decision attached.

### Task detail

**User job:** Understand the source quickly, inspect key ideas and evidence, then play the source or ask a grounded follow-up.

**First read:** The result, not the processing system. Lead with the summary and essential source context.

**Reading order:** Conclusion and summary, key ideas and evidence, source context, follow-up, then secondary controls. A source player may support the result but must not dominate comprehension.

**Avoid:** Public transcripts, duplicated summaries, early empty query surfaces, oversized media, repeated task status, nested content cards, and motion that causes the title or reading position to shift.

### Chat workspace

**User job:** Submit a source, clarify intent, follow task progress, and continue from the finished result.

**First read:** The current conversation state and the next valid action.

**State:** Prefer one current, specific status over a timeline of repeated status cards. Accept user input before inference. Keep the conversation readable when tool activity is hidden or collapsed.

**Avoid:** Persisting transient loading UI, exposing native tool streams, decorative agent-thinking surfaces, duplicate task receipts, generic suggested prompts that do not match the current context, and controls that appear before they are usable.

### Account, billing, errors, and legal surfaces

**User job:** Make a precise decision, recover, or understand an obligation.

Use explicit labels, exact consequences, and visible recovery paths. These surfaces may use more copy than marketing pages when the detail is necessary for consent, billing, permissions, destructive actions, or error recovery.

Do not apply the delete-first copy rule so aggressively that risk or consequence becomes unclear.

## Composition and hierarchy

### One focal relationship

Each viewport or major section should have one dominant relationship: value and action, result and evidence, selection and consequence, or task and state. Supporting content should be quieter.

If every object has the same size, border, color, and weight, the composition has no hierarchy. Redesign the grouping before adding decoration.

### Two reading speeds

Result surfaces should support:

- **Fast comprehension:** title, summary, key ideas, decisive evidence, and primary action.
- **Source-grounded inspection:** source context, exact supporting detail, limitations, and follow-up.

Do not make the audit path dominate the first read. Do not hide material caveats to preserve a clean layout.

### Geometry before components

Choose the information relationship before choosing cards, tabs, or accordions:

- Sequence uses ordered flow.
- Comparison uses aligned rows or columns on a shared basis.
- Magnitude uses aligned position or length only when the scale is meaningful.
- Hierarchy uses proportion, order, and whitespace.
- Dense lookup uses semantic tables or compact lists.
- Source relationships use proximity, labels, and links.

A card is not a default unit of content. Use a surface only when it communicates interaction, selection, containment, media cropping, or a real grouping that spacing cannot express.

### Grid and responsive shells

Align each surface to its established shell. Marketing and reading pages remain narrower than the public library. Do not globally widen the product to solve one crowded component.

Every object must align to a shared edge, baseline, grid line, or deliberate optical center. Avoid underfilled splits and orphaned grid cells. Unequal content roles should not be forced into equal cells.

Responsive work must recompose the hierarchy, not only shrink it. Multi-column structures collapse according to reading order. Mobile source order must remain the semantic reading order.

## Visual language

### Brand character

VibeDigest uses a restrained editorial SaaS language: warm neutral canvas, moss accent, dark readable text, compact product typography, and limited display typography. This is an established brand choice, not a generic premium palette to reproduce in unrelated products.

Exact values belong to `frontend/src/app/globals.css`. Use semantic roles such as background, foreground, surface, primary, border, muted text, success, and processing. Do not bypass them with one-off colors unless the color represents an external source brand or a documented data meaning.

### Typography

- Plus Jakarta Sans carries product UI, body copy, navigation, controls, and reading text.
- Syne is display-only and should be scarce. It must not become the default font for dense product UI or long reading surfaces.
- Use scale only when the message earns it. Large titles are not a substitute for hierarchy.
- Keep reading measures comfortable. Rewrite or rebalance before shrinking text into tiny muted copy.
- Equivalent peers use the same type role, weight, line height, and numeric treatment.
- Inspect important line breaks in English and Chinese. Do not tune only for one sample title.

### Color

The primary accent identifies action, focus, and selected product state. Do not use it merely to make a section feel important. Success, warning, error, processing, and external-platform colors retain their semantic roles.

Gradients are allowed only when they encode data, create a necessary media scrim, or belong to a specific approved brand asset. Gradient text, ambient blobs, neon glow, and colorful section alternation are not part of the default language.

Do not rely on color alone. Pair state with text, shape, position, or another accessible cue.

### Surfaces, borders, radii, and shadows

The page should usually read as one continuous canvas. Establish groups with order, spacing, alignment, and density before adding a box.

- Use cards when content is selectable, repeatable, independently actionable, or requires a stable media crop.
- Avoid cards inside cards.
- Avoid glass, blur, and translucent panels as default structure.
- Use borders to clarify a boundary, not to repair weak hierarchy.
- Keep radius roles consistent across controls, cards, media, and overlays.
- Use shadows only when elevation or overlap is real. Keep them restrained and tinted to the surrounding surface.
- Pills are reserved for compact controls, filters, or genuine status. Ordinary metadata and section labels should remain text.

### Images and icons

Use real source thumbnails, official show art, product screenshots, or diagrams when they provide evidence or recognition. Preserve their natural role and crop.

Do not generate stock-like AI imagery to make the product appear more complete. Do not build fake product screenshots from decorative rectangles. A live preview should be a real component or a faithful, testable representation of the real output.

Use the established icon family. Icons clarify actions or source identity; they do not decorate headings or occupy colored tiles without meaning.

## Product copy

Show text required to act, choose, understand state, recover, or meet legal and accessibility needs. Delete text that repeats the heading, control label, adjacent state, or obvious page structure. Do not replace deleted copy with shorter filler.

Write English first, then Chinese. Preserve meaning rather than translating visual rhythm literally. The active route and summary language must agree.

Prefer concrete nouns and verbs. State what the Agent produces or what the user can do. Avoid unsupported praise and generic AI marketing words such as:

- Transform
- Unlock
- Elevate
- Seamless
- Revolutionary
- Next-generation
- Supercharge

Avoid all-caps tracked eyebrows, decorative section numbers, atmospheric labels, fake technical metadata, and repeated "AI-powered" claims. Avoid em dashes in visible product and marketing copy; rewrite the sentence.

Error, billing, permission, destructive-action, and irreversible-action copy must remain specific enough to support a decision or recovery.

## Motion and feedback

Motion is allowed when it communicates hierarchy, feedback, continuity, progress, or state change. It is not a visual identity layer by itself.

- Keep reading complete without animation.
- Do not reveal every section on scroll.
- Do not use parallax, simulated typing, floating blobs, pulsing decoration, or perpetual motion by default.
- Do not animate layout properties when transform or opacity can communicate the same change.
- Avoid `transition-all`; transition the properties that actually change.
- Preserve reading position and prevent title or content jitter.
- Respect `prefers-reduced-motion` and provide a complete static state.
- Loading should be calm and proportional to the wait. Avoid shimmer and decorative skeletons unless the final geometry must be reserved and no simpler state works.

Delight should come from low friction, a clear transition, a useful answer appearing at the right moment, or a source relationship becoming easier to understand.

## Reject generated-design reflexes

Do not ship the following as defaults:

- A generic centered hero followed by three equal feature cards.
- AI-purple or blue gradients, ambient blobs, glow, glass, or ornamental blur.
- Oversized headings used to simulate confidence or premium quality.
- Repeated cards when one composed relationship would be clearer.
- Nested panels, excessive borders, and a rounded rectangle around every idea.
- All-caps eyebrows, numbered section labels, scroll cues, version stamps, and decorative status dots.
- Pills for ordinary metadata or editorial labels.
- Fake product UI, fake precision, fake testimonials, or invented activity counts.
- Decorative charts, progress bars, and metrics that do not answer a user question.
- Repeated summary, rationale, proof, and conclusion sections saying the same thing.
- Tiny gray explanatory text added to make a sparse layout appear detailed.
- Identical section silhouettes across unrelated questions.
- Animation added because the page feels visually quiet.

These are bias corrections, not substitutes for judgment. A gradient may serve a media scrim. A card may be the correct interaction unit. A pill may be the correct filter control. The exception must be explained by the content or behavior, not taste alone.

## Interaction states

Design the full state cycle, not only the successful screenshot:

- **Ready:** The primary action and required context are clear.
- **Loading:** Preserve orientation and communicate only material progress.
- **Empty:** Explain what is absent and how to populate it when an action exists.
- **Partial:** Keep valid content readable and identify what is still unavailable.
- **Error:** State what failed, what remains safe, and the next recovery action.
- **Success:** Confirm the result without adding a second competing surface.
- **Disabled or unavailable:** Explain the constraint when the reason is not obvious.

Transient state must not become durable content. Repeated task updates should converge on one current state.

## Accessibility and responsive behavior

- Use semantic landmarks, ordered headings, native controls, visible focus, accessible names, and meaningful link text.
- Meet WCAG AA contrast and never rely on color alone.
- Preserve a minimum practical target size for primary touch controls.
- Do not conceal page overflow. Reflow before shrinking or clipping.
- Keep source order equal to reading order.
- Provide text alternatives for meaningful charts, images, and diagrams.
- Do not duplicate equivalent links as separate tab stops. Keep a distinct external source link when it serves a different destination.
- Respect reduced motion and avoid interaction that depends on hover.

Validate whole-page behavior at 390px, 1024px, and 1440px. Add an intermediate width when the composition changes materially. Test both short and long titles, sparse and dense content, and English and Chinese.

## Visual verification

For material UI changes, verify the real implementation rather than a design-only mock.

### Required views

- First viewport at the primary desktop width.
- Full-page desktop flow.
- Mobile reflow at 390px.
- Tablet or narrow desktop at 1024px.
- Any supported theme that the changed surface can render.
- Loading, empty, partial, error, and success states affected by the change.

### Review questions

1. Can the user identify the page's job and primary state immediately?
2. Is the result or evidence more prominent than the surrounding UI?
3. Does every section add a new reader question or action?
4. Can any label, card, border, icon, color, paragraph, or animation be removed without losing meaning or usability?
5. Does the grid remain coherent with real titles and real content counts?
6. Are mobile order, focus order, and reading order consistent?
7. Are error, billing, permission, and destructive states specific enough to act on?
8. Does motion communicate something, remain performant, and respect reduced motion?
9. Does the result look like VibeDigest rather than a generic AI template or a copied reference brand?

Run the relevant repository validation described in `docs/testing/README.md` and `docs/codemaps/frontend.md`. A passing build proves implementation integrity, not visual quality. Browser inspection and responsive evidence remain required for material visual changes.

## Change discipline

Use targeted evolution when the information architecture and brand are sound. Improve in this order:

1. Content order and duplication.
2. Typography and reading measure.
3. Grid, spacing, and density.
4. Color and surface restraint.
5. Interaction feedback and motion.
6. Major recomposition only when the existing structure cannot satisfy the user job.

Do not silently change route structure, primary navigation labels, analytics identifiers, legal copy, the brand mark, publication rules, or established task behavior as part of a visual redesign.

Update this document when a design decision changes across multiple surfaces or establishes a new reusable rule. Component-specific behavior belongs with the component and its tests. Exact tokens belong in `frontend/src/app/globals.css`. Historical screenshots and one-time findings belong in QA artifacts, not in this source of truth.
