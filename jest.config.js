/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  // Transpile TypeScript on the fly. tsconfig.json sets isolatedModules: true,
  // so ts-jest skips full type-checking and the loosely-typed handler code
  // doesn't block the test run — we only care that the tests execute.
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {}],
  },
};
