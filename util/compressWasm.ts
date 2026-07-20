// Edge-runtime image compressor for Cloudflare Workers.
//
// sharp (native libvips) cannot run in the Workers runtime, so this is the
// WASM-based equivalent of util/compress.ts using @jsquash (the Squoosh
// codecs). It decodes JPEG/PNG/WebP, optionally converts to grayscale, and
// re-encodes to WebP or JPEG at the requested quality.
//
// Cloudflare Workers cannot lazily fetch the .wasm binaries the way browsers
// do, so each codec's WASM module is imported statically and passed to its
// init() before first use.

import decodeJpeg, { init as initJpegDec } from "@jsquash/jpeg/decode";
import decodePng, { init as initPngDec } from "@jsquash/png/decode";
import decodeWebp, { init as initWebpDec } from "@jsquash/webp/decode";
import encodeWebp, { init as initWebpEnc } from "@jsquash/webp/encode";
import encodeJpeg, { init as initJpegEnc } from "@jsquash/jpeg/encode";

import JPEG_DEC_WASM from "@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm";
import JPEG_ENC_WASM from "@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm";
import PNG_WASM from "@jsquash/png/codec/pkg/squoosh_png_bg.wasm";
import WEBP_DEC_WASM from "@jsquash/webp/codec/dec/webp_dec.wasm";
import WEBP_ENC_WASM from "@jsquash/webp/codec/enc/webp_enc_simd.wasm";

// Memoize each codec's init() so concurrent requests share a single
// instantiation instead of re-initializing the WASM module every call.
const initPromises = new Map<string, Promise<unknown>>();
function ensureInit(key: string, init: () => Promise<unknown>): Promise<unknown> {
  let p = initPromises.get(key);
  if (!p) {
    p = init();
    initPromises.set(key, p);
  }
  return p;
}

interface ImageDataLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Map a response content-type to a supported decoder key, or null. */
function decoderFor(type: string): "jpeg" | "png" | "webp" | null {
  const t = type.toLowerCase();
  if (t.includes("jpeg") || t.includes("jpg")) return "jpeg";
  if (t.includes("png")) return "png";
  if (t.includes("webp")) return "webp";
  return null;
}

async function decode(buffer: ArrayBuffer, type: string): Promise<ImageDataLike> {
  switch (decoderFor(type)) {
    case "jpeg":
      await ensureInit("jpegDec", () => initJpegDec(JPEG_DEC_WASM));
      return decodeJpeg(buffer);
    case "png":
      await ensureInit("pngDec", () => initPngDec(PNG_WASM));
      return decodePng(buffer);
    case "webp":
      await ensureInit("webpDec", () => initWebpDec(WEBP_DEC_WASM));
      return decodeWebp(buffer);
    default:
      throw new Error(`Unsupported image type for WASM decode: ${type}`);
  }
}

/** In-place luminance grayscale, preserving the alpha channel. */
function toGrayscale(image: ImageDataLike): void {
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = data[i + 1] = data[i + 2] = y;
  }
}

/** True if `decode()` can handle this content-type at all. */
export function canCompress(type: string): boolean {
  return decoderFor(type) !== null;
}

export interface CompressResult {
  data: ArrayBuffer;
  contentType: string;
}

/**
 * Decode → (optional grayscale) → encode. Mirrors util/compress.ts:
 * `useWebp` picks WebP vs JPEG output, `quality` is the encoder quality (1-100).
 */
export default async function compressWasm(
  buffer: ArrayBuffer,
  type: string,
  useWebp: boolean,
  grayscale: boolean,
  quality: number,
): Promise<CompressResult> {
  const image = await decode(buffer, type);

  if (grayscale) toGrayscale(image);

  const q = Math.min(100, Math.max(1, Math.round(quality) || 40));

  if (useWebp) {
    await ensureInit("webpEnc", () => initWebpEnc(WEBP_ENC_WASM));
    return { data: await encodeWebp(image, { quality: q }), contentType: "image/webp" };
  }

  await ensureInit("jpegEnc", () => initJpegEnc(JPEG_ENC_WASM));
  return { data: await encodeJpeg(image, { quality: q }), contentType: "image/jpeg" };
}
