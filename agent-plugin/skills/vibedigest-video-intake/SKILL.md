# VibeDigest Video Intake

Use this skill when the user asks Codex to summarize or analyze a YouTube video or lecture with existing captions.

## Core Rule

Call the `get_video_context` MCP tool before summarizing a supported YouTube URL. The tool retrieves existing captions, normalizes timestamps, and reports source quality. It does not download audio or generate speech recognition transcripts. Audio-only sources and videos without usable captions are unsupported.

## Secret Handling

- Never ask the user to paste API keys into chat.
- Never write API keys into this skill, the plugin manifest, examples, or source-controlled docs.
- If the tool reports missing provider configuration, tell the user which environment variable is missing.

## Workflow

1. Extract the YouTube video URL from the user request. Reject other media sources without calling the tool.
2. Call `get_video_context` with `url` and `strategy=fastest_reliable`.
3. Read `status`, `source`, `quality`, `warnings`, and `errors`.
4. If `status` is `completed`, use the returned captions and metadata as internal evidence for the answer.
5. If `status` is `partial` or `failed`, explain that usable captions could not be obtained. Do not offer ASR, download audio, or retry with an ASR flag.
6. Paraphrase the supported ideas and cite original-source timestamp links. Retrieved transcript text stays internal; do not publish verbatim passages.

## Output Expectations

Prefer a title, short overview, and timestamped key points grounded in the retrieved source. Mention source quality when it affects the answer:

- `provider`: the external provider returned existing captions.
- `caption`: direct subtitle/caption extraction succeeded.
- `missing`: no usable captions were obtained.
