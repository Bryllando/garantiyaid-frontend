export function programDocumentLabel(type, program) {
  const label = type.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
  const names = otherDocumentNames(program)
  return type === 'OTHER' && names.length ? `Other — ${names.join(', ')}` : label
}

export function otherDocumentNames(program) {
  return program?.otherRequiredDocumentNames?.length ? program.otherRequiredDocumentNames
    : program?.otherRequiredDocumentName?.trim() ? [program.otherRequiredDocumentName.trim()] : []
}

export function programDocumentRequirements(program) {
  return (program?.requiredDocumentTypes ?? []).flatMap(documentType => {
    const names = documentType === 'OTHER' ? otherDocumentNames(program) : []
    return names.length ? names.map(documentName => ({ documentType, documentName, label: `Other — ${documentName}` }))
      : [{ documentType, documentName: null, label: programDocumentLabel(documentType) }]
  })
}

export function documentMeetsRequirement(document, requirement) {
  const normalize = value => value?.trim().toLowerCase().replace(/\s+/g, ' ')
  return document.documentType === requirement.documentType
    && (!requirement.documentName || normalize(document.documentName) === normalize(requirement.documentName))
}

export function missingProgramDocuments(program, documents, statuses) {
  return programDocumentRequirements(program).filter(requirement => !documents.some(document =>
    (!statuses || statuses.includes(document.reviewStatus)) && documentMeetsRequirement(document, requirement)))
}
