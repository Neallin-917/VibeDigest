import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/backend-url", () => ({
  SERVER_BACKEND_URL: "https://backend-origin.test",
}));

describe("GET /api/health/backend-origin", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("checks backend health from the server-side origin URL", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: "healthy" }),
    });

    const response = await GET();
    const body = await response.json();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://backend-origin.test/health",
      expect.objectContaining({ cache: "no-store" })
    );
    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "healthy",
      backendStatus: 200,
      backend: { status: "healthy" },
    });
  });

  it("returns 502 when the backend origin is not healthy", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "blocked" }),
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.status).toBe("unhealthy");
    expect(body.backendStatus).toBe(403);
  });
});
