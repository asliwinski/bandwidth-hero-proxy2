// @ts-ignore
import sharp from "sharp";

async function compress(
  imagePath: string,
  useWebp: boolean,
  grayscale: boolean,
  quality: number,
  originalSize: number,
) {
  // Determine the output format based on the useWebp flag
  const format = useWebp ? "webp" : "jpeg";

  try {
    // Use Sharp library to compress the image
    const { data, info } = await sharp(imagePath)
      .grayscale(grayscale)
      .toFormat(format, { quality, progressive: true, optimizeScans: true })
      .toBuffer({ resolveWithObject: true });

    // Calculate saved bytes and prepare headers
    const bytesSaved = originalSize - info.size;
    const headers = {
      "cache-control": "max-age=2592000",
      "content-type": `image/${format}`,
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
