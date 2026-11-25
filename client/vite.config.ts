import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 6060,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:6061', // 127.0.0.1, not "localhost": looking up localhost can take seconds on some Macs
        changeOrigin: true,
      },
    },
  },
})
