// Only the account destinations used by security notices may survive sign-in.
const destinations = new Set(['/account', ...['profile', 'password', 'authenticator', 'recovery', 'sessions'].map((section) => `/account?section=${section}`)])
export function accountReturnPath(value) {
  return destinations.has(value) ? value : null
}
