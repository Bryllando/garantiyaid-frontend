export const reportEvent = {
  distributionId: '11111111-1111-4111-8111-111111111111', title: 'Community assistance - November distribution',
  distributionDate: '2026-11-17', status: 'OPEN', location: 'Apas Barangay Hall', deliveryMode: 'SIMULATED_WALLET',
  program: { programId: 'program-1', programName: 'Emergency assistance for families in crisis situations', programCode: 'AID-2026' },
  barangay: { barangayId: 'apas', barangayName: 'Apas' },
}
const generatedAt = '2026-11-17T13:15:00Z'

export function reportFixture(scope) {
  const physical = scope.distributionId?.endsWith('2')
  const event = { ...reportEvent, distributionId: scope.distributionId || reportEvent.distributionId, deliveryMode: physical ? 'PHYSICAL_GOODS' : 'SIMULATED_WALLET' }
  const funds = { allocatedAmount: '75000.00', netCreditedAmount: physical ? '0.00' : '57000.00', remainingAmount: physical ? '75000.00' : '18000.00' }
  const allClaims = Array.from({ length: 43 }, (_, index) => ({
    claimId: `claim-${index + 1}`, beneficiaryName: index === 22 ? `${'María José Peñalosa Dela Cruz '.repeat(12)}LONG-NAME-END` : `QA Peña ${index + 1}`,
    recordedAt: generatedAt, queueNumber: index + 1, verificationMethod: 'QR', deliveryMode: event.deliveryMode,
    claimStatus: index < 38 ? 'CLAIMED' : 'VERIFIED', allocatedAmount: '1500.00', claimedAt: index < 38 ? generatedAt : null,
    releasedAt: physical && index < 38 ? generatedAt : null, releasedBy: { fullName: 'QA Facilitator' }, releaseEvidenceReference: `RELEASE-LOG-${index + 1}`,
    releasedPackageName: 'Family food pack', releasedPackageUnit: 'packs', releasedQuantity: physical && index < 38 ? 2 : null,
  }))
  const allSchedules = Array.from({ length: 50 }, (_, index) => ({ scheduleId: `schedule-${index + 1}`, slotStart: generatedAt, sessionLabel: 'Afternoon session', beneficiaryName: `QA Peña ${index + 1}`, queueNumber: index + 1, assignedByAi: index % 2 === 0, scheduleStatus: index < 38 ? 'CHECKED_IN' : 'SCHEDULED', claimStatus: allClaims[index]?.claimStatus }))
  const anomalies = ['QR_SCAN', 'BIOMETRIC', 'DUPLICATE_CLAIM', 'TRANSACTION'].map((category, index) => ({ anomalyId: `${category}-${index}`, occurredAt: generatedAt, category, result: ['DUPLICATE', 'LIVENESS_FAILED', 'DUPLICATE', 'REVERSED'][index], severity: 'HIGH' }))
  const rows = scope.type === 'CLAIMS' ? allClaims.filter(row => !scope.status || row.claimStatus === scope.status) : scope.type === 'SCHEDULES' ? allSchedules.filter(row => !scope.status || row.scheduleStatus === scope.status) : scope.type === 'ANOMALIES' ? anomalies : [{ distribution: event, utilization: funds }]
  const pagination = { page: 1, pageSize: Math.max(rows.length, 1), total: rows.length, totalPages: rows.length ? 1 : 0 }
  let data
  if (scope.type === 'CLAIMS') data = { claims: rows, summary: { matchingClaimCount: rows.length, statusCounts: { CLAIMED: 38, VERIFIED: 5 } }, pagination }
  else if (scope.type === 'SCHEDULES') data = { schedules: rows, summary: { matchingScheduleCount: rows.length, statusCounts: { CHECKED_IN: 38, SCHEDULED: 12 } }, pagination }
  else if (scope.type === 'ANOMALIES') data = { anomalies: rows, summary: { total: 4, qrAnomalyCount: 1, biometricAnomalyCount: 1, duplicateClaimFlagCount: 1, transactionAnomalyCount: 1 }, pagination }
  else if (scope.type === 'FUNDS') data = { distributions: rows, totals: funds, pagination }
  else data = {
    distribution: event, beneficiaries: { allocatedCount: 50, claimedCount: 38, verifiedCount: 5, unclaimedCount: 12, checkedInCount: 38, claimCompletionPercentage: '76.00', allocationStatusCounts: { CLAIMED: 38, ALLOCATED: 12 } },
    slots: { activeQueueCount: 50, totalCapacity: 64, capacityUtilizationPercentage: '78.13' }, fundUtilization: funds,
    physicalPackage: physical ? { handoverCount: 38, recordedQuantity: '76', unit: 'packs', voidedClaimQuantity: 0, quantityNotRecordedCount: 0 } : null,
  }
  const report = { reportType: scope.type, snapshotComplete: true, generatedAt, timeZone: 'Asia/Manila', coverage: scope, event, distributionId: scope.type === 'FUNDS' ? null : event.distributionId, data,
    facts: [
      { id: 'coverage', label: 'Report coverage', explanation: 'Every matching record is included in this generated snapshot. Date coverage uses Philippine time.' },
      { id: 'assistance', label: 'Recorded assistance', explanation: 'Attendance, identity verification, and completed assistance are separate workflow stages.' },
      { id: 'simulation', label: 'Simulation disclosure', explanation: 'Wallet amounts describe the internal prototype ledger. No real funds are transferred.' },
    ],
  }
  if (scope.type === 'SUMMARY') report.supportingReports = Object.fromEntries(['CLAIMS', 'SCHEDULES', 'ANOMALIES', 'FUNDS'].map(type => [type, reportFixture({ type, distributionId: event.distributionId })]))
  return report
}

export const auditFixtures = Array.from({ length: 27 }, (_, index) => ({
  auditId: `audit-${index + 1}`, createdAt: generatedAt, actorType: index % 3 ? 'STAFF' : 'SYSTEM',
  action: 'REPORT_SNAPSHOT_GENERATED', entityAffected: 'REPORT', recordId: reportEvent.distributionId,
  user: index % 3 ? { fullName: 'QA Reviewer Peña', employeeId: 'STAFF-QA' } : null,
  details: { format: 'JSON', password: '[REDACTED]', rowCount: 43, description: index === 26 ? `${'Sanitized explanation of the recorded report action. '.repeat(180)}AUDIT-DETAIL-END` : `QA record ${index + 1}` },
}))
