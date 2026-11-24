import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Two rules are warnings, not errors, on purpose. Both are debt to burn
    // down, not bugs, and are still reported by `pnpm lint`:
    // - no-explicit-any: ~650 existing `any`s (mostly Supabase rows and
    //   catch clauses). New code should use real types.
    // - react-hooks/set-state-in-effect: React Compiler advice, ~45 hits,
    //   mostly the standard `setMounted(true)` hydration guard.
    // Every other rule from the Next.js and TypeScript configs stays an error.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated or vendored, not source we lint:
    "node_modules/**",
    "public/**",
    "coverage/**",
  ]),
])

export default eslintConfig
