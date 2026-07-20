import pick from "../util/pick";
import shouldCompress from "../util/shouldCompress";
import compress from "../util/compress";
import extractTargetUrl from "../util/extractTargetUrl";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { HandlerEvent } from "@netlify/functions";

function convertHeadersToObject(headers: Headers) {
  const result = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function patchContentSecurity(
  headers: Record<string, string | number>,
  host: string,
) {
  const finalHeaders = {};

  const hostWithProtocol = "https://" + host;

  for (const name in headers) {
    switch (true) {
      case /content-security-policy/i.test(name):
        const patchedValue = stripMixedContentCSP(headers[name] as string)
          .replace("img-src", `img-src ${hostWithProtocol}`)
          .replace("default-src", `default-src ${hostWithProtocol}`)
          .replace("connect-src", `connect-src ${hostWithProtocol}`);

        finalHeaders[name] = patchedValue;
        break;
      // case /access-control-allow-origin/i.test(name):
      //   finalHeaders[name] = "*";
      //   break;
      default:
        finalHeaders[name] = headers[name];
    }
  }

  finalHeaders["access-control-allow-origin"] = "*";
  finalHeaders["cross-origin-resource-policy"] = "cross-origin";

  return finalHeaders;
}

function stripMixedContentCSP(CSPHeader: string) {
  return CSPHeader.replace("block-all-mixed-content", "");
}

async function fetchData(url: string, headers: Headers) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    return { statusCode: response.status || 302 };
  }
  const data = await response.arrayBuffer();
  const type = response.headers.get("content-type") || "";
  return { data, type, headers: response.headers, response };
}

async function compressData(
  data,
  useWebp: boolean,
  grayscale: boolean,
  quality: number,
  originalSize: number,
) {
  const { err, output, headers } = await compress(
    data,
    useWebp,
    grayscale,
    quality,
    originalSize,
  );
  if (err) {
    console.log("Conversion failed");
    throw err;
  }
  return { output, compressedHeaders: headers };
}

// Send the original (unmodified) image with the proxy's headers — used when the
// image shouldn't be compressed or compression fails.
function sendOriginal(
  response: VercelResponse,
  data,
  type: string,
  headers: Headers,
  host: string,
) {
  const finalHeaders = patchContentSecurity(
    convertHeadersToObject(headers),
    host,
  );
  const isSvg = typeof type === "string" && type.includes("svg");

  for (const header in finalHeaders) {
    if (isSvg) {
      if (header === "content-length") continue;
      if (header === "content-encoding") {
        response.setHeader("content-encoding", "identity");
        continue;
      }
    }
    response.setHeader(header, finalHeaders[header]);
  }

  return response.status(200).send(Buffer.from(data));
}

export default async function (
  request: VercelRequest,
  response: VercelResponse,
) {
  // request.url is the path + raw query (e.g. "/api/index?url=https://..."), so
  // read the target URL verbatim from it rather than the parsed request.query,
  // which splits and re-encodes the image's own query string. See extractTargetUrl.
  const rawQuery = request.url?.split("?").slice(1).join("?");
  let url = extractTargetUrl(rawQuery);

  // If no URL provided, return a default response
  if (!url) {
    return response.status(200).send("bandwidth-hero-proxy");
  }

  // Replace specific pattern in the URL
  url = url.replace(/http:\/\/1\.1\.\d\.\d\/bmi\/(https?:\/\/)?/i, "http://");

  let useWebp = false;
  let grayscale = true;
  let quality = 40;

  if (
    request.headers["x-image-lite-bw"] &&
    request.headers["x-image-lite-level"] &&
    request.headers["x-image-lite-jpeg"]
  ) {
    useWebp = request.headers["x-image-lite-jpeg"] === "0";
    grayscale = request.headers["x-image-lite-bw"] !== "0";
    quality =
      parseInt(request.headers["x-image-lite-level"] as string, 10) || 40;
  }

  try {
    let requestHeaders = pick(request.headers, [
      "cookie",
      "dnt",
      "referer",
      "user-agent",
      "x-forwarded-for",
    ]);

    const { data, type, headers } = await fetchData(url, requestHeaders);

    let originalSize = 0;

    try {
      originalSize = data.byteLength;
    } catch (e) {
      console.log("Error getting original size for url: ", url, e.message);
      return sendOriginal(response, data, type, headers, request.headers.host);
    }

    if (!shouldCompress(type, originalSize, useWebp)) {
      console.log(`Bypassing... Size: ${originalSize}, type: ${type}`);
      return sendOriginal(response, data, type, headers, request.headers.host);
    }

    let output;
    let compressedHeaders;
    try {
      ({ output, compressedHeaders } = await compressData(
        data,
        useWebp,
        grayscale,
        quality,
        originalSize,
      ));
    } catch (err) {
      // The proxy couldn't decode/encode this image (e.g. .ico, which sharp
      // can't read) — return the original instead of a 500 / broken image.
      console.error("Compression failed, returning original:", err.message);
      return sendOriginal(response, data, type, headers, request.headers.host);
    }

    console.log(
      `From ${originalSize}, To ${output.length}, Saved: ${(((originalSize - output.length) * 100) / originalSize).toFixed(0)}%`,
    );

    const finalHeaders = patchContentSecurity(
      { ...convertHeadersToObject(headers), ...compressedHeaders },
      request.headers.host,
    );

    for (const header in finalHeaders) {
      response.setHeader(header, finalHeaders[header]);
    }

    response.status(200).send(output);
  } catch (error) {
    console.error(error);
    return response.status(500).send(error.message || "");
  }
}

// Netlify Functions (v1) entry point. Same behavior as the Vercel handler above,
// but in the Lambda-style request/response shape Netlify expects. Netlify uses
// this `handler` export; Vercel uses the default export.
export async function handler(event: HandlerEvent) {
  let url = extractTargetUrl(event.rawQuery);

  if (!url) {
    return { statusCode: 200, body: "bandwidth-hero-proxy" };
  }

  url = url.replace(/http:\/\/1\.1\.\d\.\d\/bmi\/(https?:\/\/)?/i, "http://");

  let useWebp = false;
  let grayscale = true;
  let quality = 40;

  if (
    event.headers["x-image-lite-bw"] &&
    event.headers["x-image-lite-level"] &&
    event.headers["x-image-lite-jpeg"]
  ) {
    useWebp = event.headers["x-image-lite-jpeg"] === "0";
    grayscale = event.headers["x-image-lite-bw"] !== "0";
    quality = parseInt(event.headers["x-image-lite-level"], 10) || 40;
  }

  try {
    const requestHeaders = pick(event.headers, [
      "cookie",
      "dnt",
      "referer",
      "user-agent",
      "x-forwarded-for",
    ]);

    const { data, type, headers } = await fetchData(url, requestHeaders);
    if (!data) {
      return { statusCode: 502, body: "" };
    }

    const originalSize = data.byteLength;

    // Return the original image (base64) with proxied headers.
    const sendOriginal = () => {
      const finalHeaders = patchContentSecurity(
        convertHeadersToObject(headers),
        event.headers.host,
      );
      if (typeof type === "string" && type.includes("svg")) {
        finalHeaders["content-encoding"] = "identity";
        delete finalHeaders["content-length"];
      }
      return {
        statusCode: 200,
        body: Buffer.from(data).toString("base64"),
        isBase64Encoded: true,
        headers: finalHeaders,
      };
    };

    if (!shouldCompress(type, originalSize, useWebp)) {
      console.log(`Bypassing... Size: ${originalSize}, type: ${type}`);
      return sendOriginal();
    }

    let output;
    let compressedHeaders;
    try {
      ({ output, compressedHeaders } = await compressData(
        data,
        useWebp,
        grayscale,
        quality,
        originalSize,
      ));
    } catch (err) {
      // e.g. .ico, which sharp can't decode — return the original.
      console.error("Compression failed, returning original:", err.message);
      return sendOriginal();
    }

    return {
      statusCode: 200,
      body: output.toString("base64"),
      isBase64Encoded: true,
      headers: patchContentSecurity(
        { ...convertHeadersToObject(headers), ...compressedHeaders },
        event.headers.host,
      ),
    };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: error.message || "" };
  }
}
