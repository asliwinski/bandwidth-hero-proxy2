import type { OutputFormat } from "./resolveFormat";

export interface ProxyOptions {
  maxWidth: number; // 0 = unspecified
  quality: number; // 0 = unspecified
  grayscale: boolean | null; // null = unspecified
  format: OutputFormat | null; // null = unspecified
}

/**
 * Parse the compression options the extension prepends BEFORE `url=` in the
 * proxy request, e.g. `/api/index?w=1236&q=40&bw=0&f=avif&url=https://...`.
 *
 * Putting these in the URL (rather than headers) makes them part of the cache
 * key, so changing a setting isn't masked by the proxy's long cache-control.
 * Only the part before the first `url=` is ours — the image URL's own query
 * string (which may contain the same param names) comes after and is ignored.
 */
export default function extractOptions(
  rawQuery: string | undefined | null,
): ProxyOptions {
  const empty: ProxyOptions = {
    maxWidth: 0,
    quality: 0,
    grayscale: null,
    format: null,
  };
  if (!rawQuery) return empty;

  const urlIdx = rawQuery.indexOf("url=");
  const prefix = urlIdx >= 0 ? rawQuery.slice(0, urlIdx) : rawQuery;
  const p = new URLSearchParams(prefix);

  const w = parseInt(p.get("w") || "", 10);
  const q = parseInt(p.get("q") || "", 10);
  const bw = p.get("bw");
  const f = p.get("f");

  return {
    maxWidth: Number.isFinite(w) && w > 0 ? w : 0,
    quality: Number.isFinite(q) && q > 0 ? q : 0,
    grayscale: bw === null ? null : bw !== "0",
    format: f === "webp" || f === "jpeg" || f === "avif" ? f : null,
  };
}
