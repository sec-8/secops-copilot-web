import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/chat': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // 不 rewrite：后端路由是 /chat/stream，rewrite 会把 /chat 替换为控
      },
      '/extract': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ask': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  }
})
