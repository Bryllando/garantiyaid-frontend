import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: { include: ['papaparse', 'read-excel-file/web-worker'] },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/v1': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('error', (_error, _request, response) => {
            if (!response.writeHead || response.headersSent || response.writableEnded) return
            response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
            response.end(JSON.stringify({
              success: false,
              error: {
                code: 'API_UNAVAILABLE',
                message: 'The GarantiyAid API is unavailable. Start the backend on port 4000, wait until it is ready, then try again.',
              },
            }))
          })
        },
      },
      '/socket.io': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
