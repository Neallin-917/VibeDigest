import sys
import os
from unittest.mock import patch

# Add backend to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from config import settings
from utils.openai_client import create_chat_model

def test_default_provider():
    print("Testing Default Text Provider Routing...")
    try:
        model = create_chat_model(settings.MODEL_FAST)
        print(f"Success! Returned object type: {type(model).__name__}")
        # Check specific attributes if possible, e.g. base_url
        if hasattr(model, 'openai_api_base'):
            print(f"Base URL: {model.openai_api_base}")
        elif hasattr(model, 'base_url'): # Newer langchain_openai
             print(f"Base URL: {model.base_url}")
    except Exception as e:
        print(f"FAILED: {e}")

def test_custom_provider_logic():
    print("\nTesting Custom Provider Logic (Simulation)...")
    # We can't actually instantiate ChatLiteLLM if it's not installed,
    # but we can check if the factory follows the custom path when OPENAI_BASE_URL exists.
    with patch.object(settings, 'OPENAI_BASE_URL', 'http://localhost:8317/v1'), \
         patch.object(settings, '_llm_provider_override', None):
        try:
            # This is expected to fail if litellm is not installed,
            # proving it tries to go down that path.
            create_chat_model("gpt-4o")
            print("Unexpected success (Litellm installed?)")
        except ImportError:
            print("Success! Caught expected ImportError for ChatLiteLLM (Proves logic path was taken)")
        except Exception as e:
            print(f"Caught exception: {type(e).__name__}: {e}")

if __name__ == "__main__":
    test_default_provider()
    test_custom_provider_logic()
