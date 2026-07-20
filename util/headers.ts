// Pure, runtime-agnostic header helpers shared by the Node (Vercel) and edge
// (Cloudflare Worker) entry points. No sharp / no WASM imports here so the edge
// bundle can use it freely.

/** Names of request headers we forward from the browser to the origin image host. */
export const FORWARDED_REQUEST_HEADERS = [
  "cookie",
  "dnt",
  "referer",
  "user-agent",
  "x-forwarded-for",
] as const;

/** True if the header name is a Content-Security-Policy header (any variant). */
export function isCspHeader(name: string): boolean {
  return /content-security-policy/i.test(name);
}

/**
 * Rewrite a CSP header value so the proxied image (served from `host`) is allowed
 * by the page's policy, and mixed-content blocking doesn't drop it.
 */
export function patchCspValue(value: string, host: string): string {
  const hostWithProtocol = "https://" + host;
  return value
    .replace("block-all-mixed-content", "")
    .replace("img-src", `img-src ${hostWithProtocol}`)
    .replace("default-src", `default-src ${hostWithProtocol}`)
    .replace("connect-src", `connect-src ${hostWithProtocol}`);
}
