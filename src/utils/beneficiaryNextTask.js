export function getBeneficiaryNextTask(beneficiary, documents, role) {
  if (!beneficiary) return null
  if (role === 'DSWD_STAFF' && documents.some((item) => item.reviewStatus === 'SUBMITTED')) {
    return { title: 'Review submitted documents', detail: 'Check each submitted file and record a decision.', href: '#beneficiary-documents-heading', action: 'Review documents' }
  }
  if (!['SYSTEM_ADMIN', 'BARANGAY_FACILITATOR'].includes(role)) return null
  if (beneficiary.status !== 'ACTIVE') {
    return { title: 'Check the record status', detail: 'An inactive record cannot be submitted to a program.', href: '#beneficiary-details-heading', action: 'View record details' }
  }
  if (documents.some((item) => item.reviewStatus === 'REJECTED')) {
    return { title: 'Replace a rejected document', detail: 'Read the reviewer’s reason and upload a corrected file.', href: '#beneficiary-documents-heading', action: 'Open documents' }
  }
  return { title: 'Choose an assistance program', detail: 'Check the program’s document requirements before submitting this record.', href: '#beneficiary-enrollment-heading', action: 'Check program requirements' }
}
