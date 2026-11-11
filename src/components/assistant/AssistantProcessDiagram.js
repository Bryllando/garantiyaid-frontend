import { createElement as h } from 'react'
import { PROCESS_PREFIXES, PROCESS_TEMPLATES } from './process-templates.js'

function stepsList(steps, languageIndex) {
  return h('ol', { className: 'ga-process-steps' }, steps.map((step, index) => h('li', { key: index },
    h('div', { className: 'ga-process-node' }, (Array.isArray(step) ? step : step.label)[languageIndex]),
    !Array.isArray(step) && h('ul', { className: 'ga-process-branches' }, step.branches.map((branch, branchIndex) => h('li', { key: branchIndex },
      h('p', { className: 'ga-process-condition' }, branch.label[languageIndex]),
      stepsList(branch.steps, languageIndex),
    ))),
  )))
}

export default function AssistantProcessDiagram({ templateId, languageIndex = 0 }) {
  if (!Object.hasOwn(PROCESS_TEMPLATES, templateId) || ![0, 1, 2].includes(languageIndex)) return null
  const template = PROCESS_TEMPLATES[templateId]
  return h('figure', { className: 'ga-process-diagram', 'aria-label': `${PROCESS_PREFIXES[languageIndex]}${template.titles[languageIndex]}` },
    h('figcaption', null, `${PROCESS_PREFIXES[languageIndex]}${template.titles[languageIndex]}`),
    stepsList(template.steps, languageIndex),
    h('p', { className: 'ga-process-note' }, [
      'General guidance only. These boxes do not show your record or completed stages.',
      'Pangkalahatang gabay lamang. Hindi ipinapakita ng mga kahon ang iyong record o natapos na stages.',
      'Kinatibuk-ang giya lamang. Dili ipakita sa mga kahon ang imong record o nahuman nga stages.',
    ][languageIndex]),
  )
}
