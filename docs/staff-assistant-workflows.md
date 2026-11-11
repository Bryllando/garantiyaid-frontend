# Staff assistant conversation refinements

The assistant uses intent routing, bounded task context, controlled guidance and the existing authenticated APIs. No model fine-tuning, new dependency, database migration or notification provider change is required.

## Knowledge and review

[The 78 conversation examples](staff-assistant-conversation-examples.json) are draft review and regression material: 30 were added to the original 48, including six public-beneficiary examples. Each records the audience, role, language, message, previous conversation, expected intent, extracted details, ambiguities, expected behavior, visualization usefulness/template and confirmation requirement. Tests use a fixed Philippine date of November 10, 2026; names and event IDs are fixtures. Identical wording with different confirmed context remains a separate case; duplicate audience/question/context cases are rejected.

[The beneficiary FAQ draft](beneficiary-chatbot-faq-draft.md) supplied scenarios about missing documents, cancelled appointments, lost QR credentials, incomplete face enrollment, receipts, missing SMS and mobile linking. It remains a draft. It is **not** automatically added to the live chatbot as approved policy. Responsible staff must approve program-specific requirements, eligibility, amounts, deadlines, representative rules and contact details separately.

Live workflow guidance is maintained in the backend's `src/modules/chatbot/staff-workflow-guidance.js` and existing `chatbot.ai.js`. It explains implemented software behavior without supplying government policy. Sensitive enrollment, document, identity, release, concern and mobile answers use controlled text directly. Existing general conversational guidance retains its model/fallback path. Backend text redaction, role restrictions and Markdown rendering remain in place.

## Try a reminder without sending

1. Sign in with the appropriate staff role and open Staff Assistant.
2. Enter **“Pahinumdomi ang scheduled beneficiaries sa TUPAD sa Punta.”** You can also use **“Send reminders for the Punta TUPAD distribution.”** Exact program names/codes and barangay names must exist in the authorized event records.
3. If several draft/open events match, choose one of the displayed records (or its displayed number). If none match, correct the details; the assistant does not create or reschedule an event. The event's recorded date and start time appear in the editable summary.
4. Continue with **“SMS lang.”** or **“Kanang event nga atong gihisgutan.”** The selected event stays the same. **“Karon, 10 AM.”** constrains the event's actual date/start time in `Asia/Manila`; it does not silently schedule the SMS for 10 AM. To set SMS timing, use the Queue timing field or an explicit instruction such as **“Schedule an SMS tomorrow at 9 AM.”**
5. Explicitly choose the recipient Sitio/Purok or **“All scheduled service areas”**, supply the message and choose queue timing. “All” means eligible scheduled people in this event within authorized scope, not every beneficiary in the program database.
6. Select **Match records and preview**, review the matched record and choose **Preview recipients and message**. The existing backend calculates contacts, exclusions, actual personalized message, count and queue time. A saved person or approved application without an eligible appointment is not automatically a recipient.
7. Stop here to test without sending. In chat, **“Ayaw sa ipadala.”** cancels an unconfirmed task and clears its local preview. The task's Cancel button does the same. Cancelling a draft does not recall already queued messages; review those separately in SMS delivery.
8. For an actual authorized send, review the server preview, check the acknowledgment and click **Confirm and queue**. The existing server approval, recipient hash, actor binding, expiry and idempotency checks still apply. The assistant reports the returned queued count; it does not report recipient arrival.

## Context and permissions

- After completing or cancelling a task, the task shortcuts appear again in the same conversation. Choose **Prepare a distribution draft** (System Administrator only) or **Prepare a reminder** to begin with empty details and a fresh review. Earlier messages stay in the chat; **New chat** is optional when you want a separate conversation. Shortcuts are hidden during an active task or pending confirmation.
- Confirmed details stay in the active task. A different unlabelled barangay/program does not replace them. Use **Edit** or a labelled correction, for example `change barangay: Punta`. A changed event constraint invalidates the prior selection and must match authorized records again. Retained recipient scope is rechecked against that event; an unmatched area never becomes “all”.
- A new task starts with empty details after cancelling or completing the previous task. Switching conversations clears pending state. Sign-out, staff/account/role/barangay changes and refresh clear local task context; saved chat text cannot restore an approval or silently select an event.
- System Administrators retain distribution setup authority. DSWD Staff and Barangay Facilitators get the existing role-specific screens. Backend authorization and barangay filters apply to event/schedule lookups and reminder actions independently of conversation text.
- Asking to approve an application, reactivate an appointment, generate credentials, link an account or release assistance gives guidance and a verified screen shortcut. These chat messages do not perform those actions. Personal status/progress is not retrieved by the general guidance chat.
- A cancelled appointment needs authorized reactivation; generating schedules does not create a replacement. Approval, scheduling, identity verification and actual release remain separate.
- Mobile push delivery is unavailable. A saved push draft is not a delivered notification. SMS is never silently substituted for a push request. A mobile profile picture is not an enrolled biometric profile.
- Gateway accepted is different from recipient-confirmed SMS arrival. Inspect errors and contacts before an authorized retry. Never paste passwords, OTPs, full identification numbers, raw QR credentials or private documents into ordinary chat.

## Presentation and limitations

Answers use the existing Markdown renderer, lists, tables and short process arrows. Screen shortcuts come from a fixed role-aware map. AI-generated HTML, SVG, JavaScript and arbitrary links are not executed. No personal progress diagram is displayed without an implemented authenticated lookup.

Staff and public replies can now include six static black-and-white process diagrams: approval versus scheduling, identity checks versus release, application corrections, SMS processing, application steps, and face enrollment versus verification. They use rectangular boxes, labeled branches and arrows; no loading skeletons, completion ticks, invented counts or confidence percentages are shown. Every diagram states that it is general guidance rather than a person's record.

The backend chooses a controlled process explanation from `chatbot.process-explanations.js` when the question needs one. The frontend recognizes only an exact developer-maintained general-process heading and renders the corresponding fixed template from `process-templates.js`. It never interprets diagram definitions, model-supplied nodes or executable markup. The heading and explanation are ordinary saved reply text, so the existing history API and cache restore diagrams without new metadata or a migration. The workspace UI verification checks every backend heading against its frontend template.

Simple greetings, incomplete requests, personal status lookups, text-only requests and unsupported actions do not gain a diagram. A staff follow-up such as **Show that flow** uses the most recent user question in the existing bounded context; it cannot derive a topic from an assistant-invented status. Public process questions use existing general-guidance intents; private schedule/claim/enrollment questions still follow the existing authentication/referral boundary. A diagram never grants access or queues a notification.

Try these in Staff Assistant:

- `What is the difference between an approved application and an appointment?`
- `Verified na akong QR, nganong dili pa ma-release?`
- `Bakit gateway accepted pero walang SMS na dumating?`
- `Explain how to correct missing documents in my application.`

Try `Can you explain the application steps?` in public general guidance. Document requirements still need the responsible office's official checklist; the application diagram is not a document checklist. Mobile push and personal-progress lookup inside ordinary chat remain unavailable.

Recognition is deliberately conservative: tested English, Cebuano and Filipino phrases, a few common reminder misspellings, labelled details and short follow-ups. It is not unrestricted language understanding. Unknown requests stay in guidance or require the exact field editor; unsupported requests never trigger a best-guess action. Old or restored chat text cannot recover a pending event selection. Event matching uses exact known metadata, not fuzzy person matching.

## Validation (mocked notifications only)

From `garantiyaid-frontend`:

```powershell
node --test test/assistant-conversations.test.js test/task-details.test.js test/task-preview.test.js test/staff-message-intent.test.js
node scripts/verify-assistant-conversations.mjs
node scripts/verify-assistant-reminder-preview.mjs
node --test test/assistant-process-diagram.test.js
node scripts/verify-chatbot-process-ui.mjs
```

From `garantiyaid-backend`:

```powershell
node --test test/staff-workflow-guidance.test.js test/chatbot.test.js test/chatbot.ai.test.js test/chatbot.stream.test.js test/assistantApproval.test.js test/notification.test.js test/simgateSms.test.js
node --test test/chatbot.process-explanations.test.js
```

The browser harness intercepts every API and socket request. It exercises event ambiguity, retained follow-ups, cancellation with zero enqueue calls, unavailable mobile push, rejected permission changes, fresh acknowledgment after failure and successful mocked queueing. Backend tests cover authenticated route rejection, barangay scope, changed recipients, expired/mismatched approvals, deduplication and provider failure distinctions. These checks do not send real SMS, verify a receiving phone or test the unconnected mobile app.
