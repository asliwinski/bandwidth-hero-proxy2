export type OutputFormat = "webp" | "jpeg" | "avif";

/**
 * Resolve the output format from the extension's request headers. Prefers the
 * x-image-lite-format header ("webp" | "jpeg" | "avif"); falls back to the
 * legacy x-image-lite-jpeg boolean ("0" = webp, else jpeg) for older clients.
 */
export default function resolveFormat(
  formatHeader: string | undefined | null,
  jpegHeader: string | undefined | null,
): OutputFormat {
  if (
    formatHeader === "webp" ||
    formatHeader === "jpeg" ||
    formatHeader === "avif"
  ) {
    return formatHeader;
  }
  return jpegHeader === "0" ? "webp" : "jpeg";
}
