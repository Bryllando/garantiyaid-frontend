import { createLogger, defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export function createDevProxyLogger(logger = createLogger()) {
  let lastConnectionWarning = -Infinity
  const logError = logger.error.bind(logger)
  logger.error = (message, options) => {
    if (['ECONNREFUSED', 'ECONNRESET'].includes(options?.error?.code) && /(?:http|ws) proxy error:/.test(message)) {
      if (Date.now() - lastConnectionWarning >= 30_000) {
        lastConnectionWarning = Date.now()
        logger.warn(`GarantiyAid backend connection lost (${options.error.code}). Run "npm start" in garantiyaid-backend and keep that terminal open. Live updates retry automatically.`, { timestamp: true })
      }
      return
    }
    logError(message, options)
  }
  return logger
}

function configureApiProxy(proxy) {
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
}

export function validateProductionApiUrl(value) {
  let url
  try { url = new URL(value?.trim()) } catch { throw new Error('Set VITE_API_URL to the deployed HTTPS API URL ending in /api/v1 before building.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || url.pathname.replace(/\/$/, '') !== '/api/v1') {
    throw new Error('VITE_API_URL must be an HTTPS deployment URL ending in /api/v1, without credentials, query values or fragments.')
  }
}

export default defineConfig({
  customLogger: createDevProxyLogger(),
  plugins: [react(), tailwindcss(), { name: 'deployment-api-check', apply: 'build', configResolved(config) { validateProductionApiUrl(config.env.VITE_API_URL) } }],
  optimizeDeps: { include: ['papaparse', 'read-excel-file/web-worker'] },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/v1': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        configure: configureApiProxy,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        ws: true,
        configure: configureApiProxy,
      },
    },
  },
})
