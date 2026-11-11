import { isTaskCancellation, isTaskQuestion } from './task-details.js'

const distributionTopic = /\b(distributions?|events?|schedules?|queue|iskedyul|sesyon|allocation|allocat(?:e|ion)s?)\b/
const reminderTopic = /\b(reminders?|sms|messages?|notifications?|text|mensahe|pahibalo)\b/
const deliveryTopic = /\b(status|delivery|failed|fail|failure|sent|queued|delivered|undelivered|napadala|naipadala|accepted|kadawat|nadawat)\b/
const informationRequest = /\b(how|what|why|when|where|explain|show|view|check|review|steps|guide|unsa|unsaon|ngano|nganong|kanus.a|asa|ipakita|ipasabot|paano|ano|bakit|kailan|saan|ipaliwanag)\b/
const pauseRequest = /\b(no|not|never|don'?t|do not|cannot|can'?t|won'?t|without|stop|cancel|hold off|wait|never ?mind|ayaw|dili|huwag|wag|hindi|kanselahin|kanselaha)\b/

export function messageIntent(message, userRole) {
  const text = message.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").replace(/\bi[- ](?=notify|text|send)/g, '').replace(/\b(remider|remminder|remindr)s?\b/g, 'reminder').replace(/\baplication\b/g, 'application').replace(/\bschduled\b/g, 'scheduled').replace(/\s+/g, ' ').trim()
  const distribution = distributionTopic.test(text)
  const reminder = reminderTopic.test(text)
  const information = informationRequest.test(text)
  const paused = pauseRequest.test(text)

  // shortcut: explicit phrase routing; unknown phrasing stays in guidance until verified examples justify expansion.
  if (/\b(cancelled|canceled|reactivate|cancel.{0,15}(appointment|allocation)|kanselad[oa])\b/.test(text)) return 'schedule'
  if (/\bno unscheduled\b/.test(text)) return 'schedule'
  if (/\b(bypass|ignore.{0,25}(permissions?|verification)|delete all|release.{0,20}without|approve all)\b/.test(text)) return 'unsupported'
  if (!isTaskCancellation(text)) {
    if (/\b(approved|approval|aprubado|gi.approve)\b/.test(text) && /\b(schedule|scheduled|scheduling|appointment|iskedyul)\b/.test(text)) return 'enrollment'
    if (/\b(qr|identity|verified)\b/.test(text) && /\b(release|released|releasing|handover|receipt|resibo)\b/.test(text)) return 'release'
  }
  if (paused && !information) {
    if (deliveryTopic.test(text) && !/\b(stop|cancel|wait|never ?mind|ayaw|huwag|kanselahin|kanselaha)\b/.test(text)) return 'delivery'
    return 'cancel'
  }

  const command = text
    .replace(/^(?:(?:hello|hi|hey|kumusta|maayong (?:adlaw|buntag|hapon|gabii)|good (?:morning|afternoon|evening))\b[\s!,.:-]*)+/, '')
    .replace(/^(?:(?:please|kindly|palihog|paki|can you|could you|would you|help me|i want to|i need to|gusto nako|gusto ko)\b[\s,]*)+/, '')

  if (!paused && !information) {
    const draft = /^(create|draft|plan|prepare|make|himo|himoa|buhat|buhata|plano|gumawa)\b/.test(command)
    const notify = /^(send|queue|schedule|prepare|draft|create|make|remind|notify|text|textan|ipadala|magpadala|pahibalo|pahinumdomi|pahinumdumi|pahibaloa|paalalahanan|abisuhan)\b/.test(command)
    // An event and a separate reminder need distinct reviews, never an implicit chain.
    if ((draft || notify) && distribution && reminder && /\b(and|then|also|ug|at)\s+(?:(?:then|please)\s+)?(create|draft|plan|prepare|make|send|queue|schedule|remind|notify|himo|buhat|ipadala)\b/.test(command)) return 'clarify'
    if (notify && (reminder || /^(remind|notify|textan|pahinumdomi|pahinumdumi|pahibaloa|paalalahanan|abisuhan)\b/.test(command))) return /\b(push|mobile|app notification)\b/.test(command) ? 'mobile' : 'reminder'
    if (draft && distribution) return userRole === 'SYSTEM_ADMIN' ? 'distributionDraft' : 'schedule'
    if (/^schedule\b/.test(command) || (draft && !distribution)) return 'clarify'
  }

  if (deliveryTopic.test(text) && (reminder || /\b(delivery|napadala|naipadala)\b/.test(text))) return 'delivery'
  if (/\b(mobile|link(?:ing)?|smartphone|push|app account)\b/.test(text)) return 'mobile'
  if (/\b(complaint|concern|dispute|(?:nag)?reklamo|reklamasyon|privacy|pribasiya)\b/.test(text)) return 'concern'
  if (/\b(receipts?|releas(?:e|ed)|handover|resibo|gihatag|representative|representante)\b/.test(text)) return 'release'
  if (/\b(qr|biometric|face|identity|consent|scanner|camera|signature)\b/.test(text)) return 'identity'
  if (distribution && !/\b(application|enrollment|enrolment)\b/.test(text)) return 'schedule'
  if (/\b(document|documents|requirements|dokumento|papeles|application steps|apply|mag.apply|eligibility|eligible|kwalipikado)\b/.test(text)) return 'document_requirements'
  if (/\b(enrollment|enrolment|application|approved|rejected|correction|kulang|gi.approve|gi.reject|pagwawasto)\b/.test(text)) return 'enrollment'
  if (distribution) return 'schedule'
  if (/\b(beneficiar(?:y|ies)|benepisyaryo|contact|sitio|purok)\b/.test(text)) return 'beneficiary'
  if (reminder) return information || paused ? 'help' : 'clarify'
  if (/^(hello|hi|hey|kumusta|maayong (adlaw|buntag|hapon|gabii)|good (morning|afternoon|evening)|test|testing)[\s!,.?]*$/.test(text)) return 'greeting'
  return 'help'
}

export function conversationIntent(message, role, task) {
  const intent = messageIntent(message, role)
  if (!task) return intent
  if (isTaskCancellation(message)) return 'cancel'
  if (isTaskQuestion(message) || /^(?:open|reactivate|mark|issue|cancel.{0,15}appointment)\b/i.test(message) || ['unsupported', 'mobile', 'concern', 'reminder', 'distributionDraft', 'cancel'].includes(intent)) return intent
  return task.kind
}

export function guidanceTarget(intent, role) {
  const schedule = role === 'SYSTEM_ADMIN' ? ['/distributions/manage', 'Distribution events'] : role === 'DSWD_STAFF' ? ['/dswd/live-dashboard', 'Live monitoring'] : ['/facilitator/queue', 'Queue & schedules']
  const target = { SCHEDULE: schedule, DELIVERY: ['/notifications', 'SMS delivery'], BENEFICIARY: ['/beneficiaries', 'Beneficiaries'], DOCUMENT_REQUIREMENTS: ['/programs', 'Assistance programs'], ENROLLMENT: ['/enrollments', role === 'BARANGAY_FACILITATOR' ? 'Enrollments' : 'Enrollment review'], IDENTITY: ['/biometrics', 'Biometric identity'], RELEASE: ['/claim-accountability', role === 'BARANGAY_FACILITATOR' ? 'Releases & receipts' : 'Claims and receipts'], MOBILE: ['/beneficiaries', 'Beneficiaries'], CONCERN: ['/help-cases', 'Help cases'] }[intent]
  return target && ['SYSTEM_ADMIN', 'DSWD_STAFF', 'BARANGAY_FACILITATOR'].includes(role) ? { path: target[0], label: target[1] } : null
}

export const routingReplies = {
  unsupported: {
    en: 'I cannot bypass permissions, identity checks, independent review or event rules. No records were changed. Use the authorized workflow for the specific record.',
    fil: 'Hindi ko maaaring lampasan ang pahintulot, identity checks, independent review o event rules. Walang record na binago. Gamitin ang awtorisadong workflow para sa tamang record.',
    ceb: 'Dili nako malaktawan ang permissions, identity checks, independent review o event rules. Walay record nga giusab. Gamita ang awtorisadong workflow sa tukmang record.',
  },
  clarify: {
    en: 'Would you like guidance, a distribution draft, or a reminder? Please request one task at a time. You will review the details before confirming any action.',
    fil: 'Gusto mo ba ng gabay, distribution draft, o reminder? Isang gawain muna ang piliin. Susuriin mo ang mga detalye bago kumpirmahin ang anumang aksyon.',
    ceb: 'Gusto nimo og giya, distribution draft, o reminder? Usa lang ka buluhaton matag higayon. Imong ribyuhon ang mga detalye sa dili pa mokumpirma sa aksyon.',
  },
  cancel: {
    en: 'I have not started a new task from this message. This does not cancel an existing event or queued reminder. You can ask for guidance or describe a new task when ready.',
    fil: 'Wala akong sinimulang bagong gawain mula sa mensaheng ito. Hindi nito kinakansela ang kasalukuyang event o naka-queue na reminder. Maaari kang humingi ng gabay kapag handa ka na.',
    ceb: 'Wala koy gisugdan nga bag-ong buluhaton gikan niini nga mensahe. Dili niini makansela ang kasamtangang event o naka-queue nga reminder. Pwede ka mangayo og giya kung andam na ka.',
  },
}
