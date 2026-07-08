import { describe, expect, it } from "vitest";
import { resolveServerBackendUrl } from "./backend-url-core";

describe("resolveServerBackendUrl", () => {
  it("uses BACKEND_ORIGIN_URL for server-to-server backend calls", () => {
    expect(
      resolveServerBackendUrl({
        nodeEnv: "production",
        backendApiUrl: "https://api.vibedigest.io",
        backendOriginUrl: "https://vibedigest-production.up.railway.app",
      })
    ).toBe("https://vibedigest-production.up.railway.app");
  });

  it("keeps local development working without a separate origin URL", () => {
    expect(
      resolveServerBackendUrl({
        nodeEnv: "development",
        backendApiUrl: "http://localhost:16081",
      })
    ).toBe("http://localhost:16081");
  });

  it("fails production builds that route server calls through the public Cloudflare API domain", () => {
    expect(() =>
      resolveServerBackendUrl({
        nodeEnv: "production",
        backendApiUrl: "https://api.vibedigest.io",
      })
    ).toThrow("BACKEND_ORIGIN_URL must be set");
  });
});
