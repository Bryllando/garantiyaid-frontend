import assert from 'node:assert/strict'
import { createServer as createHttpServer } from 'node:http'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { createServer } from 'vite'
import config from '../vite.config.js'
import { realtimeServerUrl } from '../src/realtime/staffRealtime.js'

test('local API proxy forwards login and protected requests and reports an unavailable backend', async (t) => {
  const requests = []
  const backend = createHttpServer(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk
    requests.push({ path: request.url, method: request.method, headers: request.headers, body })
    const denied = request.headers.origin === 'https://untrusted.example'
    response.writeHead(denied ? 403 : request.url.endsWith('/login') ? 401 : 200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(denied
      ? { error: { code: 'CORS_ORIGIN_DENIED' } }
      : request.url.endsWith('/login')
        ? { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid staff credentials.' } }
        : { data: { status: 'ok' } }))
  })
  backend.listen(0, '127.0.0.1')
  await once(backend, 'listening')
  t.after(() => { backend.closeAllConnections(); backend.close() })
  const target = `http://127.0.0.1:${backend.address().port}`
  const vite = await createServer({
    ...config,
    configFile: false,
    root: fileURLToPath(new URL('../', import.meta.url)),
    cacheDir: '../.tmp/login-proxy-cache',
    logLevel: 'silent',
    server: {
      ...config.server,
      host: '127.0.0.1', port: 0, hmr: false, ws: false,
      proxy: {
        '/api/v1': { ...config.server.proxy['/api/v1'], target },
        '/socket.io': { ...config.server.proxy['/socket.io'], target },
      },
    },
  })
  t.after(() => vite.close())
  await vite.listen()
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  const api = await vite.ssrLoadModule('/src/config/api.js')
  assert.equal(api.API_BASE_URL, '/api/v1')
  assert.equal(config.server.port, 5173)
  assert.equal(config.server.strictPort, true)
  assert.equal(config.server.proxy['/socket.io'].ws, true)

  const loginBody = JSON.stringify({ identifier: 'test.staff', password: 'test-only-password' })
  const login = await fetch(`${origin}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: loginBody,
  })
  assert.equal(login.status, 401)
  assert.equal((await login.json()).error.code, 'INVALID_CREDENTIALS')
  assert.equal(requests[0].path, '/api/v1/auth/login')
  assert.equal(requests[0].method, 'POST')
  assert.equal(requests[0].body, loginBody)
  assert.equal(requests[0].headers.origin, 'http://localhost:5173')

  const protectedResponse = await fetch(`${origin}/api/v1/auth/me`, { headers: { Authorization: 'Bearer test-only-token' } })
  assert.equal(protectedResponse.status, 200)
  await protectedResponse.json()
  assert.equal(requests[1].headers.authorization, 'Bearer test-only-token')

  const denied = await fetch(`${origin}/api/v1/health`, { headers: { Origin: 'https://untrusted.example' } })
  assert.equal(denied.status, 403)
  assert.equal((await denied.json()).error.code, 'CORS_ORIGIN_DENIED')

  backend.closeAllConnections()
  await new Promise((resolve) => backend.close(resolve))
  const unavailable = await fetch(`${origin}/api/v1/auth/login`, { method: 'POST', body: loginBody })
  assert.equal(unavailable.status, 503)
  assert.equal(unavailable.headers.get('cache-control'), 'no-store')
  assert.equal((await unavailable.json()).error.code, 'API_UNAVAILABLE')
  assert.equal(requests.filter((request) => request.path.endsWith('/login')).length, 1)
})

test('relative API addresses send live updates through the same frontend origin', (t) => {
  const previous = globalThis.window
  globalThis.window = { location: { origin: 'http://localhost:5173' } }
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous })
  assert.equal(realtimeServerUrl('/api/v1'), 'http://localhost:5173')
  assert.equal(realtimeServerUrl('https://api.example.test/api/v1'), 'https://api.example.test')
})

test('an explicitly configured HTTPS API still overrides the development proxy', async (t) => {
  const vite = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../', import.meta.url)),
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false, ws: false },
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify('https://api.example.test/api/v1/') },
  })
  t.after(() => vite.close())
  const { API_BASE_URL } = await vite.ssrLoadModule('/src/config/api.js')
  assert.equal(API_BASE_URL, 'https://api.example.test/api/v1')
  assert.equal(realtimeServerUrl(API_BASE_URL), 'https://api.example.test')
})
