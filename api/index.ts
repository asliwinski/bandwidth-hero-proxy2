import pick from "../util/pick";
import shouldCompress from "../util/shouldCompress";
import compress from "../util/compress";
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

function assembleURL(baseURL, queryParams) {
  const url = new URL(baseURL);

  Object.keys(queryParams).forEach((key) => {
    url.searchParams.append(key, queryParams[key]);
  });

  return url.toString();
}

async function handler(event: HandlerEvent) {
  let { url, ...rest } = event.queryStringParameters;

  // If no URL provided, return a default response
  if (!url) {
    return { statusCode: 200, body: "bandwidth-hero-proxy" };
  }

  if (rest) {
    url = assembleURL(url, rest);
  }

  // Parse URL if it's in JSON format
  try {
    url = JSON.parse(url);
  } catch {}

  // If URL is an array, join it with "&url="
  if (Array.isArray(url)) {
    url = url.join("&url=");
  }

  // Replace specific pattern in the URL
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
    let requestHeaders = pick(event.headers, [
      "cookie",
      "dnt",
      "referer",
      "user-agent",
      "x-forwarded-for",
    ]);

    const { data, type, headers, response } = await fetchData(
      url,
      requestHeaders,
    );

    let originalSize = 0;

    try {
      originalSize = data.byteLength;
    } catch (e) {
      console.log("Error getting original size for url: ", url, e.message);

      return {
        statusCode: 200,
        body: Buffer.from(data).toString("base64"),
        headers: patchContentSecurity(
          convertHeadersToObject(headers),
          event.headers.host,
        ),
        isBase64Encoded: true,
      };
    }

    if (!shouldCompress(type, originalSize, useWebp)) {
      console.log(`Bypassing... Size: ${originalSize}, type: ${type}`);

      const processedHeaders = patchContentSecurity(
        convertHeadersToObject(headers),
        event.headers.host,
      );

      if (type.includes("svg")) {
        processedHeaders["content-encoding"] = "identity";
        delete processedHeaders["content-length"];
      }

      const body = Buffer.from(data).toString("base64");

      return {
        statusCode: 200,
        body,
        headers: processedHeaders,
        isBase64Encoded: true,
      };
    }

    const { output, compressedHeaders } = await compressData(
      data,
      useWebp,
      grayscale,
      quality,
      originalSize,
    );

    console.log(
      `From ${originalSize}, To ${output.length}, Saved: ${(((originalSize - output.length) * 100) / originalSize).toFixed(0)}%`,
    );

    let body = output.toString("base64");

    return {
      statusCode: 200,
      body: body,
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

export { handler };
export default async function (
  request: VercelRequest,
  response: VercelResponse,
) {
  let { url, ...rest } = request.query;

  // If no URL provided, return a default response
  if (!url) {
    return response.status(200).send("bandwidth-hero-proxy");
  }

  if (rest) {
    url = assembleURL(url, rest);
  }

  // Parse URL if it's in JSON format
  try {
    if (typeof url === "string") {
      url = JSON.parse(url);
    }
  } catch {}

  // If URL is an array, join it with "&url="
  if (Array.isArray(url)) {
    url = url.join("&url=");
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

      const finalHeaders = patchContentSecurity(
        convertHeadersToObject(headers),
        request.headers.host,
      );

      for (const header in finalHeaders) {
        response.setHeader(header, finalHeaders[header]);
      }

      return response.status(200).send(Buffer.from(data));
    }

    if (!shouldCompress(type, originalSize, useWebp)) {
      console.log(`Bypassing... Size: ${originalSize}, type: ${type}`);

      const finalHeaders = patchContentSecurity(
        convertHeadersToObject(headers),
        request.headers.host,
      );

      for (const header in finalHeaders) {
        if (type.includes("svg")) {
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

    const { output, compressedHeaders } = await compressData(
      data,
      useWebp,
      grayscale,
      quality,
      originalSize,
    );

    console.log(
      `From ${originalSize}, To ${output.length}, Saved: ${(((originalSize - output.length) * 100) / originalSize).toFixed(0)}%`,
    );

    // let body = output.toString("base64");

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
    return { statusCode: 500, body: error.message || "" };
  }
}
