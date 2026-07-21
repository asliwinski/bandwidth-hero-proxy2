import extractOptions from "../util/extractOptions";

describe("extractOptions", () => {
  it("returns all-unspecified for missing/empty/param-less queries", () => {
    for (const q of [undefined, null, "", "url=https://x"]) {
      expect(extractOptions(q)).toEqual({
        maxWidth: 0,
        quality: 0,
        grayscale: null,
        format: null,
      });
    }
  });

  it("parses w/q/bw/f placed before url=", () => {
    expect(
      extractOptions("w=1236&q=40&bw=0&f=avif&url=https://cdn.example.com/i.jpg"),
    ).toEqual({ maxWidth: 1236, quality: 40, grayscale: false, format: "avif" });

    expect(extractOptions("w=1080&q=25&bw=1&f=webp&url=https://x")).toEqual({
      maxWidth: 1080,
      quality: 25,
      grayscale: true,
      format: "webp",
    });
  });

  it("ignores params in the image URL (after url=)", () => {
    expect(
      extractOptions("w=800&f=webp&url=https://cdn.example.com/img?w=4000&f=jpeg"),
    ).toEqual({ maxWidth: 800, quality: 0, grayscale: null, format: "webp" });
  });

  it("treats invalid/absent values as unspecified", () => {
    expect(extractOptions("w=0&q=abc&f=gif&url=https://x")).toEqual({
      maxWidth: 0,
      quality: 0,
      grayscale: null,
      format: null,
    });
  });

  it("distinguishes bw=0 (false) from absent (null)", () => {
    expect(extractOptions("bw=0&url=https://x").grayscale).toBe(false);
    expect(extractOptions("bw=1&url=https://x").grayscale).toBe(true);
    expect(extractOptions("url=https://x").grayscale).toBeNull();
  });
});
