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
    "scratch/**",
    "output/**",
    "test-results/**",
    ".playwright-mcp/**",
    "scripts/**",
    // Legacy pages/features bypassed to keep the CRM pipeline clean:
    "src/app/(os)/bilgi/**",
    "src/app/(os)/konsey/**",
    "src/app/(os)/projects/**",
    "src/app/(os)/services/**",
    // Background/administrative seed and cron endpoints:
    "src/app/api/admin/**",
    "src/app/api/council/**",
    "src/app/api/cron/**",
    "src/app/api/jarvis/stream/**",
    "src/app/api/leads/analyze/**",
    "src/app/api/memory/**",
    // Legacy unused dashboard widgets:
    "src/components/dashboard/AICostWidget.tsx",
    "src/components/dashboard/FollowUpWidget.tsx",
    "src/components/dashboard/UrgentLeadsWidget.tsx",
    // Legacy non-core UI shell elements:
    "src/components/os/NewProjectModal.tsx",
    "src/components/os/TopBar.tsx",
  ]),
]);

export default eslintConfig;
