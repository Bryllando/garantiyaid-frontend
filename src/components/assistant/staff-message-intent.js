const distributionTopic = /\b(distributions?|events?|schedules?|queue)\b/
const reminderTopic = /\b(reminders?|sms|messages?|notifications?|text|mensahe|pahibalo)\b/
const deliveryTopic = /\b(status|delivery|failed|sent|queued|delivered|undelivered|napadala|naipadala)\b/
const informationRequest = /\b(how|what|why|when|where|explain|show|view|check|review|steps|guide|unsa|ngano|kanus.a|asa|ipakita|ipasabot|paano|ano|bakit|kailan|saan|ipaliwanag)\b/
const pauseRequest = /\b(no|not|never|don'?t|do not|cannot|can'?t|won'?t|without|stop|cancel|hold off|wait|never ?mind|ayaw|dili|huwag|wag|hindi|kanselahin|kanselaha)\b/

export function messageIntent(message, userRole) {
  const text = message.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim()
  const distribution = distributionTopic.test(text)
  const reminder = reminderTopic.test(text)
  const information = informationRequest.test(text)
  const paused = pauseRequest.test(text)

  // ponytail: conservative phrase routing, not general language understanding.
  // Unrecognized requests stay in guidance; extend from verified examples as needed.
  if (paused && !information) {
    if (deliveryTopic.test(text) && !/\b(stop|cancel|wait|never ?mind|ayaw|huwag|kanselahin|kanselaha)\b/.test(text)) return 'delivery'
    return 'cancel'
  }

  const command = text
    .replace(/^(?:(?:hello|hi|hey|kumusta|maayong (?:adlaw|buntag|hapon|gabii)|good (?:morning|afternoon|evening))\b[\s!,.:-]*)+/, '')
    .replace(/^(?:(?:please|kindly|palihog|paki|can you|could you|would you|help me|i want to|i need to|gusto nako|gusto ko)\b[\s,]*)+/, '')

  if (!paused && !information) {
    const draft = /^(create|draft|plan|prepare|make|himo|himoa|buhat|buhata|plano|gumawa)\b/.test(command)
    const notify = /^(send|queue|schedule|prepare|draft|create|make|remind|notify|text|textan|ipadala|magpadala|pahibalo)\b/.test(command)
    // An event and a separate reminder need distinct reviews, never an implicit chain.
    if ((draft || notify) && distribution && reminder && /\b(and|then|also|ug|at)\s+(?:(?:then|please)\s+)?(create|draft|plan|prepare|make|send|queue|schedule|remind|notify|himo|buhat|ipadala)\b/.test(command)) return 'clarify'
    if (notify && (reminder || /^(remind|notify|textan)\b/.test(command))) return 'reminder'
    if (draft && distribution) return userRole === 'SYSTEM_ADMIN' ? 'distributionDraft' : 'schedule'
    if (/^schedule\b/.test(command) || (draft && !distribution)) return 'clarify'
  }

  if (deliveryTopic.test(text)) return 'delivery'
  if (distribution) return 'schedule'
  if (/\b(beneficiar(?:y|ies)|benepisyaryo|contact|sitio|purok)\b/.test(text)) return 'beneficiary'
  if (reminder) return information || paused ? 'help' : 'clarify'
  if (/^(hello|hi|hey|kumusta|maayong (adlaw|buntag|hapon|gabii)|good (morning|afternoon|evening)|test|testing)[\s!,.?]*$/.test(text)) return 'greeting'
  return 'help'
}

export const routingReplies = {
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
