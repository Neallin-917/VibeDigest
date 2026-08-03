import asyncio
import sys
import os
import json
import logging
from pathlib import Path

sys.path.append(os.path.join(os.getcwd(), "backend"))

from utils.env_loader import load_env
load_env()

from config import settings
from workflow import cognition, VideoProcessingState
from db_client import DBClient

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dev_cognition")

def load_sample_transcript(name: str = "default.txt") -> str:
    sample_path = Path("backend/tests/samples") / name
    if sample_path.exists():
        return sample_path.read_text(encoding="utf-8")
    return "测试转录文本：人工智能正在改变世界。"

async def run_debug_session(
    transcript_text: str, 
    task_id: str,
    user_id: str,
    lang: str = "zh",
    update_db: bool = False
):
    print(f"\n🚀 开始认知逻辑调试 | 模型: {settings.MODEL_ALIAS_SMART} | 同步数据库: {update_db}\n")

    db = DBClient()
    state: VideoProcessingState = {
        "task_id": task_id,
        "user_id": user_id,
        "video_url": "https://dev.test/debug",
        "video_title": "Debug Session",
        "thumbnail_url": "",
        "author": "Debugger",
        "duration": 0,
        "audio_path": None,
        "direct_audio_url": None,
        "transcript_text": transcript_text,
        "transcript_raw": "",
        "transcript_lang": lang,
        "final_summary_json": None,
        "cache_hit": False,
        "is_youtube": True,
        "errors": [],
        "transcript_source": "debug",
        "ingest_error": None
    }

    try:
        results = await cognition(state)
        
        if "final_summary_json" in results:
            print("\n📝 [Summary Preview]")
            print(json.dumps(results["final_summary_json"], indent=2, ensure_ascii=False)[:300] + "...")
        
        if update_db and task_id != "00000000-0000-0000-0000-000000000000":
            if results.get("final_summary_json"):
                 db.upsert_completed_task_output(
                     task_id, user_id, "summary", 
                     json.dumps(results["final_summary_json"], ensure_ascii=False)
                 )
            print("\n✅ 数据库已同步。UI 应已实时刷新。")

    except Exception as e:
        print(f"\n❌ 执行失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--task-id")
    parser.add_argument("--file")
    parser.add_argument("--lang", default="zh")
    parser.add_argument("--model")
    parser.add_argument("--update-db", action="store_true")
    
    args = parser.parse_args()
    
    if args.model:
        settings.MODEL_ALIAS_SMART = args.model
        settings.MODEL_ALIAS_FAST = args.model

    db = DBClient()
    transcript = ""
    user_id = ""
    task_id = args.task_id or "00000000-0000-0000-0000-000000000000"

    if args.task_id:
        task = db.get_task(args.task_id)
        if not task:
            sys.exit(1)
        user_id = task['user_id']
        outputs = db.get_task_outputs(args.task_id)
        script_output = next((o for o in outputs if o['kind'] == 'script'), None)
        if script_output:
            transcript = script_output['content']
    elif args.file:
        with open(args.file, "r") as f:
            transcript = f.read()
        users = db._execute_query("SELECT id FROM profiles LIMIT 1")
        user_id = users[0]['id']
    else:
        transcript = load_sample_transcript()
        users = db._execute_query("SELECT id FROM profiles LIMIT 1")
        user_id = users[0]['id']

    asyncio.run(run_debug_session(transcript, task_id, user_id, lang=args.lang, update_db=args.update_db))
