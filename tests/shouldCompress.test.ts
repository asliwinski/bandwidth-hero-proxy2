import shouldCompress from "../util/shouldCompress";

// shouldCompress(imageType, size, isTransparent) decides whether an image is
// worth re-encoding. Shared by both the Vercel and Cloudflare Worker entries.
describe("shouldCompress", () => {
  it("rejects non-image content types", () => {
    expect(shouldCompress("text/html", 50000, false)).toBe(false);
    expect(shouldCompress("application/json", 50000, false)).toBe(false);
  });

  it("rejects zero-length responses", () => {
    expect(shouldCompress("image/jpeg", 0, false)).toBe(false);
  });

  it("compresses a normal JPEG", () => {
    expect(shouldCompress("image/jpeg", 50000, false)).toBe(true);
  });

  it("skips tiny transparent images (< 1KB)", () => {
    expect(shouldCompress("image/webp", 500, true)).toBe(false);
    expect(shouldCompress("image/webp", 2000, true)).toBe(true);
  });

  it("skips small PNG/GIF that likely won't shrink (< 100KB)", () => {
    expect(shouldCompress("image/png", 50000, false)).toBe(false);
    expect(shouldCompress("image/gif", 50000, false)).toBe(false);
    expect(shouldCompress("image/png", 200000, false)).toBe(true);
  });

  it("compresses large PNGs", () => {
    expect(shouldCompress("image/png", 150000, false)).toBe(true);
  });
});
