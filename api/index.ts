import { Readable } from "stream";
import pick from "../util/pick";
import shouldCompress from "../util/shouldCompress";
import compress from "../util/compress";
import type { VercelRequest, VercelResponse } from "@vercel/node";

import type { HandlerEvent } from "@netlify/functions";

function arrayBufferToStream(arrayBuffer: ArrayBuffer) {
  return new Readable({
    read() {
      this.push(Buffer.from(arrayBuffer));
      this.push(null);
    },
  });
}

function patchContentSecurity(headers: Headers, host: string) {
  const finalHeaders = {};

  const hostWithProtocol = "https://" + host;

  for (const [name, value] of new Headers(headers)) {
    if (/content-security-policy/i.test(name)) {
      const patchedValue = stripMixedContentCSP(value)
        .replace("img-src", `img-src ${hostWithProtocol}`)
        .replace("default-src", `default-src ${hostWithProtocol}`)
        .replace("connect-src", `connect-src ${hostWithProtocol}`);

      finalHeaders[name] = patchedValue;
    } else {
      finalHeaders[name] = value;
    }
  }

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

    const originalSize = data.byteLength;

    if (!shouldCompress(type, originalSize, useWebp)) {
      console.log("Bypassing... Size: ", data.byteLength);

      return {
        statusCode: 200,
        body: Buffer.from(data).toString("base64"),
        headers: patchContentSecurity(headers, event.headers.host),
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
      `From ${originalSize}, Saved: ${(originalSize - output.length) / originalSize}%`,
    );

    let body = output.toString("base64");

    return {
      statusCode: 200,
      body: body,
      isBase64Encoded: true,
      headers: patchContentSecurity(
        { ...headers, ...compressedHeaders },
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

    const originalSize = data.byteLength;

    if (!shouldCompress(type, originalSize, useWebp)) {
      console.log("Bypassing... Size: ", data.byteLength);

      const finalHeaders = patchContentSecurity(headers, request.headers.host);

      for (const header in finalHeaders) {
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
      `From ${originalSize}, Saved: ${(originalSize - output.length) / originalSize}%`,
    );

    // let body = output.toString("base64");

    const finalHeaders = patchContentSecurity(
      { ...headers, ...compressedHeaders },
      request.headers.host,
    );

    for (const header in finalHeaders) {
      response.setHeader(header, finalHeaders[header]);
    }

    response.status(200).send(output);

    // return {
    //   statusCode: 200,
    //   body: body,
    //   isBase64Encoded: true,
    //   headers: { ...headers, ...compressedHeaders },
    // };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: error.message || "" };
  }
}
