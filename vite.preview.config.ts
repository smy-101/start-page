import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * 预览页独立静态构建(视觉评审用):不带 CRXJS(preview 走 chrome-shim,
 * 不需要扩展环境);base "./" 使产物从任意挂载点相对加载。
 * 用法:npx vite build --config vite.preview.config.ts
 */
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "sp-preview-build",
    emptyOutDir: true,
    rollupOptions: {
      input: "preview/index.html",
    },
  },
});
