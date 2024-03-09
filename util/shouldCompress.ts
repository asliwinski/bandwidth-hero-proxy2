const MIN_COMPRESS_LENGTH = 1024;
const MIN_TRANSPARENT_COMPRESS_LENGTH = 102400;

function shouldCompress(
  imageType: string,
  size: number,
  isTransparent: boolean,
) {
  // Check if the image type starts with "image"
  if (!imageType.startsWith("image")) {
    return false;
  }

  if (imageType.includes("svg")) {
    return false;
  }

  // Check if the size is zero
  if (size === 0) {
    return false;
  }

  // Check if the image is transparent and smaller than the minimum compress length
  if (isTransparent && size < MIN_COMPRESS_LENGTH) {
    return false;
  }

  // Check if the image is not transparent and smaller than the minimum transparent compress length
  if (
    !isTransparent &&
    (imageType.endsWith("png") || imageType.endsWith("gif")) &&
    size < MIN_TRANSPARENT_COMPRESS_LENGTH
  ) {
    return false;
  }

  // If none of the above conditions are met, compress the image
  return true;
}

export default shouldCompress;
