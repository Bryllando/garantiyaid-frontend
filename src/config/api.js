// Development uses Vite's local proxy; deployments can specify their HTTPS API.
export const API_BASE_URL = (import.meta.env?.VITE_API_URL?.trim()
  || (import.meta.env?.DEV ? '/api/v1' : 'http://localhost:4000/api/v1')).replace(/\/$/, '')
