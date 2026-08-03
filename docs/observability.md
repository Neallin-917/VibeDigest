# Observability Strategy (LangSmith)

VibeDigest uses LangSmith as the single source of truth for LLM and agent tracing. The video pipeline runs LangGraph in-process inside FastAPI; the standalone LangGraph Agent Server is not part of the runtime path.

## Trace Model

Use LangChain tracing config on every LLM or chain call. `backend/utils/trace_utils.py` is the shared helper for stable run names, task grouping, metadata, and tags.

Core fields:

- `run_name`: stable action name, such as `Ingest/Optimize` or `Cognition/Summarize/Generate`
- `session_id`: always the `task_id`, so a task's trace tree is easy to find
- `metadata`: high-cardinality context such as `task_id`, `user_id`, `video_url`, `language`, `model`, `provider`, `phase`, and `chunk_index`
- `tags`: low-cardinality filters such as `env:prod`, `env:dev`, `stage:cognition`, `source:whisper`, `retry`, and `fallback`

## Standard Run Names

- `Task Process`
- `Ingest/Transcribe`
- `Ingest/Optimize`
- `Cognition/Summarize/Plan`
- `Cognition/Summarize/Generate`
- `Translate/Summary`
- `Translate/Transcript`

## Configuration

Configure LangSmith through LangChain-compatible environment variables:

```bash
# Keep tracing disabled in shared local config. Enable it only when the
# LangSmith key and project are valid for the current environment.
LANGCHAIN_TRACING_V2=false
LANGCHAIN_API_KEY=lsv2_...
LANGCHAIN_PROJECT=VibeDigest

# Accepted aliases for compatibility:
LANGSMITH_API_KEY=lsv2_...
LANGSMITH_PROJECT=VibeDigest

# Optional endpoint override:
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
```

Set `LANGCHAIN_TRACING_V2=true` in production or a developer-local override only after confirming the LangSmith key has access to the configured project.

## Implementation Pattern

Pass tracing config to `ainvoke` rather than creating manual spans for normal LLM work.

```python
trace_config = build_trace_config(
    run_name="Cognition/Summarize/Generate",
    task_id=task_id,
    user_id=user_id,
    stage="cognition",
    metadata={
        "language": language,
        "model": model,
        "provider": provider,
        "phase": "generate",
    },
)

response = await llm.ainvoke(messages, config=trace_config)
```

LangChain handles nested trace propagation for async `ainvoke` calls. Use `@traceable` from `langsmith` only for non-LangChain code blocks that need explicit manual tracing.

## Query Examples

- `session_id:<task_id>`: show the trace tree for one video task
- `tags:stage:cognition`: focus on summary-planning and generation work
- `tags:source:whisper`: inspect Whisper-derived transcript tasks
- `run_name:"Cognition/Summarize/Generate"`: filter to summary generation calls
