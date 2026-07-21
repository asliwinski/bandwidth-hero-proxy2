/**
 * Parse the optional `?w=<px>` max-width cap the extension prepends *before*
 * `url=` in the proxy request (e.g. `/api/index?w=1236&url=https://...`).
 *
 * Only the width in the part BEFORE the first `url=` is ours — the image URL's
 * own query string (which may itself contain a `w=` param) comes after `url=`
 * and must be ignored here. See extractTargetUrl for the url= convention.
 *
 * @returns the cap in pixels, or 0 when absent/invalid (meaning "don't resize").
 */
export default function extractMaxWidth(
  rawQuery: string | undefined | null,
): number {
  if (!rawQuery) return 0;

  const urlIdx = rawQuery.indexOf("url=");
  const prefix = urlIdx >= 0 ? rawQuery.slice(0, urlIdx) : rawQuery;

  const match = prefix.match(/(?:^|&)w=(\d+)/);
  const width = match ? parseInt(match[1], 10) : 0;

  return Number.isFinite(width) && width > 0 ? width : 0;
}
