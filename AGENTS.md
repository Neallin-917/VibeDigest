# AGENTS.md — VibeDigest

> **AI Agents**: This is the Single Source of Truth. Before writing code, READ this file. If you make architectural changes, UPDATE this file.

## Project

VibeDigest — Full-stack tool to download videos, transcribe audio, and generate AI-powered condensed knowledge.

## Product Positioning

- VibeDigest is an AI agent that helps users watch and understand podcasts and long-form video. The primary promise is the agent output: summaries, key ideas, transcripts, and source-grounded follow-up.
- The public podcast library is a ready-made gallery of mature agent output. It helps users experience and trust the product before submitting their own link, while naturally creating a community content surface.
- Tracked shows and ingestion frequency are supply-side implementation details, not the product promise. Do not position VibeDigest as a closed AI-podcast directory or foreground source counts and refresh cadence in acquisition copy.
- Landing pages explain and activate the agent. The public library proves the output. Task detail pages deliver the value. Keep this hierarchy consistent in navigation, copy, and calls to action.

## Core Rules

1. **Verify before declaring success** — Never say "this should work now". Run the build, run the tests, check the output.
2. **Explain before changing** — When diagnosing issues, provide explanation FIRST. Only edit code when explicitly asked or after confirming diagnosis.
3. **Cross-boundary validation** — After any refactor touching both frontend and backend, run: `cd frontend && npm run build` AND `make test-backend`

## Documentation Ownership (SSOT)

Use one owner per fact. Refer to the owning file instead of copying facts into multiple docs.

| Fact | Owner |
| --- | --- |
| AI rules, repo guardrails, validation rules | `AGENTS.md` |
| Development setup and core commands | `README.md` |
| Development workflow and PR expectations | `CONTRIBUTING.md` |
| Deployment, rollback, monitoring | `docs/RUNBOOK.md` |
| Architecture and directory mapping | `docs/codemaps/*.md` |
| Testing strategy and coverage policy | `docs/testing/README.md` |

## Quick Reference

| Command                | Purpose                  |
| ---------------------- | ------------------------ |
| `make start-frontend`  | Start frontend (Next.js) |
| `make start-backend`   | Start backend (FastAPI)  |
| `make start-worker`    | Start durable task worker |
| `make process-podcast-supply` | Run a bounded Codex subscription supply batch |
| `make backfill-podcasts` | Advance one bounded historical discovery batch |
| `make test-frontend`   | Run frontend unit tests  |
| `make test-backend`    | Run backend tests        |
| `make start-dev`       | Start API + worker against the dev Cloud DB |

## Architecture (TL;DR)

- **Primary Product**: Cloud SaaS — Next.js on Vercel, FastAPI on Railway, Supabase Auth/Postgres/Realtime.
- **Task Execution**: FastAPI validates commands; private Postgres transactions persist `workload_kind`, deduplicate/create state, and enqueue an ID-only PGMQ job. The Railway `hosted_api` worker consumes only `user_submission` from `video_processing`.
- **Podcast Supply**: A bounded Railway cron syncs `config/podcast-sources.json`, discovers recent episodes, advances a durable historical cursor, and atomically submits `catalog_supply` tasks to `podcast_supply`. A bounded trusted private `trusted_codex` worker reuses the canonical pipeline with ChatGPT-managed Codex authentication. Only completed tasks that pass the database-owned public quality projection can become public.
- **Product Boundary**: The product remains Vercel UI + Railway API/hosted Worker + Supabase. ADR 0001 explicitly adds a replaceable trusted private runner for internal catalog supply; it is not a user-facing runtime or an alternative state/queue path.
- **Agent Plugin Incubator**: `agent-plugin/` packages Codex Skill + MCP; credentialed video extraction lives in `backend/services/video_intake/`, never in Skill files.
- **Control Plane**: Next's `POST /api/chat/direct-submit` forwards to FastAPI's canonical `POST /api/process-video`; request handlers never execute long-running pipelines in-process.
- **Data Plane**: Supabase Realtime watches committed Postgres task/output changes (`supabase.channel`).
- **Rule**: Frontend NEVER polls HTTP. It subscribes to database changes.

## Critical Rules

1. **Python**: Always use `uv` (never raw `pip`)
2. **Dependencies**: `pyproject.toml` is the only Python dependency manifest; `uv.lock` is the only resolved lock. Use dependency groups for dev/test tools and install with `uv sync --locked`.
3. **Models**: Never hardcode LLM model names — use `settings.MODEL_SMART` / `settings.MODEL_FAST` and `utils.llm_router.resolve_model_for_intent`
4. **Text runtime routing**: Railway product services use `LLM_RUNTIME=api` with explicit `LLM_PROVIDER` (`openai`, `openrouter`, or `custom`); legacy inference remains `custom` when `OPENAI_BASE_URL` is present and `openrouter` otherwise. `LLM_RUNTIME=codex_local` is allowed only on trusted developer machines and the `trusted_codex` catalog-supply worker; it is rejected on Railway. In local development, source-grounded chat follow-ups may use the constrained Codex bridge; hosted chat remains on the standard API tool protocol.
5. **Model defaults SSOT**: provider default model names live only in `config/llm-provider-defaults.json`
6. **Components**: Use CVA for variants, check `src/components/ui/` first
7. **Tests**: Never call paid APIs in CI (mock everything)
8. **Thinking Process**: Conduct all internal reasoning, tool calls, and architecture planning in English for maximum logical consistency.
9. **Language Alignment**: Strictly provide the final explanation and summary in Chinese.
10. **Best Practice Alignment**:
   1. Before implementing any solution, internally brainstorm at least two approaches.
   2. Compare your proposed solution against industry-standard best practices (e.g., Clean Code, SOLID, OWASP for security, or framework-specific idioms like React Server Components or Pythonic PEP 8).
   3. If there is a gap between your initial thought and the best practice, adopt the best practice and explicitly mention the "Industry Standard" reasoning in your final explanation.
11. **Design Principle**: VibeDigest defaults to minimal design across visual style, interaction, copy, information architecture, and loading states. Prefer fewer UI surfaces, fewer decisions, shorter copy, and less visual noise. Avoid decorative complexity, skeleton screens, shimmer effects, multi-step transitional UI, and redundant status messaging unless a clear usability need justifies them.
12. **Motion Principle**: Minimal design does not imply low motion. Use motion when it improves comprehension, feedback, continuity, or delight; choose its amount, pacing, and complexity based on the interaction rather than an arbitrary low-motion preference. It must remain purposeful, performant, and respectful of `prefers-reduced-motion`.
13. **Minimalism Heuristic**: When multiple valid UI solutions exist, prefer the one with the least visual noise, the fewest transient states, and the smallest cognitive load while preserving clarity and speed. Do not treat animation quantity as a proxy for visual simplicity.
14. **Cloud-only Guardrail**: Development and tests may use localhost, but must keep the production Postgres, Supabase Auth/Realtime, queue semantics, and API contracts; do not introduce an alternative storage or event path. The ADR-approved trusted catalog runner changes only execution location and still uses the canonical Cloud queue and task state.
15. **Queue Integrity**: Task/output state changes, persisted `workload_kind`, and PGMQ submission must share one Postgres transaction. `user_submission` routes to `video_processing`; `catalog_supply` routes to `podcast_supply`, including retries. Queue messages contain entity IDs only, workers are capability-locked, workers must renew visibility leases, and archive is allowed only after a confirmed terminal write.
16. **Current Product Stage**: VibeDigest is still a small product. Prioritize user experience, frontend responsiveness, perceived and measured performance, and user-facing reliability. Keep baseline protections for credentials, ownership, paid usage, and data loss, but defer heavy defense-in-depth, multi-worker coordination, dedicated security infrastructure, and complex operational consoles until scale, incidents, sensitive-data requirements, or measured load justify them.
17. **Complexity Budget**: A technical-debt fix must solve a current user problem, a production blocker, or a measured reliability/performance issue. Otherwise document the trigger for revisiting it instead of adding code now.

## Codex Model Routing

- Users describe the task normally and do not need to select a model or request delegation.
- The primary agent owns intent, risk classification, acceptance criteria, architectural decisions, and the final verified result.
- The primary agent may automatically delegate bounded work when it materially improves speed or keeps noisy evidence out of the main context:
  - `spark_explorer`: read-only code-path tracing, log triage, diff mapping, and evidence gathering.
  - `spark_test_worker`: deterministic unit/offline replay tests, mocks, fixtures, and test-only repairs.
  - `spark_ui_worker`: small targeted frontend, copy, styling, accessibility, type, lint, and component fixes after expected behavior is clear.
- Prefer parallel delegation for independent read-heavy work. Use at most one write-capable agent at a time unless file ownership is provably disjoint.
- Never delegate architecture, cross-boundary contracts, authentication or ownership, queue transactions or leases, database migrations or production data, paid-provider validation, secrets, deployment, rollback, security-sensitive decisions, or final high-risk review to a Spark agent.
- A Spark agent must stop and return evidence when scope becomes ambiguous, validation requires a live or paid service, or the task crosses a prohibited boundary. The primary agent then continues with a stronger model.
- The primary agent reviews delegated changes and runs the repository-required verification before declaring success.
- If a named Spark agent or model is unavailable, fall back to the current model or a built-in agent without blocking the task.

## Coverage Policy

- Repo enforcement: backend global coverage gate is `65%`
- Engineering target: new or materially changed code should reach `80%+` coverage in the touched area
- If docs, CI, and local config disagree, fix the docs or config so they match before declaring success

## Detailed Guidelines

| Topic        | Guide                                      |
| ------------ | ------------------------------------------ |
| Architecture | [docs/codemaps/architecture.md](docs/codemaps/architecture.md) |
| Frontend     | [docs/codemaps/frontend.md](docs/codemaps/frontend.md) |
| Backend      | [docs/codemaps/backend.md](docs/codemaps/backend.md) |
| Database     | [docs/codemaps/data.md](docs/codemaps/data.md) |
| Deployment   | [docs/RUNBOOK.md](docs/RUNBOOK.md)         |
| Testing      | [docs/testing/README.md](docs/testing/README.md) |
| Release      | [CHANGELOG.md](CHANGELOG.md)               |
| Secrets      | [SECURITY.md](SECURITY.md)                 |
| Commands     | [CONTRIBUTING.md](CONTRIBUTING.md)         |
| Git          | [CONTRIBUTING.md](CONTRIBUTING.md)         |

## Version History

See [docs/changelog.md](docs/changelog.md) for version history (v3.0 → v3.4).

<!-- NEXT-AGENTS-MD-START -->[Next.js Docs Index]|root: ./.next-docs|STOP. What you remember about Next.js is WRONG for this project. Always search docs and read before any task.|If docs missing, run this command first: npx @next/codemod agents-md --output AGENTS.md|01-app:{04-glossary.mdx}|01-app/01-getting-started:{01-installation.mdx,02-project-structure.mdx,03-layouts-and-pages.mdx,04-linking-and-navigating.mdx,05-server-and-client-components.mdx,06-fetching-data.mdx,07-mutating-data.mdx,08-caching.mdx,09-revalidating.mdx,10-error-handling.mdx,11-css.mdx,12-images.mdx,13-fonts.mdx,14-metadata-and-og-images.mdx,15-route-handlers.mdx,16-proxy.mdx,17-deploying.mdx,18-upgrading.mdx}|01-app/02-guides:{ai-agents.mdx,analytics.mdx,authentication.mdx,backend-for-frontend.mdx,caching-without-cache-components.mdx,cdn-caching.mdx,ci-build-caching.mdx,content-security-policy.mdx,css-in-js.mdx,custom-server.mdx,data-security.mdx,debugging.mdx,deploying-to-platforms.mdx,draft-mode.mdx,environment-variables.mdx,forms.mdx,how-revalidation-works.mdx,incremental-static-regeneration.mdx,instant-navigation.mdx,instrumentation.mdx,internationalization.mdx,json-ld.mdx,lazy-loading.mdx,local-development.mdx,mcp.mdx,mdx.mdx,memory-usage.mdx,migrating-to-cache-components.mdx,multi-tenant.mdx,multi-zones.mdx,open-telemetry.mdx,package-bundling.mdx,ppr-platform-guide.mdx,prefetching.mdx,preserving-ui-state.mdx,preventing-flash-before-hydration.mdx,production-checklist.mdx,progressive-web-apps.mdx,public-static-pages.mdx,redirecting.mdx,rendering-philosophy.mdx,sass.mdx,scripts.mdx,self-hosting.mdx,server-actions.mdx,single-page-applications.mdx,static-exports.mdx,streaming.mdx,tailwind-v3-css.mdx,third-party-libraries.mdx,videos.mdx,view-transitions.mdx}|01-app/02-guides/migrating:{app-router-migration.mdx,from-create-react-app.mdx,from-vite.mdx}|01-app/02-guides/testing:{cypress.mdx,jest.mdx,playwright.mdx,vitest.mdx}|01-app/02-guides/upgrading:{codemods.mdx,version-14.mdx,version-15.mdx,version-16.mdx}|01-app/03-api-reference:{07-edge.mdx,08-turbopack.mdx}|01-app/03-api-reference/01-directives:{use-cache-private.mdx,use-cache-remote.mdx,use-cache.mdx,use-client.mdx,use-server.mdx}|01-app/03-api-reference/02-components:{font.mdx,form.mdx,image.mdx,link.mdx,script.mdx}|01-app/03-api-reference/03-file-conventions/01-metadata:{app-icons.mdx,manifest.mdx,opengraph-image.mdx,robots.mdx,sitemap.mdx}|01-app/03-api-reference/03-file-conventions/02-route-segment-config:{dynamicParams.mdx,instant.mdx,maxDuration.mdx,preferredRegion.mdx,runtime.mdx}|01-app/03-api-reference/03-file-conventions:{default.mdx,dynamic-routes.mdx,error.mdx,forbidden.mdx,instrumentation-client.mdx,instrumentation.mdx,intercepting-routes.mdx,layout.mdx,loading.mdx,mdx-components.mdx,not-found.mdx,page.mdx,parallel-routes.mdx,proxy.mdx,public-folder.mdx,route-groups.mdx,route.mdx,src-folder.mdx,template.mdx,unauthorized.mdx}|01-app/03-api-reference/04-functions:{after.mdx,cacheLife.mdx,cacheTag.mdx,catchError.mdx,connection.mdx,cookies.mdx,draft-mode.mdx,fetch.mdx,forbidden.mdx,generate-image-metadata.mdx,generate-metadata.mdx,generate-sitemaps.mdx,generate-static-params.mdx,generate-viewport.mdx,headers.mdx,image-response.mdx,next-request.mdx,next-response.mdx,not-found.mdx,permanentRedirect.mdx,redirect.mdx,refresh.mdx,revalidatePath.mdx,revalidateTag.mdx,unauthorized.mdx,unstable_cache.mdx,unstable_noStore.mdx,unstable_rethrow.mdx,updateTag.mdx,use-link-status.mdx,use-params.mdx,use-pathname.mdx,use-report-web-vitals.mdx,use-router.mdx,use-search-params.mdx,use-selected-layout-segment.mdx,use-selected-layout-segments.mdx,userAgent.mdx}|01-app/03-api-reference/05-config/01-next-config-js:{adapterPath.mdx,allowedDevOrigins.mdx,appDir.mdx,assetPrefix.mdx,authInterrupts.mdx,basePath.mdx,cacheComponents.mdx,cacheHandlers.mdx,cacheLife.mdx,compress.mdx,crossOrigin.mdx,cssChunking.mdx,deploymentId.mdx,devIndicators.mdx,distDir.mdx,env.mdx,expireTime.mdx,exportPathMap.mdx,generateBuildId.mdx,generateEtags.mdx,headers.mdx,htmlLimitedBots.mdx,httpAgentOptions.mdx,images.mdx,incrementalCacheHandlerPath.mdx,inlineCss.mdx,logging.mdx,mdxRs.mdx,onDemandEntries.mdx,optimizePackageImports.mdx,output.mdx,pageExtensions.mdx,poweredByHeader.mdx,productionBrowserSourceMaps.mdx,proxyClientMaxBodySize.mdx,reactCompiler.mdx,reactMaxHeadersLength.mdx,reactStrictMode.mdx,redirects.mdx,rewrites.mdx,sassOptions.mdx,serverActions.mdx,serverComponentsHmrCache.mdx,serverExternalPackages.mdx,staleTimes.mdx,staticGeneration.mdx,taint.mdx,trailingSlash.mdx,transpilePackages.mdx,turbopack.mdx,turbopackFileSystemCache.mdx,turbopackIgnoreIssue.mdx,turbopackLocalPostcssConfig.mdx,typedRoutes.mdx,typescript.mdx,urlImports.mdx,useLightningcss.mdx,useTypeScriptCli.mdx,viewTransition.mdx,webVitalsAttribution.mdx,webpack.mdx}|01-app/03-api-reference/05-config:{02-typescript.mdx,03-eslint.mdx}|01-app/03-api-reference/06-cli:{create-next-app.mdx,next.mdx}|01-app/03-api-reference/07-adapters:{01-configuration.mdx,02-creating-an-adapter.mdx,03-api-reference.mdx,04-testing-adapters.mdx,05-routing-with-next-routing.mdx,06-implementing-ppr-in-an-adapter.mdx,07-runtime-integration.mdx,08-invoking-entrypoints.mdx,09-output-types.mdx,10-routing-information.mdx,11-use-cases.mdx}|02-pages/01-getting-started:{01-installation.mdx,02-project-structure.mdx,04-images.mdx,05-fonts.mdx,06-css.mdx,11-deploying.mdx}|02-pages/02-guides:{analytics.mdx,authentication.mdx,babel.mdx,ci-build-caching.mdx,content-security-policy.mdx,css-in-js.mdx,custom-server.mdx,debugging.mdx,draft-mode.mdx,environment-variables.mdx,forms.mdx,incremental-static-regeneration.mdx,instrumentation.mdx,internationalization.mdx,lazy-loading.mdx,mdx.mdx,multi-zones.mdx,open-telemetry.mdx,package-bundling.mdx,post-css.mdx,preview-mode.mdx,production-checklist.mdx,redirecting.mdx,sass.mdx,scripts.mdx,self-hosting.mdx,static-exports.mdx,tailwind-v3-css.mdx,third-party-libraries.mdx}|02-pages/02-guides/migrating:{app-router-migration.mdx,from-create-react-app.mdx,from-vite.mdx}|02-pages/02-guides/testing:{cypress.mdx,jest.mdx,playwright.mdx,vitest.mdx}|02-pages/02-guides/upgrading:{codemods.mdx,version-10.mdx,version-11.mdx,version-12.mdx,version-13.mdx,version-14.mdx,version-9.mdx}|02-pages/03-building-your-application/01-routing:{01-pages-and-layouts.mdx,02-dynamic-routes.mdx,03-linking-and-navigating.mdx,05-custom-app.mdx,06-custom-document.mdx,07-api-routes.mdx,08-custom-error.mdx}|02-pages/03-building-your-application/02-rendering:{01-server-side-rendering.mdx,02-static-site-generation.mdx,04-automatic-static-optimization.mdx,05-client-side-rendering.mdx}|02-pages/03-building-your-application/03-data-fetching:{01-get-static-props.mdx,02-get-static-paths.mdx,03-get-server-side-props.mdx,05-client-side.mdx}|02-pages/03-building-your-application/06-configuring:{12-error-handling.mdx}|02-pages/04-api-reference:{06-edge.mdx,08-turbopack.mdx}|02-pages/04-api-reference/01-components:{font.mdx,form.mdx,head.mdx,image-legacy.mdx,image.mdx,link.mdx,script.mdx}|02-pages/04-api-reference/02-file-conventions:{instrumentation.mdx,proxy.mdx,public-folder.mdx,src-folder.mdx}|02-pages/04-api-reference/03-functions:{get-initial-props.mdx,get-server-side-props.mdx,get-static-paths.mdx,get-static-props.mdx,next-request.mdx,next-response.mdx,use-params.mdx,use-report-web-vitals.mdx,use-router.mdx,use-search-params.mdx,userAgent.mdx}|02-pages/04-api-reference/04-config/01-next-config-js:{adapterPath.mdx,allowedDevOrigins.mdx,assetPrefix.mdx,basePath.mdx,bundlePagesRouterDependencies.mdx,compress.mdx,crossOrigin.mdx,deploymentId.mdx,devIndicators.mdx,distDir.mdx,env.mdx,exportPathMap.mdx,generateBuildId.mdx,generateEtags.mdx,headers.mdx,httpAgentOptions.mdx,images.mdx,logging.mdx,onDemandEntries.mdx,optimizePackageImports.mdx,output.mdx,pageExtensions.mdx,poweredByHeader.mdx,productionBrowserSourceMaps.mdx,proxyClientMaxBodySize.mdx,reactStrictMode.mdx,redirects.mdx,rewrites.mdx,serverExternalPackages.mdx,trailingSlash.mdx,transpilePackages.mdx,turbopack.mdx,typescript.mdx,urlImports.mdx,useLightningcss.mdx,useTypeScriptCli.mdx,webVitalsAttribution.mdx,webpack.mdx}|02-pages/04-api-reference/04-config:{01-typescript.mdx,02-eslint.mdx}|02-pages/04-api-reference/05-cli:{create-next-app.mdx,next.mdx}|02-pages/04-api-reference/06-adapters:{01-configuration.mdx,02-creating-an-adapter.mdx,03-api-reference.mdx,04-testing-adapters.mdx,05-routing-with-next-routing.mdx,06-implementing-ppr-in-an-adapter.mdx,07-runtime-integration.mdx,08-invoking-entrypoints.mdx,09-output-types.mdx,10-routing-information.mdx,11-use-cases.mdx}|03-architecture:{accessibility.mdx,fast-refresh.mdx,nextjs-compiler.mdx,supported-browsers.mdx}|04-community:{01-contribution-guide.mdx,02-rspack.mdx}<!-- NEXT-AGENTS-MD-END -->
