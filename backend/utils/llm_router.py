from typing import Any, Dict, Optional

from config import settings
from utils.openai_client import create_chat_model, ainvoke_structured_json


FAST_INTENTS = frozenset({
    "translation", "guard", "helper", "transcript_optimize",
    "paragraph", "json_repair", "classifier",
})


def resolve_model_for_intent(intent: str, provider: Optional[str] = None) -> str:
    return settings.MODEL_FAST if intent in FAST_INTENTS else settings.MODEL_SMART


def create_chat_model_for_intent(
    intent: str,
    *,
    model_name: Optional[str] = None,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
    model_kwargs: Optional[Dict[str, Any]] = None,
) -> Any:
    resolved_model = model_name or resolve_model_for_intent(intent)
    return create_chat_model(
        model_name=resolved_model,
        temperature=temperature,
        max_tokens=max_tokens or settings.DEFAULT_MAX_TOKENS,
        model_kwargs=model_kwargs or {},
    )


async def invoke_structured(
    llm: Any,
    schema: Any,
    messages: list[Any],
    *,
    config: Optional[dict] = None,
) -> dict:
    return await ainvoke_structured_json(
        llm=llm,
        schema=schema,
        messages=messages,
        config=config,
    )
