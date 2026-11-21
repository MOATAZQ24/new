/**
 * Project: Investor Gate OS (IGOS)
 * Original Developer: Moataz Qasem
 * Initial Development Year: 2026
 *
 * Developer attribution and provenance are maintained
 * according to the project's governance policy.
 *
 * See AUTHORS.md and NOTICE.
 */

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
  ]),
]);

export default eslintConfig;
