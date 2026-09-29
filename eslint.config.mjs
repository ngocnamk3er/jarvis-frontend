import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored build output, not source — a minified single-line file this
    // size reads to ESLint as thousands of violations on one line. Copied
    // from pdfjs-dist/build (see source-viewer.tsx + package.json's
    // postinstall); nothing here is ever meant to pass a source-code lint.
    "public/pdf.worker.min.mjs",
  ]),
]);

export default eslintConfig;
