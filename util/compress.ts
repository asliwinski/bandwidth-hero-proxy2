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
  const outputFormat =
    format === "avif" || format === "jpeg" ? format : "webp";

  try {
    // Resize down to maxWidth (preserving aspect ratio, never enlarging) before
    // encoding, so a webmaster's oversized image doesn't ship full-resolution.
    const pipeline = sharp(imagePath).grayscale(grayscale);
    if (maxWidth > 0) {
      pipeline.resize({ width: maxWidth, withoutEnlargement: true });
    }

    // Use Sharp library to compress the image (progressive/optimizeScans apply
    // to JPEG; sharp ignores them for WebP/AVIF).
    const { data, info } = await pipeline
      .toFormat(outputFormat, { quality, progressive: true, optimizeScans: true })
      .toBuffer({ resolveWithObject: true });

    // Calculate saved bytes and prepare headers
    const bytesSaved = originalSize - info.size;
    const headers = {
      "cache-control": "max-age=2592000",
      "content-type": `image/${outputFormat}`,
      "content-length": info.size,
      "x-original-size": originalSize,
      "x-bytes-saved": bytesSaved,
    };

    // Return the compressed image data along with headers
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
