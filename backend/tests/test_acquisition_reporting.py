from datetime import datetime, timezone

import httpx

from services.acquisition_reporting import VercelWebAnalyticsClient, classify_path


def test_load_snapshot_handles_plan_limited_custom_events() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/visits/count"):
            return httpx.Response(200, json={"data": {"visitors": 3, "pageviews": 8}})
        if request.url.path.endswith("/events/count"):
            return httpx.Response(402, json={"error": {"code": "payment_required"}})
        dimension = request.url.params["by"]
        assert request.url.params["until"].startswith("2026-08-30T15:59:59.999999")
        row = {dimension: "/en" if dimension == "requestPath" else "google.com", "visitors": 1, "pageviews": 5}
        return httpx.Response(200, json={"data": [row]})

    http_client = httpx.Client(
        transport=httpx.MockTransport(handler),
        base_url="https://api.vercel.com/v1/query/web-analytics/",
    )
    analytics = VercelWebAnalyticsClient(
        token="test-token", project_id="project-id", client=http_client
    ).load_snapshot(
        datetime(2026, 8, 29, 16, tzinfo=timezone.utc),
        datetime(2026, 8, 30, 16, tzinfo=timezone.utc),
    )

    assert analytics.visits.visitors == 3
    assert analytics.surface_pageviews["landing"] == 5
    assert analytics.custom_events.status == "unavailable_plan"


def test_classify_path_maps_public_funnel_surfaces() -> None:
    assert classify_path("/en") == "landing"
    assert classify_path("/zh/explore") == "library"
    assert classify_path("/en/tasks/id/slug") == "public_digest"
    assert classify_path("/en/login?next=%2Fen%2Fchat") == "login"
    assert classify_path("/en/chat") == "workspace"
    assert classify_path("/en/settings/pricing") == "pricing"
