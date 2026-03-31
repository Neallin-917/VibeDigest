# Configuration Codemap

> Freshness: 2025-01-23T22:30:00Z

## Environment Variables

### Required (Production)

| Variable | Description | Example |
|----------|-------------|---------|
| `SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_KEY` | Supabase anon key | `eyJ...` |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | `eyJ...` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |

### Optional (Features)

| Variable | Default | Description |
|----------|---------|-------------|
| `FRONTEND_URL` | `http://localhost:3000` | Frontend base URL |
| `LLM_PROVIDER` | `openrouter` | Text LLM provider (`openrouter`, `openai`, `custom`) |
| `OPENAI_BASE_URL` | (none) | Custom OpenAI-compatible endpoint |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | OpenRouter endpoint override |
| `MODEL_ALIAS_SMART` | `google/gemini-3-pro-preview` | Smart tier model override |
| `MODEL_ALIAS_FAST` | `google/gemini-3-flash-preview` | Fast tier model override |
| `OPENAI_AUDIO_BASE_URL` | (none) | Optional dedicated audio endpoint |
| `OPENAI_AUDIO_API_KEY` | (none) | Optional dedicated audio API key |
| `OPENAI_TRANSCRIPTION_MODEL` | `whisper-1` | ASR model |

### Payments

| Variable | Default | Description |
|----------|---------|-------------|
| `CREEM_API_KEY` | (none) | Creem payment API key |
| `CREEM_WEBHOOK_SECRET` | (none) | Creem webhook signature secret |
| `CREEM_API_BASE` | `https://api.creem.io` | Creem API endpoint |
| `COINBASE_API_KEY` | (none) | Coinbase Commerce API key |
| `COINBASE_WEBHOOK_SECRET` | (none) | Coinbase webhook secret |

### Observability

| Variable | Default | Description |
|----------|---------|-------------|
| `LANGFUSE_PUBLIC_KEY` | (none) | Langfuse public key |
| `LANGFUSE_SECRET_KEY` | (none) | Langfuse secret key |
| `LANGFUSE_HOST` | `https://cloud.langfuse.com` | Langfuse endpoint |
| `SENTRY_DSN` | (none) | Sentry error tracking DSN |
| `LOG_LEVEL` | `INFO` | Python logging level |

### Feature Flags

| Variable | Default | Description |
|----------|---------|-------------|
| `MOCK_MODE` | `false` | Enable mock responses (testing) |
| `COGNITION_SEQUENTIAL` | `true` | Run classify/summarize sequentially |
| `COGNITION_DELAY` | `0.0` | Delay between cognition steps (seconds) |
| `SUMMARY_STRATEGY` | `legacy` | Summary strategy (`legacy`, `v2_classified`) |

### CORS

| Variable | Default | Description |
|----------|---------|-------------|
| `ALLOWED_ORIGINS` | `https://vibedigest.io,http://localhost:3000` | Comma-separated allowed origins |

---

## Settings Class (config.py)

```python
class Settings:
    # Services
    FRONTEND_URL: str
    SUPABASE_URL: str
    SUPABASE_KEY: str
    SUPABASE_SERVICE_KEY: str

    # LLM Configuration
    LLM_PROVIDER: str           # "openrouter" | "openai" | "custom"
    OPENAI_BASE_URL: Optional[str]
    OPENAI_API_KEY: Optional[str]
    OPENROUTER_BASE_URL: Optional[str]
    OPENAI_AUDIO_BASE_URL: Optional[str]
    OPENAI_AUDIO_API_KEY: Optional[str]
    MODEL_ALIAS_SMART: str      # Smart tier override
    MODEL_ALIAS_FAST: str       # Fast tier override

    # Temperature Routing
    DEFAULT_TEMPERATURE: float = 0.1
    REASONING_TEMPERATURE: float = 1.0

    # Token Limits
    DEFAULT_MAX_TOKENS: int = 4000
    SHORT_TASK_MAX_TOKENS: int = 1000
    LONG_TASK_MAX_TOKENS: int = 16000

    def get_temperature(self, model_name: str) -> float:
        """Smart routing: reasoning models use temp=1.0"""
```

---

## Model Routing

```
┌─────────────────────────────────────────────────────────────┐
│                    LLM_PROVIDER                             │
│                                                             │
│  openrouter (default): smart=google/gemini-3-pro-preview   │
│                         fast=google/gemini-3-flash-preview  │
│  openai:                smart=gpt-5                         │
│                         fast=gpt-5-mini                     │
│  custom:                smart=gemini-3-pro                 │
│                         fast=gemini-3-flash                │
└─────────────────────────────────────────────────────────────┘

Usage Mapping:
┌────────────────────┬────────────────────┐
│ Use Case           │ Model Alias        │
├────────────────────┼────────────────────┤
│ Chat               │ MODEL_ALIAS_SMART  │
│ Comprehension      │ MODEL_ALIAS_SMART  │
│ Summarization      │ MODEL_ALIAS_SMART  │
│ Translation        │ MODEL_ALIAS_FAST   │
│ Helper Tasks       │ MODEL_ALIAS_FAST   │
│ Classification     │ MODEL_ALIAS_FAST   │
│ Transcript Cleanup │ MODEL_ALIAS_FAST   │
│ Transcription      │ whisper-1          │
└────────────────────┴────────────────────┘
```

Runtime SSOT:
- Backend text model resolution lives in `config.settings`, `utils.llm_router`, and `utils.openai_client`.
- Frontend chat model resolution lives in `frontend/src/app/api/chat/route.ts` plus `frontend/src/lib/llm-config.ts`.
- Direct video URL submission bypasses the chat LLM path and goes straight to task creation; only chat Q&A and follow-up messages use text models.

---

## Pricing Configuration

```python
PRICES = {
    "CREDIT_PACK": PriceConfig(
        id="prod_5VVI5ldN9dtI7tbHaST5OB",
        amount=5.00,
        name="50 Credits Top-up",
        credits=50,
        mode='payment'
    ),
    "PRO_MONTHLY": PriceConfig(
        id="prod_5XoWWMZN6ptDexocrwyqT0",
        amount=9.90,
        name="Pro Plan (1 Month)",
        mode='subscription'
    ),
    "PRO_ANNUAL": PriceConfig(
        id="prod_1pLnYf7AwktcAhRhkjiJTh",
        amount=99.00,
        name="Pro Plan (1 Year)",
        mode='subscription'
    )
}
```

---

## Frontend Environment (.env.production + .env.local)

**`.env.production`** (shared config, committed to Git):
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Backend
NEXT_PUBLIC_API_URL=http://localhost:16080

# Sentry (optional)
NEXT_PUBLIC_SENTRY_DSN=https://...

# Feature Flags
NEXT_PUBLIC_ENABLE_CHAT=true
```

**`.env.local`** (secrets, NOT committed):
```bash
OPENAI_API_KEY=sk-...
TEST_USER_PASSWORD=...
```

---

## Environment Comparison

| Variable | Local Dev | Production |
|----------|-----------|------------|
| `FRONTEND_URL` | `http://localhost:3000` | `https://vibedigest.io` |
| `CREEM_API_BASE` | `https://test-api.creem.io` | `https://api.creem.io` |
| `LOG_LEVEL` | `DEBUG` | `INFO` |
| `MOCK_MODE` | `true` (optional) | `false` |
| `COGNITION_SEQUENTIAL` | `true` | `true` |
