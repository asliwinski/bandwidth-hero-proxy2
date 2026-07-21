import resolveFormat from "../util/resolveFormat";

describe("resolveFormat", () => {
  it("uses the x-image-lite-format header when valid", () => {
    expect(resolveFormat("avif", "1")).toBe("avif");
    expect(resolveFormat("webp", "1")).toBe("webp");
    expect(resolveFormat("jpeg", "0")).toBe("jpeg");
  });

  it("falls back to the legacy jpeg header when format is absent", () => {
    expect(resolveFormat(undefined, "0")).toBe("webp");
    expect(resolveFormat(undefined, "1")).toBe("jpeg");
    expect(resolveFormat(null, null)).toBe("jpeg");
  });

  it("ignores an unrecognized format header and falls back", () => {
    expect(resolveFormat("gif", "0")).toBe("webp");
    expect(resolveFormat("", "1")).toBe("jpeg");
  });
});
