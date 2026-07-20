// Netlify Functions entry point. It re-exports ONLY the `handler` (v1 / Lambda
// shape) from api/index.ts — no default export — so Netlify uses the v1 runtime
// rather than mistaking the file's Vercel default export for a v2 function.
export { handler } from "../../api/index";
