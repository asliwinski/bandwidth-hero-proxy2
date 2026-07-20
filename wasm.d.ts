// Cloudflare Workers / wrangler bundles imported .wasm files as compiled
// WebAssembly modules. This ambient declaration lets TypeScript understand the
// `import X from "*.wasm"` statements in util/compressWasm.ts.
declare module "*.wasm" {
  const wasmModule: WebAssembly.Module;
  export default wasmModule;
}
