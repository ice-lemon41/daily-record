import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 更新由应用里的提示条接管，绝不自动 reload（PRD FR-11-3）。
      registerType: "prompt",
      injectRegister: null,
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "日常记录",
        short_name: "日常",
        description: "单机、本地优先的随手记",
        lang: "zh-CN",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "portrait",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // 除静态资源外不发起任何请求（PRD FR-11 / 技术方案 §7.2）。
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
});
