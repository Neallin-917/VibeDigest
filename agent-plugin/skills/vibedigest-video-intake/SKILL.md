# VibeDigest Video Intake

Use this skill when the user asks Codex to fetch, transcribe, summarize, quote, or analyze a video, podcast, lecture, or other URL-based media source.

## Core Rule

Call the `get_video_context` MCP tool before trying ad hoc browser scraping, raw `yt-dlp`, manual audio download, or paid ASR. The tool owns provider fallback, URL normalization, metadata extraction, timestamp normalization, and source quality labels.

## Secret Handling

- Never ask the user to paste API keys into chat.
- Never write API keys into this skill, the plugin manifest, examples, or source-controlled docs.
- If the tool reports missing provider configuration, tell the user which environment variable is missing.
- Use `allow_asr=false` first unless the user explicitly asks for full extraction at any cost, accepts slower processing, or captions/transcripts are unavailable and ASR is the only remaining route.

## Workflow

1. Extract the media URL from the user request.
2. Call `get_video_context` with:
   - `url`: the media URL
   - `strategy`: `fastest_reliable`
   - `allow_asr`: `false` by default
3. Read `status`, `source`, `quality`, `warnings`, and `errors`.
4. If `status` is `completed`, use the returned `markdown`, `transcript`, and `metadata` as the factual base.
5. If `status` is `partial` or `failed` and the user needs complete coverage, call `get_video_context` again with `allow_asr=true` only when ASR cost and runtime are acceptable.
6. When summarizing, cite timestamps from `transcript` where possible.

## Output Expectations

Prefer compact, useful artifacts:

- For summaries: title, source quality, short overview, timestamped key points.
- For research notes: metadata, chapter-style sections, notable quotes with timestamps.
- For transcript requests: cleaned Markdown transcript with timestamps preserved.

Always mention source quality when it matters:

- `provider`: external transcript provider returned structured segments.
- `caption`: direct subtitle/caption extraction succeeded.
- `asr`: audio was transcribed, likely slower and costlier.
- `missing`: no usable transcript source was found.
