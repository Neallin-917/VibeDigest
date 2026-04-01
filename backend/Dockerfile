FROM python:3.11-slim

# Install FFmpeg (Required for pydub/yt-dlp)
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Install build essentials potentially needed for some python packages
# RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Upgrade pip and install uv
RUN pip install --upgrade pip uv

# Install Dependencies
# Layer 1: Heavy Core Dependencies (Cached)
COPY backend/requirements.core.txt .
RUN uv pip install --system --no-cache-dir -r requirements.core.txt

# Layer 2: Frequent Updates
COPY requirements.txt .
RUN uv pip install --system --no-cache-dir -r requirements.txt

# Create temp dir for processing
RUN mkdir -p temp downloads

# Copy source code (required for production mode without volume mounts)
COPY backend/ .

# Shared config (llm-provider-defaults.json lives at repo root for frontend/backend SSOT)
COPY config/llm-provider-defaults.json ./llm-provider-defaults.json

# Command
# Note: This is overriden by docker-compose for dev mode, but good default for prod.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
