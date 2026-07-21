// Cloudflare Workers entry point — the edge equivalent of the Vercel function
// in api/index.ts. Same request/response contract with the Image Lite
// extension, but image encoding runs on WASM (util/compressWasm.ts) instead of
// sharp, since native libvips can't run in the Workers runtime.

import extractTargetUrl from "./util/extractTargetUrl";
import extractMaxWidth from "./util/extractMaxWidth";
import shouldCompress from "./util/shouldCompress";
import compressWasm, { canCompress } from "./util/compressWasm";
import {
  FORWARDED_REQUEST_HEADERS,
  isCspHeader,
  patchCspValue,
} from "./util/headers";

/** Clone origin headers, patch any CSP value, and add the proxy's CORS headers. */
function buildHeaders(origin: Headers, host: string): Headers {
  const headers = new Headers();
  origin.forEach((value, name) => {
    headers.set(name, isCspHeader(name) ? patchCspValue(value, host) : value);
  });
  headers.set("access-control-allow-origin", "*");
  headers.set("cross-origin-resource-policy", "cross-origin");
  return headers;
}

/** Passthrough of the original image bytes (bypass / compression-failed cases). */
function passthroughImage(
  buffer: ArrayBuffer,
  origin: Headers,
  host: string,
  isSvg: boolean,
): Response {
  const headers = buildHeaders(origin, host);
  // We send identity bytes we already read, so the origin's transfer-encoding
  // metadata no longer applies.
  headers.delete("content-length");
  if (isSvg) {
    headers.set("content-encoding", "identity");
  } else {
    headers.delete("content-encoding");
  }
  return new Response(buffer, { status: 200, headers });
}

export default {
  async fetch(request: Request): Promise<Response> {
    // Read the target URL verbatim from the raw query so the image's own query
    // string (signatures, sizing) survives intact. See util/extractTargetUrl.
    const rawQuery = request.url.split("?").slice(1).join("?");
    let url = extractTargetUrl(rawQuery);
    const maxWidth = extractMaxWidth(rawQuery);

    if (!url) {
      return new Response("bandwidth-hero-proxy", { status: 200 });
    }

    url = url.replace(/http:\/\/1\.1\.\d\.\d\/bmi\/(https?:\/\/)?/i, "http://");

    // Compression settings from the extension's headers. Defaults match compress.ts.
    let useWebp = false;
    let grayscale = true;
    let quality = 40;
    const bw = request.headers.get("x-image-lite-bw");
    const level = request.headers.get("x-image-lite-level");
    const jpeg = request.headers.get("x-image-lite-jpeg");
    if (bw && level && jpeg) {
      useWebp = jpeg === "0";
      grayscale = bw !== "0";
      quality = parseInt(level, 10) || 40;
    }

    const host = new URL(request.url).host;

    try {
      // Forward a safe subset of the browser's headers to the origin.
      const originHeaders = new Headers();
      for (const name of FORWARDED_REQUEST_HEADERS) {
        const value = request.headers.get(name);
        if (value) originHeaders.set(name, value);
      }

      const originResponse = await fetch(url, { headers: originHeaders });

      if (!originResponse.ok) {
        // Stream the origin's failure through (with CORS) so the browser can
        // fall back to normal behavior.
        return new Response(originResponse.body, {
          status: originResponse.status,
          statusText: originResponse.statusText,
          headers: buildHeaders(originResponse.headers, host),
        });
      }

      const type = originResponse.headers.get("content-type") || "";
      const buffer = await originResponse.arrayBuffer();
      const originalSize = buffer.byteLength;
      const isSvg = type.includes("svg");

      if (!canCompress(type) || !shouldCompress(type, originalSize, useWebp)) {
        console.log(`Bypassing... Size: ${originalSize}, type: ${type}`);
        return passthroughImage(buffer, originResponse.headers, host, isSvg);
      }

      try {
        const { data, contentType } = await compressWasm(
          buffer,
          type,
          useWebp,
          grayscale,
          quality,
          maxWidth,
        );

        const saved = originalSize - data.byteLength;
        console.log(
          `From ${originalSize}, To ${data.byteLength}, Saved: ${((saved * 100) / originalSize).toFixed(0)}%`,
        );

        const headers = buildHeaders(originResponse.headers, host);
        headers.set("content-type", contentType);
        headers.delete("content-length");
        headers.delete("content-encoding");
        headers.set("cache-control", "max-age=2592000");
        headers.set("x-original-size", String(originalSize));
        headers.set("x-bytes-saved", String(saved));
        return new Response(data, { status: 200, headers });
      } catch (err) {
        // Unsupported/corrupt image — return the original rather than 500.
        console.error("WASM compression failed:", (err as Error).message);
        return passthroughImage(buffer, originResponse.headers, host, isSvg);
      }
    } catch (error) {
      console.error(error);
      return new Response((error as Error).message || "", { status: 500 });
    }
  },
};
