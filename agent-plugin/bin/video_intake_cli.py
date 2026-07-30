from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services.video_intake import VideoIntakeGateway, VideoIntakeOptions  # noqa: E402


async def get_video_context(args: argparse.Namespace) -> dict:
    gateway = VideoIntakeGateway()
    result = await gateway.get_video_context(
        VideoIntakeOptions(
            url=args.url,
            language=args.language,
            strategy=args.strategy,
            allow_asr=args.allow_asr,
        )
    )
    return result.to_dict()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="VibeDigest video intake CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    context_parser = subparsers.add_parser("get-video-context")
    context_parser.add_argument("--url", required=True)
    context_parser.add_argument("--language")
    context_parser.add_argument("--strategy", default="fastest_reliable")
    context_parser.add_argument("--allow-asr", action="store_true")

    return parser


async def main_async() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "get-video-context":
        payload = await get_video_context(args)
    else:
        parser.error(f"Unsupported command: {args.command}")

    print(json.dumps(payload, ensure_ascii=False))
    return 0


def main() -> int:
    try:
        return asyncio.run(main_async())
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
