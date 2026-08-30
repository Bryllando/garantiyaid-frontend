export const STAFF_PASSWORD_MIN_LENGTH = 12
export const STAFF_PASSWORD_MAX_LENGTH = 72

export function getPasswordReadiness(password = '') {
  const length = password.length
  const remaining = Math.max(0, STAFF_PASSWORD_MIN_LENGTH - length)
  const progress = Math.min(100, Math.round((length / STAFF_PASSWORD_MIN_LENGTH) * 100))

  if (length === 0) {
    return {
      label: 'Start typing',
      message: 'Use 12–72 characters. A long, unique passphrase is recommended.',
      progress: 0,
      tone: 'neutral',
    }
  }

  if (length < 8) {
    return {
      label: 'Too short',
      message: `Add ${remaining} more ${remaining === 1 ? 'character' : 'characters'} to reach the minimum.`,
      progress,
      tone: 'danger',
    }
  }

  if (length < STAFF_PASSWORD_MIN_LENGTH) {
    return {
      label: 'Almost there',
      message: `${remaining} more ${remaining === 1 ? 'character' : 'characters'} needed.`,
      progress,
      tone: 'warning',
    }
  }

  return {
    label: 'Ready to use',
    message: 'Meets the 12-character requirement. Keep it unique to this account.',
    progress: 100,
    tone: 'success',
  }
}
