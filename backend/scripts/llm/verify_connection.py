import sys
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add backend directory to sys.path to ensure we can import config and utils
# Assuming this script is in backend/scripts/
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(backend_dir)

# Load environment variables for local testing
try:
    from dotenv import load_dotenv
    # backend_dir is .../backend, so project root is one level up
    project_root = os.path.dirname(backend_dir)
    env_path = os.path.join(project_root, '.env')
    env_local_path = os.path.join(project_root, '.env.local')
    
    if os.path.exists(env_path):
        load_dotenv(env_path)
        print(f"✅ Loaded .env from {project_root}")
    
    if os.path.exists(env_local_path):
        load_dotenv(env_local_path, override=True)
        print(f"✅ Loaded .env.local from {project_root} (overriding defaults)")
        
except ImportError:
    print("⚠️  python-dotenv not installed. Skipping .env loading.")

try:
    from config import settings
    from utils.openai_client import create_chat_model
    from utils.provider_diagnostics import provider_failure_message, safe_provider_endpoint
    from langchain_core.messages import HumanMessage
except ImportError as e:
    print(f"Error importing modules: {e}")
    sys.exit(1)

def verify_llm():
    print("----------------------------------------------------------------")
    print("🔍 Testing LLM Connection inside Docker")
    print("----------------------------------------------------------------")
    print("Configuration:")
    print(f"  Provider:     {settings.LLM_PROVIDER}")
    print(f"  Base URL:     {safe_provider_endpoint(settings.OPENAI_BASE_URL)}")
    print("  API Key:      <configured>" if settings.OPENAI_API_KEY else "  API Key:      <not configured>")
    print(f"  Model (Fast): {settings.MODEL_ALIAS_FAST}")
    print("----------------------------------------------------------------")

    try:
        print("🚀 Initializing Chat Model...")
        # Use a low temperature for deterministic test
        chat = create_chat_model(settings.MODEL_ALIAS_FAST, temperature=0.1)
        
        print("📨 Sending Test Message: 'Hello, verify connectivity.'")
        messages = [HumanMessage(content="Hello, verify connectivity.")]
        
        response = chat.invoke(messages)
        
        print("----------------------------------------------------------------")
        print("✅ Response Received:")
        print(f"{response.content}")
        print("----------------------------------------------------------------")
        print("✅ LLM Connection Successful!")
        return True

    except Exception as error:
        print("----------------------------------------------------------------")
        print("❌ LLM Connection Failed!")
        print(f"Error Message: {provider_failure_message(error)}")
        print("----------------------------------------------------------------")
        
        # Check for common networking issues
        if "Connection refused" in str(error):
            print("params: Connection refused. Check whether the LLM service is reachable at the configured endpoint.")
            if "host.docker.internal" in (settings.OPENAI_BASE_URL or ""):
                print("Hint: You are using host.docker.internal. Ensure usage from inside Docker works.")
        return False

if __name__ == "__main__":
    success = verify_llm()
    if not success:
        sys.exit(1)
