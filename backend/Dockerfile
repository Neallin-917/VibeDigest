FROM ghcr.io/astral-sh/uv:0.11.6 AS uv
FROM python:3.12.13-slim-bookworm

COPY --from=uv /uv /uvx /bin/

# Install FFmpeg (Required for pydub/yt-dlp)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install the exact production dependency graph into an isolated environment.
ENV UV_PROJECT_ENVIRONMENT=/opt/vibedigest
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
ENV PATH="/opt/vibedigest/bin:${PATH}"

# Copy source code (required for production mode without volume mounts)
COPY backend/ .

# Shared config (llm-provider-defaults.json lives at repo root for frontend/backend SSOT)
COPY config/llm-provider-defaults.json ./llm-provider-defaults.json

RUN groupadd --system --gid 10001 vibedigest \
    && useradd --system --uid 10001 --gid vibedigest --home-dir /app vibedigest \
    && mkdir -p temp downloads \
    && chown -R vibedigest:vibedigest /app /opt/vibedigest

USER vibedigest

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
