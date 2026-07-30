# VibeDigest Video Intake Plugin

This directory is the Codex plugin incubator for VibeDigest's agent-facing video intake workflow.

The plugin is intentionally split into three layers:

- Skill: `skills/vibedigest-video-intake/SKILL.md` tells Codex when and how to use the tool.
- MCP server: `mcp/server.mjs` exposes `get_video_context(url)` to Codex.
- Gateway: `../backend/services/video_intake/` owns provider fallback and credential-aware execution.

## What It Does

`get_video_context` returns:

- normalized URL and platform
- video metadata
- source quality
- timestamped transcript segments
- Markdown transcript
- warnings, errors, and provider attempts

## Secret Model

Do not put secrets in this plugin package. Configure provider credentials through the normal runtime environment:

```env
SUPADATA_API_KEY=...
OPENAI_API_KEY=...
OPENAI_AUDIO_API_KEY=...
YTDLP_COOKIE_FILE=/absolute/path/to/cookies.txt
```

ASR is disabled by default. Calls that need audio download and transcription must pass `allow_asr=true`.

## Local MCP Smoke

From the repository root:

```bash
uv run python agent-plugin/bin/video_intake_cli.py get-video-context --url "https://youtube.com/watch?v=dQw4w9WgXcQ"
```

To test the MCP server protocol manually:

```bash
cd agent-plugin
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | node mcp/server.mjs
```

If this plugin is installed outside the VibeDigest monorepo, set:

```env
VIBEDIGEST_REPO_ROOT=/absolute/path/to/VibeDigest
```
