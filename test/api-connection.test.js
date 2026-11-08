import assert from 'node:assert/strict'
import { createServer as createHttpServer } from 'node:http'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { createServer } from 'vite'
import config, { createDevProxyLogger, validateProductionApiUrl } from '../vite.config.js'
import { realtimeServerUrl } from '../src/realtime/staffRealtime.js'

test('development proxy reports connection outages at most once per 30 seconds and preserves other errors', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 })
  const warnings = []
  const errors = []
  const logger = createDevProxyLogger({
    warn: (...args) => warnings.push(args),
    error: (...args) => errors.push(args),
  })
  const refused = { error: { code: 'ECONNREFUSED' } }
  const reset = { error: { code: 'ECONNRESET' } }
  logger.error('http proxy error: /socket.io/', refused)
  for (let i = 0; i < 5; i += 1) logger.error('ws proxy error:', refused)
  logger.error('http proxy error: /api/v1/beneficiaries', reset)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0][0], /npm start.*garantiyaid-backend/)
  assert.match(warnings[0][0], /ECONNREFUSED/)
  t.mock.timers.tick(30_000)
  logger.error('ws proxy error:', reset)
  assert.equal(warnings.length, 2)
  assert.match(warnings[1][0], /ECONNRESET/)

  const unexpected = { error: { code: 'EPROTO' } }
  logger.error('ws proxy error:', unexpected)
  logger.error('Unrelated application error', refused)
  assert.deepEqual(errors, [['ws proxy error:', unexpected], ['Unrelated application error', refused]])
})

test('production builds require a deployed HTTPS API without bundled credentials', () => {
  assert.doesNotThrow(() => validateProductionApiUrl('https://api.example.test/api/v1/'))
  for (const value of [undefined, '', '/api/v1', 'http://api.example.test/api/v1', 'https://localhost/api/v1', 'https://user:secret@api.example.test/api/v1', 'https://api.example.test', 'https://api.example.test/api/v1?token=secret']) {
    assert.throws(() => validateProductionApiUrl(value), /VITE_API_URL/)
  }
})

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
  const pollingUnavailable = await fetch(`${origin}/socket.io/?EIO=4&transport=polling`)
  assert.equal(pollingUnavailable.status, 503)
  assert.equal(pollingUnavailable.headers.get('cache-control'), 'no-store')
  assert.equal((await pollingUnavailable.json()).error.code, 'API_UNAVAILABLE')
  assert.equal(requests.filter((request) => request.path.endsWith('/login')).length, 1)

  backend.listen(Number(new URL(target).port), '127.0.0.1')
  await once(backend, 'listening')
  const recovered = await fetch(`${origin}/api/v1/health`)
  assert.equal(recovered.status, 200)
  await recovered.json()
  const pollingRecovered = await fetch(`${origin}/socket.io/?EIO=4&transport=polling`)
  assert.equal(pollingRecovered.status, 200)
  await pollingRecovered.json()
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
    cacheDir: 'node_modules/.vite-verify/api-connection-override',
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
