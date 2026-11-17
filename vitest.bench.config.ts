import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/** 10k 搜索基准单独跑：`npm run test:bench`，不进常规 CI。 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    env: { TZ: "Asia/Shanghai" },
    include: ["src/**/*.bench.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    disableConsoleIntercept: true,
  },
});
