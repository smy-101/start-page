import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// 独立于 vite.config.ts,避免 crx 插件干扰测试编译
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
