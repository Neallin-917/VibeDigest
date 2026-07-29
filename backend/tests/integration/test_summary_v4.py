#!/usr/bin/env python3
"""Test Summary V4 dynamic two-phase generation."""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from config import settings
from services.summarizer import Summarizer


FIXTURES_DIR = Path(__file__).parent.parent / "fixtures" / "transcripts"
SAMPLE_ID = "a4301f4b-8793-4b11-b23f-f9c1f77f0046"


async def main():
    settings.SUMMARY_STRATEGY = "v4_dynamic"
    print(f"[Config] SUMMARY_STRATEGY = {settings.SUMMARY_STRATEGY}")
    print(f"[Config] SUMMARY_MODELS = {settings.OPENAI_SUMMARY_MODELS}")
    print()
    
    transcript_file = FIXTURES_DIR / f"{SAMPLE_ID}.txt"
    if not transcript_file.exists():
        print(f"[Error] Not found: {transcript_file}")
        sys.exit(1)
    
    transcript = transcript_file.read_text(encoding="utf-8")
    print(f"[Input] Transcript: {len(transcript)} chars")
    print()
    
    summarizer = Summarizer()
    print("[Processing] Running V4 two-phase summary...")
    print("-" * 60)
    
    try:
        result_json = await summarizer.summarize(
            transcript=transcript,
            target_language="zh",
        )
        result = json.loads(result_json)
        
        print()
        print("=" * 60)
        print(f"SUMMARY V{result.get('version')} OUTPUT")
        print("=" * 60)
        
        print(f"\nTL;DR: {result.get('tl_dr', 'N/A')[:200]}...")
        print(f"\nOVERVIEW: {result.get('overview', 'N/A')[:300]}...")
        
        keypoints = result.get("keypoints", [])
        print(f"\nKEYPOINTS ({len(keypoints)}):")
        for i, kp in enumerate(keypoints[:3], 1):
            print(f"  {i}. {kp.get('title', 'N/A')[:60]}")
        
        sections = result.get("sections", [])
        print(f"\nDYNAMIC SECTIONS ({len(sections)}):")
        for sec in sections:
            sec_type = sec.get("section_type", "unknown")
            items = sec.get("items", [])
            print(f"  - {sec_type}: {sec.get('title', 'N/A')} ({len(items)} items)")
        
        print("\n" + "=" * 60)
        print("[Success] V4 summary generated!")
        
        output_path = Path(__file__).parent / "output" / "summary_v4_test.json"
        output_path.parent.mkdir(exist_ok=True)
        output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2))
        print(f"[Saved] {output_path}")
        
    except Exception as e:
        print(f"[Error] {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
