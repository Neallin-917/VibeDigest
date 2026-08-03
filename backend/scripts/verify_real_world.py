import asyncio
import sys
import os
import uuid
import logging

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from utils.env_loader import load_env  # noqa: E402
load_env()

# Import workflow
from workflow import build_graph  # noqa: E402
from db_client import DBClient  # noqa: E402

# Setup Logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def main():
    print("--- REAL WORLD VERIFICATION START ---")
    
    # Check Env
    if not os.getenv("OPENAI_API_KEY"):
        print("❌ OPENAI_API_KEY missing!")
        return
    if not os.getenv("DATABASE_URL"):
        print("❌ DATABASE_URL missing!")
        return
        
    # Init Graph
    app = build_graph()
    
    # Init DB (Separate instance for verification queries)
    db = DBClient()
    
    # Test Data
    # "Me at the zoo" - 19 seconds. Safe for quick test.
    video_url = "https://www.youtube.com/watch?v=jNQXAC9IVRw" 
    user_id = "00000000-0000-0000-0000-000000000001" # Test User
    task_id = str(uuid.uuid4())
    
    print(f"🎬 Target Video: {video_url}")
    print(f"🆔 Task ID: {task_id}")
    
    # Create Task in DB First (workflow expects task to exist for updates)
    print("📝 Creating Initial Task in DB...")
    try:
        task = db.create_task(user_id=user_id, video_url=video_url, video_title="Real World Test")
        if task:
            print(f"✅ Task Created: {task['id']}")
            # Update our task_id to match DB if create_task returned one (it returns the row)
            task_id = task['id'] 
        else:
            print("❌ Failed to create task in DB.")
            return
    except Exception as e:
        print(f"❌ DB Error: {e}")
        return

    # Input State
    inputs = {
        "task_id": task_id,
        "user_id": user_id,
        "video_url": video_url,
        "is_youtube": True,
        "cache_hit": False,
        "errors": [],
        # Metadata placeholders
        "video_title": "",
        "thumbnail_url": "",
        "author": "",
        "duration": 0
    }
    
    print("🚀 Invoking Workflow (This may take 30-60s)...")
    
    try:
        final_state = await app.ainvoke(inputs)
        
        print("\n--- RESULTS ---")
        print(f"📝 Transcript Source: {final_state.get('transcript_source')}")
        print(f"📜 Transcript Length: {len(final_state.get('transcript_text', ''))}")
        
        # Check Cognition Results
        if "final_summary_json" in final_state:
            print("✅ Summary Generated!")
            print(f"📄 Summary Preview: {str(final_state['final_summary_json'])[:100]}...")
        else:
            print("❌ Summary Missing!")
            
        # Check DB Persistence
        print("\n🔍 Verifying DB Persistence...")
        outputs = db.get_task_outputs(task_id)
        kinds = [o['kind'] for o in outputs]
        print(f"💾 Saved Outputs: {kinds}")
        
        expected = {'script', 'summary'}
        if expected.issubset(set(kinds)):
             print("✅ DB Persistence Verified (All Expected Outputs Found)")
        else:
             print(f"⚠️  Missing Outputs: {expected - set(kinds)}")
             
        print("\n--- REAL WORLD VERIFICATION COMPLETE ---")
        
    except Exception as e:
        print(f"\n❌ Workflow Failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
