import { describe, expect, it } from "vitest"

import RootLayout from "./layout"

describe("root entry layout", () => {
  it("uses the English default without reading request state", () => {
    const layout = RootLayout({ children: "content", auth: "auth" })

    expect(layout.props.lang).toBe("en")
    expect(layout.props.children.props.children).toEqual(["content", "auth"])
  })
})
