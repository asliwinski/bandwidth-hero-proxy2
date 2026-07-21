// @ts-ignore
import sharp from "sharp";

async function compress(
  imagePath: string,
  format: string,
  grayscale: boolean,
  quality: number,
  originalSize: number,
  maxWidth: number = 0,
) {
  try {
    // Read the source with all frames so animated GIFs/WebPs keep their
    // animation (single-frame images are unaffected).
    const meta = await sharp(imagePath, { animated: true }).metadata();
    const isAnimated = (meta.pages || 1) > 1;

    // Animated images must go to WebP — JPEG can't animate, and animated AVIF
    // is unreliable. This turns huge animated GIFs into much smaller animated
    // WebP. Static images use the requested format.
    const outputFormat = isAnimated
      ? "webp"
      : format === "avif" || format === "jpeg"
        ? format
        : "webp";

    // Resize down to maxWidth (preserving aspect ratio, never enlarging) before
    // encoding, so a webmaster's oversized image doesn't ship full-resolution.
    const pipeline = sharp(imagePath, { animated: true }).grayscale(grayscale);
    if (maxWidth > 0) {
      pipeline.resize({ width: maxWidth, withoutEnlargement: true });
    }

    // progressive/optimizeScans apply to JPEG; sharp ignores them otherwise.
    const { data, info } = await pipeline
      .toFormat(outputFormat, { quality, progressive: true, optimizeScans: true })
      .toBuffer({ resolveWithObject: true });

    const bytesSaved = originalSize - info.size;
    const headers = {
      "cache-control": "max-age=2592000",
      "content-type": `image/${outputFormat}`,
      "content-length": info.size,
      "x-original-size": originalSize,
      "x-bytes-saved": bytesSaved,
    };

    return {
      err: null,
      headers,
      output: data,
    };
  } catch (err) {
    // If an error occurs during compression, return the error object
    return { err };
  }
}

export default compress;
