import sys
import asyncio
from pathlib import Path

import pytest

# Setup path
sys.path.append(str(Path(__file__).parent.parent))

from services.transcript_guard import TranscriptGuard  # noqa: E402

pytestmark = [pytest.mark.integration, pytest.mark.llm_live, pytest.mark.eval]

async def test_guard_scenarios():
    guard = TranscriptGuard()
    
    scenarios = [
        {
            "name": "Invalid Placeholder (NLP Intro)",
            "title": "Claude Agent SDK [Full Workshop] — Thariq Shihipar, Anthropic",
            "transcript": "Hello everyone and welcome back to the channel. Today we're going to dive deep into the world of artificial intelligence and machine learning. Specifically, we'll be exploring the latest advancements in natural language processing, or NLP. NLP has revolutionized how computers understand and interact with human language. From chatbots to sentiment analysis, its applications are vast and ever-growing.",
            "expected": False
        },
        {
            "name": "Valid Content",
            "title": "Cooking the Perfect Pasta Carbonara",
            "transcript": "Hi guys, today I'm going to show you how to make a classic Roman pasta carbonara. You only need a few ingredients: guanciale, pecorino romano, eggs, black pepper and spaghetti. First, we start by boiling the water. Make sure to salt it heavily. Meanwhile, dice the guanciale and fry it in a cold pan until crispy.",
            "expected": True
        }
    ]
    
    print("Running Transcript Guard Scenarios...\n")
    
    for s in scenarios:
        print(f"Scenario: {s['name']}")
        print(f"Title: {s['title']}")
        
        is_valid = await guard.validate(s['transcript'], s['title'])
        print(f"Result: {'VALID' if is_valid else 'INVALID'} (Expected: {'VALID' if s['expected'] else 'INVALID'})\n")
        
        if is_valid != s['expected']:
            print(f"FAIL: {s['name']} did not match expected result.")
        else:
            print(f"PASS: {s['name']} matched expected result.\n")

if __name__ == "__main__":
    asyncio.run(test_guard_scenarios())
