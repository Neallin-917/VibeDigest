import sys
import os
import asyncio

# Add backend to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from utils.env_loader import load_env  # noqa: E402
load_env()

from config import settings  # noqa: E402
from utils.openai_client import create_chat_model  # noqa: E402

def verify_config():
    print("\n=== 1. Checking Configuration Loading ===")
    print(f"LLM_PROVIDER: {settings.LLM_PROVIDER}")
    print(f"MODEL_ALIAS_SMART (Env): {settings.MODEL_ALIAS_SMART}")
    print(f"MODEL_ALIAS_FAST  (Env): {settings.MODEL_ALIAS_FAST}")
    print(f"Resolved Smart Model:   {settings.MODEL_SMART}")
    print(f"Resolved Fast Model:    {settings.MODEL_FAST}")
    print(f"DEFAULT_TEMPERATURE:   {settings.DEFAULT_TEMPERATURE}")
    print(f"REASONING_TEMPERATURE: {settings.REASONING_TEMPERATURE}")

    mapping_check = "OK" if settings.MODEL_SMART and ("gemini" in settings.MODEL_SMART or "gpt" in settings.MODEL_SMART) else "WARN"
    print(f"Mapping Check: {mapping_check}")

def verify_factory_logic():
    print("\n=== 2. Checking Factory Routing & Temperature ===")

    # Test Smart Model Creation
    smart_name = settings.MODEL_SMART
    temp_smart = settings.get_temperature(smart_name)
    print(f"Smart Model ('{smart_name}') -> Temp Should Be: {settings.REASONING_TEMPERATURE} -> Actual Config: {temp_smart}")

    try:
        model_smart = create_chat_model(smart_name)
        actual_temp = getattr(model_smart, 'temperature', 'N/A')
        print(f"  [SUCCESS] Created Smart Client. Instance Temp: {actual_temp}")
    except Exception as e:
        print(f"  [FAIL] Could not create Smart Client: {e}")

    # Test Fast Model Creation
    fast_name = settings.MODEL_FAST
    temp_fast = settings.get_temperature(fast_name)
    print(f"Fast Model  ('{fast_name}') -> Temp Should Be: {settings.DEFAULT_TEMPERATURE} -> Actual Config: {temp_fast}")

    try:
        model_fast = create_chat_model(fast_name)
        actual_temp = getattr(model_fast, 'temperature', 'N/A')
        print(f"  [SUCCESS] Created Fast Client.  Instance Temp: {actual_temp}")
    except Exception as e:
        print(f"  [FAIL] Could not create Fast Client: {e}")

async def verify_connection():
    print("\n=== 3. Real-World Connection Test (Dry Run) ===")

    fast_model = settings.MODEL_FAST
    if not fast_model:
        print("  [FAIL] No FAST model resolved. Check your configuration.")
        return

    print(f"Attempting to send 'Hello' to model: {fast_model} (Provider: {settings.LLM_PROVIDER})...")
    try:
        model = create_chat_model(fast_model)
        response = await model.ainvoke("Hello, are you operational?")
        print(f"  [SUCCESS] Response: {response.content[:50]}...")
    except Exception as e:
        print(f"  [FAIL] Connection failed: {e}")

if __name__ == "__main__":
    verify_config()
    verify_factory_logic()
    if len(sys.argv) > 1 and sys.argv[1] == "--connect":
        asyncio.run(verify_connection())
    else:
        print("\n(Run with --connect to perform actual API call)")
