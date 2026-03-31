import asyncio
import sys
import os
import uuid
import logging
import argparse

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from utils.env_loader import load_env  # noqa: E402
load_env()

# Import project components
from workflow import build_graph  # noqa: E402
from db_client import DBClient  # noqa: E402
from config import settings  # noqa: E402

# Setup Logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("verify_custom_live")

async def main():
    parser = argparse.ArgumentParser(description="完善的真实 Live Test - 使用自定义 LLM Provider 验证全链路")
    parser.add_argument("--url", default="http://127.0.0.1:8045/v1", help="Custom LLM Base URL")
    parser.add_argument("--key", default="sk-f1b15d7740df413bab703f490e2faf04", help="Custom LLM API Key")
    parser.add_argument("--model", default="gpt-5", help="Model name to use for BOTH tiers in this test")
    parser.add_argument("--video", default="https://www.youtube.com/watch?v=jNQXAC9IVRw", help="YouTube video URL (default: Me at the zoo)")
    parser.add_argument("--skip-llm-check", action="store_true", help="Skip the initial LLM connection check")
    
    args = parser.parse_args()

    print("\n" + "="*60)
    print("🚀 VibeDigest Real-World Verification (Custom Provider)")
    print("="*60)

    # 1. Override Settings
    print(f"🔧 配置覆盖:")
    print(f"   Provider:  custom")
    print(f"   Base URL:  {args.url}")
    print(f"   Model:     {args.model}")
    
    settings.LLM_PROVIDER = "custom"
    settings.OPENAI_BASE_URL = args.url
    settings.OPENAI_API_KEY = args.key
    settings.MODEL_ALIAS_SMART = args.model
    settings.MODEL_ALIAS_FAST = args.model

    # 2. Pre-flight Check: LLM
    if not args.skip_llm_check:
        print("\n🧪 正在执行 LLM 连通性预检...")
        from utils.openai_client import create_chat_model
        from langchain_core.messages import HumanMessage
        try:
            test_llm = create_chat_model(args.model, temperature=0.1)
            response = await test_llm.ainvoke([HumanMessage(content="Hello")])
            print(f"   ✅ LLM 预检通过! 响应长度: {len(response.content)}")
        except Exception as e:
            print(f"   ❌ LLM 预检失败: {e}")
            print("   💡 请检查 URL 和 Key 是否正确，以及该模型是否可用。")
            return

    # 3. DB Check
    db = DBClient()
    print("\n📦 正在检查数据库连接...")
    try:
        # Get a test user or the first user
        users = db._execute_query("SELECT id FROM profiles LIMIT 1")
        if not users:
            print("   ❌ 数据库中没有用户，无法创建测试任务。")
            return
        user_id = users[0]['id']
        print(f"   ✅ 数据库连接正常。使用用户 ID: {user_id}")
    except Exception as e:
        print(f"   ❌ 数据库连接失败: {e}")
        return

    # 4. Create Task
    video_url = args.video
    print(f"\n🎬 正在创建测试任务: {video_url}")
    try:
        task = db.create_task(user_id=user_id, video_url=video_url, video_title="Custom Provider Live Test")
        task_id = task['id']
        print(f"   ✅ 任务已创建: {task_id}")
    except Exception as e:
        print(f"   ❌ 创建任务失败: {e}")
        return

    # 5. Build and Run Workflow
    print("\n🚀 正在启动 LangGraph 工作流 (下载 -> 转录 -> AI 总结)...")
    print("   (这通常需要 30-90 秒，取决于网络和视频长度)")
    
    app = build_graph()
    inputs = {
        "task_id": task_id,
        "user_id": user_id,
        "video_url": video_url,
        "is_youtube": True,
        "cache_hit": False,
        "errors": [],
    }
    
    try:
        final_state = await app.ainvoke(inputs)
        
        print("\n" + "-"*60)
        print("🏁 工作流运行结束!")
        print("-"*60)
        
        # Verify Results
        transcript = final_state.get('transcript_text', '')
        summary = final_state.get('final_summary_json', {})
        classification = final_state.get('classification_result', {})
        
        if transcript:
            print(f"✅ 转录完成! (长度: {len(transcript)})")
        else:
            print("❌ 转录失败 (内容为空)")
            
        if summary:
            print(f"✅ AI 总结完成!")
            # print(f"   预览: {str(summary)[:150]}...")
        else:
            print("❌ AI 总结缺失")
            
        if classification:
            print(f"✅ 内容分类完成: {classification.get('category', 'Unknown')}")
            
        # 6. Verify DB Persistence
        print("\n💾 正在验证数据库持久化...")
        outputs = db.get_task_outputs(task_id)
        kinds = [o['kind'] for o in outputs]
        print(f"   保存的输出类型: {kinds}")
        
        expected = {'script', 'classification', 'summary'}
        if expected.issubset(set(kinds)):
             print("🌟 全链路验证成功! 任务已正确保存到数据库。")
        else:
             print(f"⚠️  部分输出未找到: {expected - set(kinds)}")
             
    except Exception as e:
        print(f"\n💥 工作流运行崩溃: {e}")
        import traceback
        traceback.print_exc()

    print("\n" + "="*60)
    print("✨ 测试结束")
    print("="*60 + "\n")

if __name__ == "__main__":
    asyncio.run(main())
