# Observability Strategy (LangSmith)

This document outlines the observability strategy for AI Video Transcriber using [LangSmith](https://smith.langchain.com/). The goal is to provide granular visibility into the AI pipeline, enabling effective debugging, performance monitoring, and cost analysis.

## Core Concepts

We adopt a structured approach to tracing, leveraging LangSmith's native concepts of **Runs**, **Metadata**, and **Tags**.

### 1. Run Name (Action)
Describes **WHAT** is being done. Keep these stable and verb-based.

Primary run names (current standard):
*   `Task Process`
*   `Ingest/Transcribe`
*   `Ingest/Optimize`
*   `Cognition/Summarize/Plan`
*   `Cognition/Summarize/Generate`
*   `Cognition/Classify`
*   `Cognition/Comprehension`
*   `Translate/Summary`
*   `Translate/Transcript`

### 2. Metadata (Context & Parameters)
Describes **WHO** and **HOW** the action was performed. Use this for high-cardinality data.

*   `task_id`: Groups all operations for a single video.
*   `user_id`: Tracks usage patterns per user.
*   `target_language`: e.g., "zh", "en".
*   `video_duration`: Length of the input video.
*   `model`: e.g., "google/gemini-3-pro-preview", "gpt-5-mini".
*   `chunk_index`: For multi-chunk processing.

### 3. Tags (State/Environment)
Describes **STATUS** or **ENVIRONMENT**. Use this for low-cardinality grouping.

*   `env:prod` / `env:dev`: Environment markers.
*   `stage:ingest|cognition|translate`: Pipeline stage.
*   `source:whisper|supadata`: Transcript source.
*   `retry`: Indicates a retry attempt.
*   `fallback`: Indicates usage of a fallback model.

## Trace Schema (Standardized)
We standardize LangSmith config fields to keep traces searchable and consistent.

**Core Fields**
*   `run_name`: Stable action name (see list above)
*   `session_id`: Always set to `task_id` for grouping
*   `metadata`: High-cardinality data (task/user/video/model/language/phase)
*   `tags`: Low-cardinality filters (env/stage/source)

**Required Metadata Keys**
*   `task_id`, `user_id`, `video_url`, `language`
*   `model`, `provider`, `phase`, `planned_sections`, `chunk_index`

## Query Examples (LangSmith UI)
*   `session_id:<task_id>` — show full trace for a task
*   `tags:stage:cognition` — focus on cognition runs
*   `tags:source:whisper` — view Whisper-derived tasks
*   `run_name:"Cognition/Summarize/Generate"` — only summary generation runs

## Configuration

LangSmith is integrated via LangChain's built-in tracing. Configure it using environment variables in `.env`:

```bash
# Enable Tracing
LANGCHAIN_TRACING_V2=true

# API Key
LANGCHAIN_API_KEY=lsv2_...

# Project Name (Optional, defaults to "default")
LANGCHAIN_PROJECT=ai-video-transcriber
```

## Implementation Guide

We use LangChain's `ainvoke` method, which accepts a `config` dictionary to pass tracing information. This removes the need for manual span management in most cases.

### Component Calls

When invoking an LLM or Chain, provide the `run_name` and `metadata` in the `config` argument.

```python
# Prepare trace configuration
trace_config = {
    "run_name": "Summary Generation",
    "metadata": {
        "task_id": "123-abc",
        "user_id": "user-456",
        "language": "zh",
        "video_duration": 300
    },
    "tags": ["prod", "summary"]
}

# Invoke the model with config
response = await llm.ainvoke(
    messages, 
    config=trace_config
)
```

### Trace Inheritance
LangChain automatically handles trace nesting. If you call `ainvoke` within another traced run, it will automatically be attached as a child run, provided the context is propagated correctly (which `asyncio` handles naturally in most Python environments).

### Custom / Manual Tracing
For non-LangChain code blocks, you can use the `@traceable` decorator from `langsmith` if needed, but our primary pattern is to wrap logic in LangChain runnables or pass config to `ainvoke`.
