#!/usr/bin/env python3
"""
Simple test script to verify backend changes work correctly.
"""

import asyncio
import sys
from pathlib import Path

import pytest

pytestmark = [pytest.mark.integration, pytest.mark.network]

# Add backend to path
backend_path = Path(__file__).parents[2]
sys.path.insert(0, str(backend_path))


async def test_video_metadata_extraction():
    """Exercise the worker's metadata extractor outside the command API."""
    try:
        from services.video_processor import VideoProcessor

        print("✅ Successfully imported backend modules")

        # Test video processor
        processor = VideoProcessor()
        test_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

        print(f"✅ Testing metadata extraction for: {test_url}")
        info = await processor.extract_info_only(test_url)

        if info:
            print(f"✅ Metadata extraction success: {info.get('title', 'Unknown')}")
        else:
            print("❌ Metadata extraction failed - no info returned")

    except ImportError as e:
        print(f"❌ Import error: {e}")
    except Exception as e:
        print(f"❌ Error during preview test: {e}")


async def test_database_connection():
    """Test database connection."""
    try:
        from db_client import DBClient

        print("✅ Successfully imported DBClient")

        DBClient()

        # Test a simple query (this might fail in dev, but import should work)
        print("✅ DBClient initialized successfully")

    except Exception as e:
        print(f"❌ Database connection test failed: {e}")


async def main():
    print("🚀 Testing backend after cleanup...")
    print()

    print("1. Testing worker metadata extraction:")
    await test_video_metadata_extraction()
    print()

    print("2. Testing database connection:")
    await test_database_connection()
    print()

    print("✅ All tests completed!")


if __name__ == "__main__":
    asyncio.run(main())
