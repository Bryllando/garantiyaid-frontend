export function isMobileAuthenticatorDevice(device) {
  // shortcut: mobile detection is best effort; desktop-mode browsers may need manual setup.
  return /Android|iPhone|iPad|iPod/i.test(device?.userAgent || '') ||
    (device?.platform === 'MacIntel' && device?.maxTouchPoints > 1)
}
