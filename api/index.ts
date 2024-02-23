import pick from "../util/pick";
import shouldCompress from "../util/shouldCompress";
import compress from "../util/compress";
import type { VercelRequest, VercelResponse } from "@vercel/node";

import type { HandlerEvent } from "@netlify/functions";

async function handler(event: HandlerEvent) {
  let { url, jpeg, bw, l } = event.queryStringParameters;

  // If no URL provided, return a default response
  if (!url) {
    return { statusCode: 200, body: "bandwidth-hero-proxy" };
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

  const useWebp = jpeg === undefined || jpeg === "0";
  const grayscale = bw !== "0";
  const quality = parseInt(l, 10) || 40;

  try {
    let requestHeaders = pick(event.headers, [
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
      return {
        statusCode: 200,
        body: data.toString(),
        isBase64Encoded: true,
        headers,
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
      headers: { ...headers, ...compressedHeaders },
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
  return { data, type, headers: response.headers };
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
  let { url, jpeg, bw, l } = request.query;

  // If no URL provided, return a default response
  if (!url) {
    return response.status(200).send("bandwidth-hero-proxy");
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

  const useWebp = jpeg === undefined || jpeg === "0";
  const grayscale = bw !== "0";
  let quality = 40;
  if (typeof l === "string") {
    quality = parseInt(l, 10);
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

      for (const header in headers) {
        response.setHeader(header, headers[header]);
      }

      return response.status(200).send(data);
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

    const finalHeaders = { ...headers, ...compressedHeaders };

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
