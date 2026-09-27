import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // === ДОБАВЛЕНО: Проксирование загруженных фото на локальный бэкенд ===
      '/uploads': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },

  build: {
    sourcemap:false,
    // Увеличиваем лимит до 1500 kB, чтобы гарантированно скрыть предупреждение 
    // (Ant Design весит много, и это нормально для production)
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-antd': ['antd', '@ant-design/icons'],
          'vendor-utils': ['dayjs'], // Убрали пробел и axios для надёжности
        },
      },
    },
    // Дополнительно включаем сжатие brotli и gzip для уменьшения размера файлов
    reportCompressedSize: true,

  },
})
