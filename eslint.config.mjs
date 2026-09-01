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
    "work/pages-candidate/**",
    "work/pages-last-good/**",
    "work/.pages-candidate.*.tmp/**",
    "work/.pages-candidate.*.backup/**",
    "work/.pages-last-good.*.tmp/**",
    "work/.pages-last-good.*.backup/**",
    "work/.pages-last-good.*.staging/**",
    "work/.pages-last-good.*.json",
    "work/.monthly-index.*.json",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
