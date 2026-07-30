# Agent Plugin Codemap

> Last Verified: 2026-07-09
> Scope: Codex plugin incubation and video intake gateway boundaries

## Purpose

The `agent-plugin/` directory incubates a Codex plugin that lets agents fetch reliable video context from a URL without re-learning provider-specific transcript workflows on every task.

## Layering

```text
Codex request
  -> Skill instructions
  -> MCP tool call
  -> CLI bridge
  -> backend.services.video_intake.VideoIntakeGateway
  -> Supadata / direct captions / optional ASR
```

## Ownership

| Layer | Path | Owns |
| --- | --- | --- |
| Plugin manifest | `agent-plugin/.codex-plugin/plugin.json` | Installable Codex plugin metadata |
| MCP config | `agent-plugin/.mcp.json` | Local MCP server registration |
| MCP server | `agent-plugin/mcp/server.mjs` | `get_video_context` tool surface |
| Skill | `agent-plugin/skills/vibedigest-video-intake/SKILL.md` | Agent workflow and source-quality rules |
| CLI bridge | `agent-plugin/bin/video_intake_cli.py` | Local bridge from Node MCP to Python gateway |
| Gateway | `backend/services/video_intake/` | Credential-aware provider fallback and unified output schema |
| Tests | `backend/tests/test_video_intake_gateway.py` | Mocked gateway behavior, no paid API calls |

## Secret Boundary

The plugin package must not contain API keys, cookies, or long-lived credentials. Runtime secrets are read by the backend gateway from environment variables such as `SUPADATA_API_KEY`, `OPENAI_API_KEY`, `OPENAI_AUDIO_API_KEY`, and `YTDLP_COOKIE_FILE`.

## Fallback Strategy

1. Normalize the input URL.
2. Extract metadata with `yt-dlp` info-only mode.
3. For YouTube, try Supadata first.
4. For YouTube, fall back to direct VTT/caption extraction.
5. Try ASR only when `allow_asr=true`.
6. Return structured warnings and errors instead of making Codex guess the next command.

## Output Contract

`get_video_context` returns normalized metadata, `status`, `source`, `quality`, timestamped `transcript` segments, Markdown transcript, warnings, errors, and provider attempts.
