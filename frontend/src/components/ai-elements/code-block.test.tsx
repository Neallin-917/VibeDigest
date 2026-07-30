import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { highlightCode } from "./code-block";

const shikiMocks = vi.hoisted(() => ({
  createHighlighter: vi.fn(),
}));

vi.mock("shiki", () => ({
  createHighlighter: shikiMocks.createHighlighter,
}));

describe("code block highlighting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shikiMocks.createHighlighter.mockResolvedValue({
      getLoadedLanguages: () => ["json"],
      codeToTokens: () => ({
        bg: "#ffffff",
        fg: "#111111",
        tokens: [[{ color: "#111111", content: '{"ready":true}' }]],
      }),
    });
  });

  it("loads Shiki only when highlighting is requested", async () => {
    const onHighlighted = vi.fn();

    expect(highlightCode('{"ready":true}', "json", onHighlighted)).toBeNull();

    await waitFor(() => {
      expect(shikiMocks.createHighlighter).toHaveBeenCalledWith({
        langs: ["json"],
        themes: ["github-light", "github-dark"],
      });
      expect(onHighlighted).toHaveBeenCalledWith({
        bg: "#ffffff",
        fg: "#111111",
        tokens: [[{ color: "#111111", content: '{"ready":true}' }]],
      });
    });
  });
});
