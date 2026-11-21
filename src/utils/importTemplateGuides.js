export const staffTemplateGuide = [
  ['Full name', 'Required. Use the staff member’s complete name.', 'Maria Santos'],
  ['Email', 'Required. Use a unique email the staff member can access.', 'maria.santos@example.invalid'],
  ['Role', 'Choose DSWD Staff or Barangay Facilitator. You can also select one role for the entire file in the next step.', 'Barangay Facilitator'],
  ['Username', 'Required for Barangay Facilitators. Use a unique username; leave blank for DSWD Staff.', 'maria.santos'],
  ['Contact number', 'Optional. Use an 11-digit Philippine mobile number. Keep the leading zero.', '09000000301'],
  ['Barangay', 'Required for Barangay Facilitators. Match an active barangay by code or name. Include the city if names repeat.', 'Apas, Cebu City'],
]

export const beneficiaryTemplateGuide = [
  ['First name', 'Required. Enter the given name as recorded.', 'Jonel'],
  ['Middle name', 'Optional. Leave blank if there is no middle name.', 'Cabahug'],
  ['Last name', 'Required. Enter the family name as recorded.', 'Ramas'],
  ['Birth date', 'Required. Enter a calendar date in YYYY-MM-DD format.', '1989-04-12'],
  ['Sex', 'Required. Choose MALE, FEMALE, OTHER or UNKNOWN.', 'MALE'],
  ['Address', 'Required. Include the house or lot, street or sitio, barangay and city.', 'House 27, Sitio Grotto, Apas, Cebu City'],
  ['City / Municipality', 'Optional cross-check against the parent barangay. Include it when barangay names repeat across cities.', 'Cebu City'],
  ['Barangay', 'Required. Match an active barangay by code or name, or select a barangay for the file. Facilitators use their assigned barangay.', 'Apas, Cebu City'],
  ['Sitio / Purok', 'Optional. Use a confirmed area in the selected barangay. Staff review any unlisted area.', 'Sitio Grotto'],
  ['Mobile number', 'Optional. Keep the 11-digit number as Text to preserve its leading zero.', '09000000302'],
  ['Email', 'Optional. Enter the beneficiary’s contact email if available.', 'jonel.ramas@example.invalid'],
  ['PhilSys number', 'Optional. Enter only a verified number; keep it as Text. Do not invent a value.', ''],
  ['Assistance program', 'Use the code or name of an active program accepting applications, or select one program for the file during import.', 'TUPAD'],
]

export const barangayTemplateGuide = [
  ['Barangay name', 'Required. Enter the official barangay name.', 'Apas'],
  ['Barangay code', 'Optional. Use the official code when available. Keep the cell as Text to preserve leading zeroes.', '0730600003'],
  ['City / Municipality', 'Required. Use the official city or municipality name.', 'Cebu City'],
  ['Province', 'Required. Use the official province name.', 'Cebu'],
  ['Sitios / Puroks', 'Optional. Separate confirmed names with | and keep the Sitio or Purok label.', 'Sitio Grotto'],
]

export const programTemplateGuide = [
  ['Program name', 'Required. Use the full assistance program name (up to 150 characters).', 'Tulong Panghanapbuhay sa Ating Disadvantaged Workers'],
  ['Program code', 'Required. Use a unique code of 3–30 letters, numbers or hyphens. Reuse it on beneficiary applications.', 'TUPAD'],
  ['Program type', 'Required. Use 2–20 letters, numbers or underscores.', 'EMERGENCY_EMPLOYMENT'],
  ['Description', 'Optional. Describe the assistance and intended recipients.', 'Short-term paid community work for disadvantaged workers.'],
  ['Grant amount', 'Optional. Enter pesos per beneficiary, up to two decimal places. Leave blank if unconfirmed.', '5820.00'],
  ['Budget amount', 'Optional. Enter the total approved budget in pesos. The example covers 25 participants.', '145500.00'],
  ['Application start date', 'Optional. Use YYYY-MM-DD.', '2026-11-02'],
  ['Application end date', 'Optional. Use YYYY-MM-DD, on or after the start date.', '2027-01-29'],
  ['Required documents', 'Optional. Separate multiple types with semicolons. Supported values include VALID_ID, BIRTH_CERTIFICATE, BARANGAY_CERTIFICATE, PROOF_OF_RESIDENCY, MEDICAL_CERTIFICATE, PWD_ID, SENIOR_CITIZEN_ID and OTHER.', 'VALID_ID'],
]

export const importTemplateGuides = { staff: staffTemplateGuide, beneficiaries: beneficiaryTemplateGuide, programs: programTemplateGuide, barangays: barangayTemplateGuide }
export const importTemplateNotes = {
  staff: 'Register the barangay before importing its facilitators. Each facilitator needs a unique username and an active barangay assignment.',
  beneficiaries: 'Register the barangay first. Match each person to an active barangay using its code or its name and city.',
  programs: 'Use approved local figures on Data. Amounts, dates and documents shown here illustrate one batch. Programs import as Draft and need an eligibility criterion before activation.',
  barangays: 'Import new barangays first. Staff and beneficiaries can then use the same barangay code or name. Existing locations are checked for duplicates.',
}

export const IMPORT_TEMPLATE_INSTRUCTIONS = 'INSTRUCTIONS AND EXAMPLES - not imported'
export const IMPORT_TEMPLATE_DATA = 'DATA ENTRY - add records below the column headings'
export const IMPORT_TEMPLATE_GUIDE_LIMIT = 40
export const IMPORT_TEMPLATE_ENTRY_HINT = 'Start on row 6. * Required. Keep rows 1-5; row 5 shows formats and examples.'

export const importTemplateGroups = {
  staff: [['Staff details', 0, 1], ['Account access', 2, 3], ['Contact and assignment', 4, 5]],
  beneficiaries: [['Personal details', 0, 4], ['Residence', 5, 8], ['Contact and identity', 9, 11], ['Program application', 12, 12]],
  programs: [['Program details', 0, 3], ['Funding (PHP)', 4, 5], ['Application period', 6, 7], ['Requirements', 8, 8]],
  barangays: [['Barangay details', 0, 1], ['Location', 2, 3], ['Service areas', 4, 4]],
}

export const importTemplateHints = {
  staff: { fullName: 'e.g. Maria Santos', email: 'Unique staff email', role: 'DSWD Staff / Barangay Facilitator', username: 'Required for facilitators', contactNumber: 'Text: 09171234567', barangayId: 'Facilitators: existing barangay' },
  beneficiaries: { firstName: 'e.g. Maria', middleName: 'Optional; e.g. Reyes', lastName: 'e.g. Santos', birthDate: 'YYYY-MM-DD', sex: 'MALE / FEMALE / OTHER / UNKNOWN', address: 'House no., street', city: 'Parent city; e.g. Cebu City', sitioPurok: 'Optional; e.g. Purok 2', barangayId: 'Existing barangay or match at import', contactNumber: 'Text: 09171234567', email: 'Optional email address', philsysNumber: 'Verified number as Text; optional', programId: 'Existing active program code/name' },
  programs: { programName: 'Full assistance program name', programCode: 'Unique; e.g. FOOD-2026', programType: 'e.g. FOOD or CASH', description: 'Purpose and intended recipients', grantAmount: 'Per beneficiary; e.g. 1500.00', budgetAmount: 'Total budget; e.g. 150000.00', applicationStartDate: 'YYYY-MM-DD; optional', applicationEndDate: 'YYYY-MM-DD; not before start', requiredDocumentTypes: 'e.g. VALID_ID; BARANGAY_CERTIFICATE' },
  barangays: { barangayName: 'Official name; e.g. San Nicolas', barangayCode: 'Official code as Text; optional', city: 'e.g. Cebu City', province: 'e.g. Cebu', serviceAreas: 'Confirmed names separated by |; optional' },
}

export function templateHeading([field, heading, required]) {
  return `${heading}${field.endsWith('Amount') ? ' (PHP)' : ''}${required ? ' *' : ''}`
}

export function templateFileName(label, includeProgram = false) {
  const name = { staff: 'staff', beneficiaries: includeProgram ? 'beneficiary-applications' : 'beneficiary', programs: 'program', barangays: 'barangay' }[label]
  return `garantiyaid-${name}-template.xlsx`
}
