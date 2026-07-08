# Configuration Codemap

> Last Verified: 2026-04-01
> Scope: runtime configuration and provider-routing rules

## Environment Variables

### Required (Production)

| Variable | Description | Example |
|----------|-------------|---------|
| `SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_KEY` | Supabase anon key | `eyJ...` |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | `eyJ...` |
| `OPENROUTER_API_KEY` | Required when `OPENAI_BASE_URL` is unset and text LLM traffic uses OpenRouter | `sk-or-...` |

### Required For Custom Text Routing

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_BASE_URL` | Enables `custom` text routing when present | `http://localhost:8317/v1` |
| `OPENAI_API_KEY` | Required when `OPENAI_BASE_URL` is set | `sk-...` |

### Optional (Features)

| Variable | Default | Description |
|----------|---------|-------------|
| `FRONTEND_URL` | `http://localhost:3000` | Frontend base URL |
| `OPENAI_BASE_URL` | (none) | When set, routes text LLM calls to a custom OpenAI-compatible endpoint |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | OpenRouter endpoint override |
| `MODEL_ALIAS_SMART` | provider default | Smart tier model override |
| `MODEL_ALIAS_FAST` | provider default | Fast tier model override |
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
| `LANGCHAIN_TRACING_V2` | `false` | Enables LangSmith tracing through LangChain |
| `LANGCHAIN_API_KEY` / `LANGSMITH_API_KEY` | (none) | LangSmith API key |
| `LANGCHAIN_PROJECT` / `LANGSMITH_PROJECT` | `default` | LangSmith project name |
| `LANGCHAIN_ENDPOINT` / `LANGSMITH_ENDPOINT` | `https://api.smith.langchain.com` | LangSmith endpoint |
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
| `ALLOWED_ORIGINS` | `https://vibedigest.io,https://www.vibedigest.io,http://localhost:3000` | Comma-separated allowed origins |

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
    LLM_PROVIDER: str           # computed: "custom" if OPENAI_BASE_URL else "openrouter"
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
│                Text Provider Resolution                     │
│                                                             │
│  OPENAI_BASE_URL set   -> custom                            │
│  OPENAI_BASE_URL unset -> openrouter                        │
│                                                             │
│  openrouter defaults: smart=google/gemini-3-pro-preview    │
│                       fast=google/gemini-3-flash-preview    │
│  custom defaults:     smart=gemini-3-pro-preview           │
│                       fast=gemini-3-flash-preview           │
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
- Provider-selection SSOT is the runtime rule: `OPENAI_BASE_URL` present => `custom`, otherwise `openrouter`.
- Provider default model-name SSOT is `/config/llm-provider-defaults.json`.
- Backend and frontend only consume those rules via `config.settings`, `utils.llm_router`, `utils.openai_client`, `frontend/src/lib/llm-model-registry.ts`, and `frontend/src/lib/llm-config.ts`.
- Direct video URL submission bypasses the chat LLM path and goes straight to task creation; only chat Q&A and follow-up messages use text models.

Shared provider defaults and routing:
- Provider default model IDs are defined once in `/config/llm-provider-defaults.json` and consumed by both backend and frontend.
- Provider selection is also shared: when `OPENAI_BASE_URL` exists the app uses `custom`, otherwise it uses `openrouter`.
- For `custom` providers, prefer setting `MODEL_ALIAS_SMART` and `MODEL_ALIAS_FAST` per environment because local proxies often expose slightly different model IDs than production providers.
- For OpenAI-compatible endpoints, set `OPENAI_BASE_URL` to the API root including `/v1` (for example `http://localhost:8317/v1`) unless the proxy explicitly documents a different base path.

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
NEXT_PUBLIC_API_URL=http://localhost:16081

# Sentry (optional)
NEXT_PUBLIC_SENTRY_DSN=https://...

# Feature Flags
NEXT_PUBLIC_ENABLE_CHAT=true
```

**`.env.local`** (secrets, NOT committed):
```bash
OPENROUTER_API_KEY=sk-or-...
OPENAI_BASE_URL=http://localhost:8317/v1  # optional; enables custom routing when present
OPENAI_API_KEY=sk-...                     # required only if OPENAI_BASE_URL is set
MODEL_ALIAS_SMART=claude-sonnet-4-6
MODEL_ALIAS_FAST=claude-haiku-4-5-20251001
TEST_USER_PASSWORD=...
```

---

## Environment Comparison

| Variable | Local Dev | Production |
|----------|-----------|------------|
| `FRONTEND_URL` | `http://localhost:3000` | `https://www.vibedigest.io` |
| `CREEM_API_BASE` | `https://test-api.creem.io` | `https://api.creem.io` |
| `LOG_LEVEL` | `DEBUG` | `INFO` |
| `MOCK_MODE` | `true` (optional) | `false` |
| `COGNITION_SEQUENTIAL` | `true` | `true` |
