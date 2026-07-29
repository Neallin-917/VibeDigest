import json
import threading
from contextlib import contextmanager
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Iterator


@dataclass
class ReplayEndpoint:
    base_url: str
    requests: list[dict[str, Any]]


def _matches(expected: dict[str, Any], actual: dict[str, Any]) -> bool:
    if expected.get("model") != actual.get("model"):
        return False

    expected_messages = expected.get("messages") or []
    actual_messages = actual.get("messages") or []
    return expected_messages == actual_messages


def _handler_for(
    interactions: list[dict[str, Any]],
    received_requests: list[dict[str, Any]],
) -> type[BaseHTTPRequestHandler]:
    class ReplayHandler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802 - stdlib handler API
            if self.path != "/v1/chat/completions":
                self.send_error(404, "Only /v1/chat/completions is replayable")
                return

            try:
                length = int(self.headers.get("Content-Length", "0"))
                request = json.loads(self.rfile.read(length))
            except (TypeError, ValueError, json.JSONDecodeError):
                self.send_error(400, "Invalid JSON request")
                return

            received_requests.append(request)
            interaction = next(
                (
                    candidate
                    for candidate in interactions
                    if _matches(candidate["request"], request)
                ),
                None,
            )
            if interaction is None:
                self.send_error(409, "No matching replay interaction")
                return

            payload = json.dumps(interaction["response"]).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, _format: str, *_args: Any) -> None:
            return

    return ReplayHandler


@contextmanager
def serve_llm_replay(cassette_path: Path) -> Iterator[ReplayEndpoint]:
    cassette = json.loads(cassette_path.read_text(encoding="utf-8"))
    interactions = cassette.get("interactions")
    if not isinstance(interactions, list) or not interactions:
        raise ValueError(f"Replay cassette has no interactions: {cassette_path}")

    received_requests: list[dict[str, Any]] = []
    server = ThreadingHTTPServer(
        ("127.0.0.1", 0),
        _handler_for(interactions, received_requests),
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    try:
        host, port = server.server_address
        yield ReplayEndpoint(
            base_url=f"http://{host}:{port}/v1",
            requests=received_requests,
        )
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
