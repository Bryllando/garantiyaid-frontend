// Fixed general-process templates only. No model-provided nodes, status data or executable definitions.
export const PROCESS_PREFIXES = ['General process: ', 'Pangkalahatang proseso: ', 'Kinatibuk-ang proseso: ']
export const PROCESS_TEMPLATES = {
  APPROVAL_SCHEDULING: {
    titles: ['Approval and scheduling', 'Pag-apruba at iskedyul', 'Approval ug schedule'],
    steps: [
      ['Application approved', 'Application approved', 'Application approved'],
      ['Event allocation', 'Allocation sa event', 'Allocation sa event'],
      { label: ['Appointment recorded?', 'May nakatalang appointment?', 'Naay natala nga appointment?'], branches: [
        { label: ['Yes', 'Oo', 'Oo'], steps: [['Follow the assigned schedule', 'Sundin ang nakatalagang iskedyul', 'Sunda ang gi-assign nga schedule']] },
        { label: ['No', 'Wala', 'Wala'], steps: [['Ask authorized staff to review scheduling', 'Ipa-review ang scheduling sa awtorisadong staff', 'Ipa-review ang scheduling sa awtorisadong staff']] },
      ] },
    ],
  },
  IDENTITY_RELEASE: {
    titles: ['Identity checks and release', 'Identity checks at release', 'Identity checks ug release'],
    steps: [
      ['QR check accepted', 'Tinanggap ang QR check', 'Gidawat ang QR check'],
      { label: ['All required identity checks satisfied?', 'Kumpleto ang required identity checks?', 'Kompleto ang required identity checks?'], branches: [
        { label: ['No', 'Hindi', 'Dili'], steps: [['Complete remaining checks through authorized staff', 'Kumpletuhin ang kulang na checks sa awtorisadong staff', 'Kompletoha ang kulang nga checks sa awtorisadong staff']] },
        { label: ['Yes', 'Oo', 'Oo'], steps: [
          ['Record the permitted release or settlement', 'Itala ang pinapayagang release o settlement', 'Itala ang gitugot nga release o settlement'],
          ['Issue receipt after eligible completion', 'Mag-issue ng receipt pagkatapos ng eligible completion', 'Issue og receipt human sa eligible completion'],
        ] },
      ] },
    ],
  },
  APPLICATION_CORRECTION: {
    titles: ['Application corrections', 'Pagwawasto ng application', 'Pagtul-id sa application'],
    steps: [
      ['Review the recorded correction request', 'Suriin ang nakatalang correction request', 'Ribyuha ang natala nga correction request'],
      ['Prepare the requested corrections', 'Ihanda ang hinihinging pagwawasto', 'Andama ang gipangayong pagtul-id'],
      ['Submit through authorized staff', 'Isumite sa awtorisadong staff', 'Isumite pinaagi sa awtorisadong staff'],
      ['Await the recorded review decision', 'Hintayin ang nakatalang desisyon sa review', 'Hulata ang natala nga desisyon sa review'],
    ],
  },
  SMS_DELIVERY: {
    titles: ['SMS processing', 'Pagproseso ng SMS', 'Pagproseso sa SMS'],
    steps: [
      ['Review recipients and explicitly confirm', 'Suriin ang recipients at tahasang kumpirmahin', 'Ribyuha ang recipients ug klarong kumpirmaha'],
      ['Notification queue', 'Notification queue', 'Notification queue'],
      { label: ['Delivery mode', 'Delivery mode', 'Delivery mode'], branches: [
        { label: ['Simulation', 'Simulation', 'Simulation'], steps: [['No real SMS is sent', 'Walang totoong SMS na ipinapadala', 'Walay tinuod nga SMS nga ipadala']] },
        { label: ['Real SMS', 'Totoong SMS', 'Tinuod nga SMS'], steps: [
          { label: ['Gateway result', 'Resulta ng gateway', 'Resulta sa gateway'], branches: [
            { label: ['Accepted', 'Accepted', 'Accepted'], steps: [['Arrival on the receiving phone remains unconfirmed', 'Hindi pa kumpirmado ang pagdating sa receiving phone', 'Dili pa kumpirmado ang pag-abot sa receiving phone']] },
            { label: ['Failed', 'Failed', 'Failed'], steps: [['Review the error before an authorized retry', 'Suriin ang error bago ang awtorisadong retry', 'Ribyuha ang error una ang awtorisadong retry']] },
          ] },
        ] },
      ] },
    ],
  },
  APPLICATION_STEPS: {
    titles: ['Application steps', 'Mga hakbang sa application', 'Mga lakang sa application'],
    steps: [
      ['Confirm official program requirements', 'Kumpirmahin ang official program requirements', 'Kumpirmaha ang official program requirements'],
      ['Prepare the officially requested documents', 'Ihanda ang opisyal na hinihinging dokumento', 'Andama ang opisyal nga gipangayong dokumento'],
      ['Submit through the authorized channel', 'Isumite sa awtorisadong channel', 'Isumite sa awtorisadong channel'],
      ['Authorized application review', 'Awtorisadong application review', 'Awtorisadong application review'],
    ],
  },
  FACE_PROFILE: {
    titles: ['Face enrollment and verification', 'Face enrollment at verification', 'Face enrollment ug verification'],
    steps: [
      ['Active informed consent', 'Active informed consent', 'Active informed consent'],
      ['Enrolled and cleared face profile', 'Enrolled at cleared face profile', 'Enrolled ug cleared face profile'],
      ['Live photo for the claim identity check', 'Live photo para sa claim identity check', 'Live photo para sa claim identity check'],
      { label: ['Face match confirmed?', 'Kumpirmado ang face match?', 'Kumpirmado ang face match?'], branches: [
        { label: ['No or unavailable', 'Hindi o unavailable', 'Dili o unavailable'], steps: [['Authorized review; do not bypass event rules', 'Awtorisadong review; huwag laktawan ang event rules', 'Awtorisadong review; ayaw laktawi ang event rules']] },
        { label: ['Yes', 'Oo', 'Oo'], steps: [['Face check completed; release is separate', 'Kumpleto ang face check; hiwalay ang release', 'Kompleto ang face check; lahi ang release']] },
      ] },
    ],
  },
}

export function processDiagramForAnswer(content) {
  if (typeof content !== 'string') return null
  for (const [templateId, template] of Object.entries(PROCESS_TEMPLATES)) {
    for (let languageIndex = 0; languageIndex < 3; languageIndex++) {
      const heading = `${PROCESS_PREFIXES[languageIndex]}${template.titles[languageIndex]}\n\n`
      if (content.startsWith(heading)) return { templateId, languageIndex, body: content.slice(heading.length) }
    }
  }
  return null
}
