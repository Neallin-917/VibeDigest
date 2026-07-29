#!/usr/bin/env python3
import asyncio
import json
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from config import settings
from services.summarizer import Summarizer

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures" / "transcripts"
OUTPUT_DIR = Path(__file__).parent / "output" / "v4_batch"

TEST_CASES = [
    {
        "id": "beab3acd-0ee6-4765-9532-b3ee98eb7a86",
        "expected_type": "presentation",
        "description": "TEDx Talk - Impactful VC (formal presentation, 15min)",
    },
    {
        "id": "7cf9c626-6b7d-4aaa-9c50-c9065540bf2d",
        "expected_type": "interview",
        "description": "Elon Musk: Build the Future (tech interview, 20min)",
    },
    {
        "id": "b4b714a5-99ed-4aa0-b8d6-7f2a8b9210f1",
        "expected_type": "interview",
        "description": "Joe Rogan + Jensen Huang (long podcast, 2.5hr)",
    },
    {
        "id": "4bd44e42-40ea-4b01-a2ee-b738c3423a6a",
        "expected_type": "tutorial",
        "description": "Claude Agent SDK Workshop (technical tutorial, 1.9hr)",
    },
    {
        "id": "52279e1a-6f25-44c3-98d6-e3f7de84c798",
        "expected_type": "monologue",
        "description": "Dan Koe: Get Ahead 99% (motivational, 1.6hr)",
    },
]


async def process_single_case(case: dict, summarizer: Summarizer) -> dict:
    task_id = case["id"]
    transcript_file = FIXTURES_DIR / f"{task_id}.txt"
    metadata_file = FIXTURES_DIR / f"{task_id}.json"
    
    if not transcript_file.exists():
        return {"id": task_id, "status": "skip", "error": "Transcript file not found"}
    
    transcript = transcript_file.read_text(encoding="utf-8")
    metadata = json.loads(metadata_file.read_text()) if metadata_file.exists() else {}
    
    print(f"\n{'='*70}")
    print(f"[{case['description']}]")
    print(f"  ID: {task_id}")
    print(f"  Transcript: {len(transcript):,} chars")
    print(f"  Expected type: {case['expected_type']}")
    print("-" * 70)
    
    start_time = datetime.now()
    
    try:
        result_json = await summarizer.summarize(
            transcript=transcript,
            target_language="zh",
        )
        result = json.loads(result_json)
        
        elapsed = (datetime.now() - start_time).total_seconds()
        
        version = result.get("version", "?")
        tl_dr = result.get("tl_dr", "")[:100]
        keypoints = result.get("keypoints", [])
        sections = result.get("sections", [])
        
        section_types = [s.get("section_type", "?") for s in sections]
        
        print(f"\n[SUCCESS] V{version} generated in {elapsed:.1f}s")
        print(f"  TL;DR: {tl_dr}...")
        print(f"  Keypoints: {len(keypoints)}")
        print(f"  Dynamic Sections ({len(sections)}): {section_types}")
        
        output_file = OUTPUT_DIR / f"{task_id}.json"
        output_file.write_text(json.dumps(result, ensure_ascii=False, indent=2))
        
        return {
            "id": task_id,
            "status": "success",
            "version": version,
            "elapsed_seconds": elapsed,
            "transcript_chars": len(transcript),
            "keypoints_count": len(keypoints),
            "section_types": section_types,
            "expected_type": case["expected_type"],
            "description": case["description"],
            "metadata": metadata,
        }
        
    except Exception as e:
        elapsed = (datetime.now() - start_time).total_seconds()
        print(f"\n[ERROR] Failed after {elapsed:.1f}s: {e}")
        import traceback
        traceback.print_exc()
        
        return {
            "id": task_id,
            "status": "error",
            "elapsed_seconds": elapsed,
            "error": str(e),
            "description": case["description"],
        }


async def main():
    settings.SUMMARY_STRATEGY = "v4_dynamic"
    print(f"[Config] SUMMARY_STRATEGY = {settings.SUMMARY_STRATEGY}")
    print(f"[Config] SUMMARY_MODELS = {settings.OPENAI_SUMMARY_MODELS}")
    print(f"[Test] Running {len(TEST_CASES)} diverse content types\n")
    
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    summarizer = Summarizer()
    results = []
    
    for case in TEST_CASES:
        result = await process_single_case(case, summarizer)
        results.append(result)
    
    print("\n" + "=" * 70)
    print("BATCH TEST SUMMARY")
    print("=" * 70)
    
    success_count = sum(1 for r in results if r["status"] == "success")
    error_count = sum(1 for r in results if r["status"] == "error")
    skip_count = sum(1 for r in results if r["status"] == "skip")
    
    print(f"\nResults: {success_count} success, {error_count} error, {skip_count} skip")
    
    if success_count > 0:
        avg_time = sum(r["elapsed_seconds"] for r in results if r["status"] == "success") / success_count
        print(f"Average time: {avg_time:.1f}s")
    
    print("\nSection Types by Content:")
    for r in results:
        if r["status"] == "success":
            print(f"  [{r['expected_type']:12}] → {r['section_types']}")
    
    report_file = OUTPUT_DIR / "batch_report.json"
    report_file.write_text(json.dumps({
        "timestamp": datetime.now().isoformat(),
        "strategy": settings.SUMMARY_STRATEGY,
        "models": settings.OPENAI_SUMMARY_MODELS,
        "results": results,
    }, ensure_ascii=False, indent=2))
    
    print(f"\n[Saved] Batch report: {report_file}")
    print(f"[Saved] Individual results: {OUTPUT_DIR}/")


if __name__ == "__main__":
    asyncio.run(main())
