export function isDeveloperStaffAccount(user) {
  return user?.employeeId === 'DEV-ADMIN' && user.role === 'SYSTEM_ADMIN'
}

export function staffBarangayScope(user) {
  if (['SYSTEM_ADMIN', 'DSWD_STAFF'].includes(user?.role)) return 'All barangays in this system'
  if (user?.role === 'BARANGAY_FACILITATOR') {
    return user.barangay?.barangayName
      ? [user.barangay.barangayName, user.barangay.city].filter(Boolean).join(', ')
      : 'No barangay assigned'
  }
  return 'Scope unavailable'
}
