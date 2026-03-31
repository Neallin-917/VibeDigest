import asyncio
import sys
import os
import json
import logging
import time
from pathlib import Path
from datetime import datetime

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from utils.env_loader import load_env
load_env()

from config import settings
from workflow import cognition, VideoProcessingState, summarizer, comprehension_agent

# Setup Logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("benchmark")

FIXTURES_DIR = Path("backend/tests/fixtures/transcripts")
RESULTS_BASE_DIR = Path("backend/tests/results")

async def run_benchmark(model_override: str = None, name_suffix: str = ""):
    if model_override:
        settings.MODEL_ALIAS_SMART = model_override
        settings.MODEL_ALIAS_FAST = model_override
        
        if hasattr(summarizer, "config"):
            summarizer.config.summary_models = [model_override]
            summarizer.config.classifier_model = model_override
            summarizer.config.transcript_model = model_override
            summarizer.summary_models = [model_override]
        
        if hasattr(comprehension_agent, "comprehension_models"):
            comprehension_agent.comprehension_models = [model_override]

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_name = f"run_{timestamp}_{model_override or 'default'}"
    if name_suffix:
        run_name += f"_{name_suffix}"
    
    run_dir = RESULTS_BASE_DIR / run_name
    run_dir.mkdir(parents=True, exist_ok=True)

    print("\n" + "="*60)
    print(f"🚀 STARTING BENCHMARK: {run_name}")
    print(f"📍 Results Dir: {run_dir}")
    print(f"🤖 Model: {settings.MODEL_ALIAS_SMART}")
    print("="*60 + "\n")

    fixtures = list(FIXTURES_DIR.glob("*.txt"))
    if not fixtures:
        print("❌ No fixtures found in backend/tests/fixtures/transcripts/")
        return

    summary_report = []

    for txt_path in fixtures:
        task_id = txt_path.stem
        meta_path = txt_path.with_suffix(".json")
        
        with open(txt_path, "r", encoding="utf-8") as f:
            transcript = f.read()
        
        metadata = {}
        if meta_path.exists():
            with open(meta_path, "r", encoding="utf-8") as f:
                metadata = json.load(f)

        print(f"⏳ Processing: {metadata.get('title', task_id)}...")
        
        state: VideoProcessingState = {
            "task_id": task_id,
            "user_id": "00000000-0000-0000-0000-000000000001",
            "video_url": metadata.get("url", ""),
            "video_title": metadata.get("title", "Untitled"),
            "thumbnail_url": "",
            "author": "",
            "duration": metadata.get("duration", 0),
            "audio_path": None,
            "direct_audio_url": None,
            "transcript_text": transcript,
            "transcript_raw": "",
            "transcript_lang": "zh",
            "classification_result": None,
            "final_summary_json": None,
            "comprehension_brief_json": None,
            "cache_hit": False,
            "is_youtube": True,
            "errors": [],
            "transcript_source": "fixture",
            "ingest_error": None
        }

        start_time = time.time()
        try:
            results = await cognition(state)
            elapsed = time.time() - start_time
            
            result_path = run_dir / f"{task_id}_result.json"
            with open(result_path, "w", encoding="utf-8") as f:
                json.dump(results, f, indent=2, ensure_ascii=False)
            
            summary_report.append({
                "task_id": task_id,
                "title": metadata.get("title"),
                "status": "SUCCESS",
                "elapsed": round(elapsed, 2),
                "category": results.get("classification_result", {}).get("category", "N/A")
            })
            print(f"   ✅ Done ({elapsed:.2f}s)")
            
        except Exception as e:
            print(f"   ❌ Failed: {e}")
            summary_report.append({
                "task_id": task_id,
                "title": metadata.get("title"),
                "status": "FAILED",
                "error": str(e)
            })

    with open(run_dir / "summary_report.json", "w", encoding="utf-8") as f:
        json.dump(summary_report, f, indent=2, ensure_ascii=False)

    print("\n" + "="*60)
    print(f"✨ BENCHMARK COMPLETE")
    print(f"📊 Summary:")
    for item in summary_report:
        status_icon = "✅" if item['status'] == "SUCCESS" else "❌"
        elapsed_info = f"{item['elapsed']}s" if 'elapsed' in item else "N/A"
        print(f"   - {status_icon} | {elapsed_info} | {item['title'][:40]}...")
    print("="*60 + "\n")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="运行 Cognition 逻辑基准测试")
    parser.add_argument("--model", help="覆盖测试模型")
    parser.add_argument("--suffix", default="", help="运行名称后缀")
    
    args = parser.parse_args()
    asyncio.run(run_benchmark(model_override=args.model, name_suffix=args.suffix))
