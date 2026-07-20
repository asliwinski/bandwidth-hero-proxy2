# Bandwidth Hero Data Compression Service

Welcome to the **Serverless** port of Bandwidth Hero Data Compression Service 🚀. This service is designed to compress images on the fly, saving you bandwidth and improving your browsing experience.

To get started with deploying your own instance of this service, please follow the detailed instructions in the #Deployment section below.

Forked from [adi-g15/bandwidth-hero-proxy](https://github.com/adi-g15/bandwidth-hero-proxy) just trying to make the code up-to-date and error less upto my limited (equal to nothing) coding knowledge.

The original and this fork, both are, data compression service used by [Bandwidth Hero](https://github.com/ayastreb/bandwidth-hero) browser extension. It compresses (optionally grayscale) given image to low-res [WebP](https://developers.google.com/speed/webp/) or JPEG image.

It downloads original image and transforms it with [Sharp](https://github.com/lovell/sharp) on the fly without saving images on disk.

**Benefits** - It's faster for initial requests, as it doesn't require restarting a sleeping heroku server deployment, also, you may benefit from a better ping (in my case it is such)

> Note: It downloads images on user's behalf (By passing in same headers to the domain with required image), passing cookies and user's IP address through to the origin host.

## Deployment

This repo can deploy to two runtimes from the same codebase. Shared, runtime-agnostic
logic lives in `util/` (`extractTargetUrl`, `shouldCompress`, `headers`); only the image
encoder differs, because `sharp` needs native `libvips`.

### Vercel (Node + sharp)

`api/index.ts` is a Vercel serverless function that compresses with `sharp`. Connect the
repo to Vercel and it deploys automatically; the endpoint is
`https://<your-project>.vercel.app/api/index`.

### Cloudflare Workers (edge + WASM)

`worker.ts` is a Cloudflare Worker. `sharp` can't run in the Workers runtime, so it encodes
with the [`@jsquash`](https://github.com/jamsinclair/jSquash) WASM codecs
(`util/compressWasm.ts`) instead. It decodes JPEG/PNG/WebP and re-encodes to WebP/JPEG.

```sh
npm install
npm run dev:cf      # local dev
npm run deploy:cf   # deploy (needs `wrangler login` once)
```

The endpoint is `https://image-lite-backend.<your-subdomain>.workers.dev`.

Then, in the **Data Compression Service** of the extension (or the `proxies` list in the
Image Lite extension's `background.js`), point at whichever endpoint you deployed.

<!-- READ THIS ARTICLE LATER AdityaG
Check out [this guide](https://www.digitalocean.com/community/tutorials/how-to-set-up-a-node-js-application-for-production-on-ubuntu-16-04)
on how to setup Node.js on Ubuntu. 
DigitalOcean also provides an
[easy way](https://www.digitalocean.com/products/one-click-apps/node-js/) to setup a server ready to
host Node.js apps.
-->