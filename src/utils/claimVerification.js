export const verificationLabels = {
  MANUAL: 'Manual staff verification + acknowledgment/signature',
  QR: 'QR code only',
  BIOMETRIC: 'Live face match',
  QR_OR_BIOMETRIC: 'QR code OR live face match',
  QR_AND_BIOMETRIC: 'QR code + live face match (both required)',
  BIOMETRIC_AND_SIGNATURE: 'Live face match + signature',
}

export function manualVerificationAllowed(event) {
  return Boolean(event?.manualVerificationBasis?.trim()) && ['QR', 'BIOMETRIC', 'QR_OR_BIOMETRIC', 'MANUAL'].includes(event.verificationRequirement)
}

export function eventVerificationLabel(event) {
  const label = verificationLabels[event?.verificationRequirement] || 'Not configured'
  return manualVerificationAllowed(event) && event.verificationRequirement !== 'MANUAL'
    ? `${event.verificationRequirement === 'QR' ? 'QR code' : label} OR manual staff verification + acknowledgment/signature` : label
}
