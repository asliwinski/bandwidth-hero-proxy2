import { handler } from "../api/index";

// Repointed from the old (broken) `require("../functions/index")`. The Netlify
// `handler` export now reads the target URL from event.rawQuery.
describe("handler", () => {
  it("returns the default response when no url is provided", async () => {
    const response = await handler({ rawQuery: "" } as any);

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("bandwidth-hero-proxy");
  });

  it("returns the default response when the query has no url= param", async () => {
    const response = await handler({ rawQuery: "foo=bar" } as any);

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("bandwidth-hero-proxy");
  });
});
