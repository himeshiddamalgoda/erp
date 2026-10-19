import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
export default defineConfig([
  ...nextVitals,
  globalIgnores([
    ".next/**",
    "out/**",
    "dist/**",
    "test-results/**",
    "playwright-report/**",
  ]),
  {
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: [
      "src/components/**/*.{js,jsx}",
      "src/features/*/components/**/*.{js,jsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "axios",
              message:
                "HTTP belongs in feature services; page controllers own fetching.",
            },
            {
              name: "@tanstack/react-query",
              message: "Use query hooks only from page controllers.",
            },
          ],
          patterns: [
            {
              group: [
                "**/services/**",
                "**/hooks/use-quotation*",
                "**/hooks/use-sales-order*",
                "**/hooks/use-customer*",
                "**/hooks/use-sales-team*",
                "**/hooks/use-staff*",
                "**/hooks/use-assignment*",
                "@/lib/axios",
              ],
              message:
                "Pass API data and callbacks from the page; reusable components must not fetch.",
            },
          ],
        },
      ],
    },
  },
]);
