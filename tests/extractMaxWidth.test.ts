import extractMaxWidth from "../util/extractMaxWidth";

describe("extractMaxWidth", () => {
  it("returns 0 when the query is missing/empty", () => {
    expect(extractMaxWidth(undefined)).toBe(0);
    expect(extractMaxWidth(null)).toBe(0);
    expect(extractMaxWidth("")).toBe(0);
  });

  it("returns 0 when there is no w= param", () => {
    expect(extractMaxWidth("url=https://cdn.example.com/img.jpg")).toBe(0);
  });

  it("reads w= placed before url=", () => {
    expect(extractMaxWidth("w=1236&url=https://cdn.example.com/img.jpg")).toBe(
      1236,
    );
  });

  it("reads w= even when other params precede it", () => {
    expect(extractMaxWidth("foo=bar&w=800&url=https://x")).toBe(800);
  });

  it("ignores a w= that belongs to the image URL (after url=)", () => {
    expect(
      extractMaxWidth("w=800&url=https://cdn.example.com/img?w=4000&h=3000"),
    ).toBe(800);
    expect(
      extractMaxWidth("url=https://cdn.example.com/render?w=4000"),
    ).toBe(0);
  });

  it("does not match a param that merely ends in w (e.g. sw=)", () => {
    expect(extractMaxWidth("sw=500&url=https://x")).toBe(0);
  });

  it("returns 0 for non-positive or non-numeric values", () => {
    expect(extractMaxWidth("w=0&url=https://x")).toBe(0);
    expect(extractMaxWidth("w=abc&url=https://x")).toBe(0);
  });
});
