export const staffTemplateGuide = [
  ['Full name', 'Required. Use the staff member’s complete name.', 'Maria Santos'],
  ['Email', 'Required. Use a unique email the staff member can access.', 'maria@example.com'],
  ['Role', 'Choose DSWD Staff or Barangay Facilitator. You can also select one role for the entire file in the next step.', 'Barangay Facilitator'],
  ['Username', 'Required for Barangay Facilitators. Use a unique username; leave blank for DSWD Staff.', 'maria.santos'],
  ['Contact number', 'Optional. Use a Philippine mobile number and keep the cell as Text.', '09171234567'],
  ['Barangay', 'Required for Barangay Facilitators. Use an existing active barangay code or name, then confirm the assignment.', 'San Nicolas, Cebu City'],
]

export const beneficiaryTemplateGuide = [
  ['First name', 'Required. Keep first, middle and last names in separate columns.', 'Maria'],
  ['Middle name', 'Optional. Leave blank if there is no middle name.', 'Reyes'],
  ['Last name', 'Required.', 'Santos'],
  ['Birth date', 'Required. Use YYYY-MM-DD. The next step also supports matching other date formats.', '1990-05-23'],
  ['Sex', 'Required. Use MALE, FEMALE, OTHER or UNKNOWN.', 'FEMALE'],
  ['Address', 'Required. Enter the home address.', '12 Mabini Street'],
  ['Sitio / Purok', 'Optional.', 'Purok 2'],
  ['Barangay', 'Required. Use an existing barangay or choose one for the file. Barangay staff can import only their assigned area.', 'San Nicolas, Cebu City'],
  ['Mobile number', 'Optional. Keep the cell as Text to preserve the leading zero.', '09171234567'],
  ['Email', 'Optional. Leave blank if unavailable.', 'maria@example.com'],
  ['PhilSys number', 'Optional. Enter only a verified number; keep it as Text. Do not invent a value.', ''],
  ['Assistance program', 'Required for program applications. Use an existing active program code or name, or select one program for the file during import.', 'FOOD-2026'],
]

export const barangayTemplateGuide = [
  ['Barangay name', 'Required. Enter the official barangay name.', 'San Nicolas'],
  ['Barangay code', 'Optional. Use the official code if available. Keep as Text to preserve leading zeroes. Leave blank if unknown.', ''],
  ['City / Municipality', 'Required. Use the official city or municipality name.', 'Cebu City'],
  ['Province', 'Required. Use the official province name.', 'Cebu'],
]

export const programTemplateGuide = [
  ['Program name', 'Required. Use the full assistance program name (up to 150 characters).', 'Emergency Food Assistance'],
  ['Program code', 'Required and unique. Use 3-30 letters, numbers or hyphens. No spaces.', 'FOOD-2026'],
  ['Program type', 'Required. Use 2-20 letters, numbers or underscores, such as FOOD or CASH.', 'FOOD'],
  ['Description', 'Optional. Describe the assistance and intended recipients.', 'Food packs for affected households.'],
  ['Grant amount', 'Optional. Amount per beneficiary in PHP. Use a number without a currency symbol or thousands separator.', '1500.00'],
  ['Budget amount', 'Optional. Total program budget in PHP. Use a number without a currency symbol or thousands separator.', '150000.00'],
  ['Application start date', 'Optional. Use YYYY-MM-DD.', '2026-11-01'],
  ['Application end date', 'Optional. Use YYYY-MM-DD, on or after the start date.', '2026-11-30'],
  ['Required documents', 'Optional. Separate document types with semicolons: VALID_ID; BIRTH_CERTIFICATE; BARANGAY_CERTIFICATE; PROOF_OF_RESIDENCY; MEDICAL_CERTIFICATE; PWD_ID; SENIOR_CITIZEN_ID; OTHER.', 'VALID_ID; BARANGAY_CERTIFICATE'],
]

export const importTemplateGuides = { staff: staffTemplateGuide, beneficiaries: beneficiaryTemplateGuide, programs: programTemplateGuide, barangays: barangayTemplateGuide }
export const importTemplateNotes = {
  staff: 'Create DSWD Staff or Barangay Facilitator accounts. Facilitators need a unique username and an existing active barangay. Do not include passwords.',
  beneficiaries: 'Use actual beneficiary details. Match existing barangays during import. Include an assistance program only when importing program applications.',
  programs: 'Imported programs are saved as Draft. Review eligibility rules and documents before activation.',
  barangays: 'Create new barangays only. Existing records, including inactive barangays, are checked for duplicates.',
}

export const IMPORT_TEMPLATE_INSTRUCTIONS = 'INSTRUCTIONS AND EXAMPLES - not imported'
export const IMPORT_TEMPLATE_DATA = 'DATA ENTRY - add records below the column headings'
export const IMPORT_TEMPLATE_GUIDE_LIMIT = 40
export const IMPORT_TEMPLATE_ENTRY_HINT = 'Start on row 6. * Required. Keep rows 1-5; row 5 shows formats and examples.'

export const importTemplateGroups = {
  staff: [['Staff details', 0, 1], ['Account access', 2, 3], ['Contact and assignment', 4, 5]],
  beneficiaries: [['Personal details', 0, 4], ['Residence', 5, 7], ['Contact and identity', 8, 10], ['Program application', 11, 11]],
  programs: [['Program details', 0, 3], ['Funding (PHP)', 4, 5], ['Application period', 6, 7], ['Requirements', 8, 8]],
  barangays: [['Barangay details', 0, 1], ['Location', 2, 3]],
}

export const importTemplateHints = {
  staff: { fullName: 'e.g. Maria Santos', email: 'Unique staff email', role: 'DSWD Staff / Barangay Facilitator', username: 'Required for facilitators', contactNumber: 'Text: 09171234567', barangayId: 'Facilitators: existing barangay' },
  beneficiaries: { firstName: 'e.g. Maria', middleName: 'Optional; e.g. Reyes', lastName: 'e.g. Santos', birthDate: 'YYYY-MM-DD', sex: 'MALE / FEMALE / OTHER / UNKNOWN', address: 'House no., street', sitioPurok: 'Optional; e.g. Purok 2', barangayId: 'Existing barangay or match at import', contactNumber: 'Text: 09171234567', email: 'Optional email address', philsysNumber: 'Verified number as Text; optional', programId: 'Existing active program code/name' },
  programs: { programName: 'Full assistance program name', programCode: 'Unique; e.g. FOOD-2026', programType: 'e.g. FOOD or CASH', description: 'Purpose and intended recipients', grantAmount: 'Per beneficiary; e.g. 1500.00', budgetAmount: 'Total budget; e.g. 150000.00', applicationStartDate: 'YYYY-MM-DD; optional', applicationEndDate: 'YYYY-MM-DD; not before start', requiredDocumentTypes: 'e.g. VALID_ID; BARANGAY_CERTIFICATE' },
  barangays: { barangayName: 'Official name; e.g. San Nicolas', barangayCode: 'Official code as Text; optional', city: 'e.g. Cebu City', province: 'e.g. Cebu' },
}

export function templateHeading([field, heading, required]) {
  return `${heading}${field.endsWith('Amount') ? ' (PHP)' : ''}${required ? ' *' : ''}`
}

export function templateFileName(label, includeProgram = false) {
  const name = { staff: 'staff', beneficiaries: includeProgram ? 'beneficiary-applications' : 'beneficiary', programs: 'program', barangays: 'barangay' }[label]
  return `garantiyaid-${name}-template.xlsx`
}
