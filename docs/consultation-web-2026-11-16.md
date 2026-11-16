# GarantiyAid web consultation guide - 16 November 2026

Prepared from the current web/API implementation and [LIST-OF-MODULES.pdf](../../reference/LIST-OF-MODULES.pdf). Scope: System Administrator, DSWD Staff and Barangay Facilitator. Excluded: beneficiary mobile screens and actual mobile integration. Staff work on beneficiary records stays included.

**Sugdi sa usa ka complete physical-assistance + QR-only transaction.** Ang ending sa beneficiary transaction kay recorded handover plus original receipt. Ang event closure kay lahi nga administrative ending. QR/face/signature checks alone do not mean that assistance was handed over.

Sa sayon nga pagsabot: **DSWD mag-andam sa program -> Barangay mag-register ug submit sa application -> independent DSWD mo-review -> Admin mag-Sessions, Allocate, Schedule ug Open -> Admin mo-issue sa QR -> Barangay mo-verify -> Barangay mo-handover ug issue receipt -> Admin mo-reconcile ug close.** Sundon ang parehas nga person/program/event sa tibuok demo.

Sa matag numbered step, ang **Page/action** mao ang adtoan ug pisliton; **Needs/input** mao ang kinahanglan una; **Expected/saved check** mao ang resulta nga inyong i-check human i-refresh/reopen; ug **If blocked** mao ang sunod buhaton kung dili makapadayon. Ayaw himoa og PASS ang step hangtod inyong nasulayan ug nakita ang saved result.

- [15-20-minute presentation script and blank manual checklist](../../output/consultation-2026-11-16-run-sheet.md)
- [All 68 PDF feature rows, evidence, permission differences and open issues](../../output/consultation-2026-11-16-module-review.md)
- [Fresh isolated API/browser result](../../output/integrated-acceptance/results.json): 24 checks passed on 15 November; temporary database removed. This is automated software evidence, not your team's manual PASS.

## 1. Prepare before the consultation

Use a separate local/demo database and TEST ONLY records/documents. Do not reset the existing database, use real beneficiary applications, or turn on real notification sending for this rehearsal. The automated runner's temporary records are removed afterwards; its screenshot references will not be searchable in your usual running web app.

Keep one backend and one frontend instance. Reuse their existing terminals: backend `npm.cmd start`, frontend `npm.cmd run dev`. If an older backend is running, stop it in its own terminal before restarting; do not start a second API on port 4000. The guide itself does not restart your server, change `.env` or run live migrations.

Use three browser profiles, already signed in with ordinary test staff accounts. Verify normal password/TOTP setup before the presentation. The local-only Developer Admin shortcut uses SYSTEM_ADMIN permissions; it is not an all-role account and does not demonstrate normal TOTP security. It cannot perform the Barangay handover on behalf of a facilitator.

Make sure the Barangay account is assigned to the same active barangay used by the beneficiary, enrollment and event. Use a different DSWD reviewer from the enrollment submitter. Have a webcam, a printable QR card or a second screen, readable fictional PDF/JPG/PNG documents, and the demo pack ready.

All times below are **Asia/Manila**. Use a fresh rehearsal event and another fresh event/credential for the actual consultation. Choose an available service period whose appointment end will remain in the future throughout the presentation. Do not reuse expired November 12 credentials or change the computer clock to make them valid. Avoid a session that crosses midnight. Resolve any actual date/time/venue conflict rather than moving another event.

The 60-minute session below is an example when that period fits. For a late-night rehearsal, use a shorter valid slot/session with enough time to finish, or rehearse a fresh case during the next day's service period. Do not create an expired appointment just to keep the sample time.

### Suggested synthetic case

These are testing values, not eligibility policy, required government documents or promised benefits.

| Item | TEST ONLY input |
| --- | --- |
| Program name/code | TEST Consultation Food Pack / TEST-CONSULT-1116A |
| Program type | FOOD_ASSISTANCE |
| Description | TEST ONLY consultation rehearsal; no actual entitlement or payment |
| Grant per beneficiary / budget | PHP 100 / PHP 1,000 as synthetic reference values; physical handover is one demo pack |
| Application period | For this consultation example, 2026-11-14 through 2026-11-18 |
| Test criterion | TEST ONLY adult fixture: Age, At least 18, Required |
| Test document | One fictional Valid ID file clearly marked TEST ONLY; this is not an official checklist |
| Beneficiary | First name TEST Lina, last name Consultation, birth date 1992-03-15; fictional address in the assigned test barangay |
| Contact | Leave blank for the basic QR journey; use only controlled test contacts for a separate notification test |
| Event | TEST Consultation Distribution 1116A, same program and barangay |
| Event date/service period | Actual rehearsal/consultation date and an available current service period, recorded in Philippine time |
| Session | TEST Main session; an available 60-minute period with 60-minute slots and capacity 1 for this single-person case |
| Delivery/identity | Physical assistance; QR code only |
| Package | TEST ONLY demo pack; unit pack; quantity per beneficiary 1 |
| Release evidence | Official Release Log; TEST-LOG-01 / page 1 / row 1 |
| Closure note | TEST ONLY rehearsal reconciled; TEST-CLOSE-01; release log TEST-LOG-01 |

The application window deliberately covers both preparation and presentation dates. An existing UTC/PHT application-date bug remains open; this window does not fix it. See the review report. Do not claim that boundary behavior is correct.

Keep your own case-reference book:

| Program | Beneficiary | Enrollment | Distribution | Appointment/queue | Claim | Receipt | Release log |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | TEST-LOG-01 / page 1 / row 1 |

Record identifiers and screenshots, not passwords, TOTP codes, raw QR credentials or biometric images.

## 2. Main connected journey

For every step below, reopen the exact saved record to verify persistence. If loading fails, do not interpret an empty screen as zero records. If a result is uncertain, inspect/retry the original action; do not create another person, claim or handover.

### 01 - Admin: normal access

**Page/action:** staff login -> **Sign in securely**, then normal authenticator verification when required. **Needs/input:** active ordinary test Admin account with completed setup. **Expected/saved check:** Admin dashboard and valid authenticated reads; account remains SYSTEM_ADMIN. **If blocked:** complete required first-password/TOTP setup or authorized recovery before the demo. A login error is not fixed by creating another account.

### 02 - Admin: service area and staff

**Page/action:** **Administration -> Staff and barangays**, inspect Barangays and Staff accounts. **Needs/input:** the intended active test barangay and active DSWD/Barangay accounts. **Expected/saved check:** facilitator assignment matches the main case's barangay; other roles keep their own permissions. **If blocked:** resolve inactive/missing assignment through Admin; do not remove scope checks. If creating/importing staff, use the isolated demo's disabled email mode and do not expose temporary passwords in evidence.

### 03 - DSWD: draft program

**Page/action:** **Programs & enrollment -> Assistance programs -> Create program**; complete **Create assistance program -> Create draft program**. **Needs/input:** the sample program above and a unique code. **Expected/saved check:** program **DRAFT**, correct funding reference, dates and test document requirement after reopen. **If blocked:** check required fields, duplicate code, amount/date validation and reviewer role. Rename the new test program; do not overwrite an existing official program.

### 04 - DSWD: criterion and activation

**Page/action:** open program -> **Add criterion**, enter the test Age rule and choose the dialog's **Add criterion** -> **Activate program**, confirm **Activate program**. **Needs/input:** DRAFT program, at least one valid test criterion and reviewed document requirements. **Expected/saved check:** program **ACTIVE**; criterion/document list visible. **If blocked:** check missing criterion, expired application period or validation feedback. Use this fictional requirement only for the test.

### 05 - Barangay: find or register the person

**Page/action:** **Beneficiary services -> Beneficiaries**; search a distinctive name part such as `Consultation`, compare name/birth date/area, then reuse the intended record. If absent, **Register beneficiary -> Review beneficiary details -> Register beneficiary**. **Needs/input:** correct active barangay and the fictional personal details. **Expected/saved check:** one intended **ACTIVE** beneficiary; no enrollment approval implied. **If blocked:** inspect potential duplicate feedback and identifiers; do not change spelling to evade a duplicate. Full-name phrases can miss split name fields in this list, so inspect individual name-part results. Avoid two staff registering the same person concurrently: the known registration race remains unfixed.

### 06 - Barangay: attach the program's documents

**Page/action:** exact beneficiary -> **Supporting documents**, choose the active test program and its document requirement -> **Choose document -> Upload for review**. **Needs/input:** the fictional readable PDF/JPG/PNG, at most 5 MB. **Expected/saved check:** correct named requirement and **SUBMITTED** document; Preview/Download shows the chosen file. **If blocked:** check size/type, exact program/requirement and upload response. One upload does not satisfy two separate named OTHER requirements.

### 07 - Barangay: submit enrollment

**Page/action:** select the test program -> **Submit enrollment -> View submitted enrollment**. **Needs/input:** ACTIVE program/application window and all required types available as submitted/accepted files. **Expected/saved check:** one enrollment **PENDING**, linked to this person/program; record its reference and send the reviewer the record link through your agreed rehearsal handoff. **If blocked:** complete missing documents or inspect the existing enrollment. Registration/import is not approval.

### 08 - DSWD: independent review

**Page/action:** **Programs & enrollment -> Enrollment review** -> exact enrollment -> **Start validation**; Preview each file, then **Accept -> Accept document** when appropriate. **Needs/input:** a reviewer different from the submitter and the correct applicant/program. **Expected/saved check:** enrollment **FOR_VALIDATION**, required documents **ACCEPTED**, eligibility results available. **If blocked:** self-review, missing files, failed criteria or stale data must be resolved; clicking Preview alone does not accept a document.

### 09 - DSWD: enrollment decision

**Page/action:** **Approve enrollment**, inspect and confirm the approval dialog. **Needs/input:** completed validation and accepted required evidence. **Expected/saved check:** **APPROVED**, shown as approved for the program; same enrollment reference after refresh. **If blocked:** read the actual blockers; do not disable criteria or invent a pass. Approval does not allocate, schedule, verify or release assistance.

### 10 - Admin: create the physical event

**Page/action:** **Distributions -> Distribution events -> Create distribution**; **Review event details -> Create draft event**. **Needs/input:** exact active program/barangay, fresh service date/time, venue, slot duration 60 (or the valid shorter rehearsal duration), Physical assistance, QR code only, and package 1 demo pack. **Expected/saved check:** event **DRAFT**, correct package/delivery/verification on reopen. **If blocked:** fix the actual field/conflict; do not choose QR + face for the first journey. Do not silently change another event's schedule.

### 11 - Admin: Sessions

**Page/action:** event -> **Sessions -> Plan service sessions**, select **Whole barangay**, fill TEST Main session, date/time, venue and beneficiaries per slot 1 -> **Generate 1 session**. **Needs/input:** DRAFT event and an available matching service period. **Expected/saved check:** saved time slots/capacity for this session, not merely a planned counter. For the one-person example, one 60-minute slot holds one person. **If blocked:** check times, overlap, area coverage and capacity. Once generated, dates/venue/coverage are fixed in this flow; do not keep clicking Generate.

**Whole barangay** means a shared queue for allocated eligible people regardless of their Sitio/Purok. Dili tanan residente automatic apil. **By Sitio / Purok** matches each saved beneficiary area to a session covering it; missing/mismatched Sitio/Purok can prevent scheduling. Choose that only for a separately prepared area-based example. Admin controls session generation/capacity in the current API, although the PDF also marks Barangay for those features.

### 12 - Admin: Allocate

**Page/action:** event -> **Allocate**, select the exact approved test beneficiary -> **Allocate 1 beneficiary**. **Needs/input:** active approved enrollment, correct program/barangay and draft event. **Expected/saved check:** one intended **ALLOCATED** record linked to the same enrollment; no appointment yet unless already scheduled. **If blocked:** check enrollment status, person/area, existing allocation and filters. A whole-barangay session does not allocate everyone automatically.

### 13 - Admin: Schedule

**Page/action:** event -> **Schedule -> Schedule 1 remaining** (count comes from current data). **Needs/input:** unscheduled active allocation plus compatible available slot. **Expected/saved check:** one intended appointment **SCHEDULED**, with queue number, session, date/time and venue. Inspect the queue entry; counts must agree with actual records. **If blocked:** check capacity/coverage and cancelled appointments. A cancelled appointment is not a new unscheduled allocation; use authorized **Reactivate -> Reactivate schedule** in the draft queue after reviewing its slot. Generating again does not undo cancellation.

### 14 - Admin: Open

**Page/action:** event -> **Open**, review readiness -> **Open distribution event -> Open event**. **Needs/input:** saved sessions/capacity, active allocations, assigned schedules and complete package. **Expected/saved check:** event **OPEN**; package/session/allocation/schedule setup locked. **If blocked:** follow the missing readiness item. Do not bypass a correct block. Opening does not itself issue QR credentials or send notifications.

### 15 - Admin: Staff Assistant reminder preview, without sending

**Page/action:** **Ask GarantiyAid / Staff Assistant -> Prepare a reminder**. Enter the exact test event, choose SMS and **All scheduled service areas**, a TEST ONLY message and queue timing -> **Match records and preview -> Preview recipients and message**. **Needs/input:** this existing scheduled event and authorized scope. **Expected/saved check:** backend preview shows actual recipient count, exclusions, personalized message and queue time; **no notification is queued yet**. Inspect exclusions if the contact was left blank. **If blocked/zero recipients:** inspect appointments, cancelled status, contacts and selected area; a saved beneficiary or APPROVED enrollment alone is not an eligible recipient. Do not invent contacts to force a count.

For the main presentation choose **Cancel**, or type **Ayaw sa ipadala.** before confirmation. Expected: unconfirmed task clears, no queued send, shortcuts available in the same conversation; New chat is optional. To demonstrate confirmation/processing, use a separate isolated SIMULATED setup, freshly preview again and explicitly confirm. Do not click Confirm and queue against live SimGate during this rehearsal. Known stale-job/contact behavior must be fixed before a dependable delayed real-send demonstration.

With the sample's blank contact, zero recipients and no personalized eligible message are expected, with an appropriate exclusion. To show a real personalized preview, prepare a separate SIMULATED test case with a controlled valid contact and an eligible appointment. Do not invent a recipient/message or change the person's contact just to force the live preview to pass.

### 16 - Admin: issue and save a fresh QR card

**Page/action:** return to the exact open event -> **Generate remaining QR credentials -> Download PDF**, or **Print QR cards** in the credential dialog. **Needs/input:** QR-enabled OPEN event and the active appointment. **Expected/saved check:** a credential for the exact person/event, expiry matching the recorded appointment end; securely saved card before closing the one-time output. **If blocked:** inspect whether already issued. If the raw value was lost, use Admin's authorized revoke/reissue workflow for an eligible unused credential; do not generate a fake replacement or paste a beneficiary/claim ID as a credential.

Print A4 at actual size, check QR clarity and validity, and keep the full card/private credential out of shared slides. PDF decoding alone does not prove a credential is still valid for a claim.

### 17 - Barangay: queue and camera

**Page/action:** **Distribution day -> Queue & schedules**, select exact event/person -> **Check QR -> Scan with this device's camera**. **Needs/input:** current saved card and permitted camera. Choose the USB camera in the device dropdown; it may appear under its driver name rather than Gsou. **Expected/record check:** camera preview and a decoded credential ready for review, with no check-in yet. **If blocked:** check USB connection, Windows/browser camera permission, localhost/HTTPS, other apps using the camera, focus, lighting and a second-screen/printed card. Do not claim hardware scanning passed if only manual entry was used.

Admin's **Distributions -> Verify QR claims** is the supported credential-entry backup: enter the full saved credential, review the person/event and confirm. The camera/USB scanner is not mandatory for this backup path. Log it as backup credential entry, not a webcam test.

### 18 - Barangay: review and confirm identity

I-compare una ang ngalan, event ug queue sa tawo nga naa sa atubangan. Human sa confirmation, verified/check-in pa lang; wala pa ni nagpasabot nga nadawat na niya ang pack.

**Page/action:** review detected QR, exact name/event and queue -> **Confirm check-in**. **Needs/input:** valid unused unexpired credential, OPEN event, active appointment/allocation. **Expected/saved check:** QR-only claim **VERIFIED**, appointment **CHECKED_IN**, credential **USED**. Reopen the same claim; assistance is still unreleased and no receipt exists yet. **If blocked:** use **Review existing claim** for used/duplicate QR or follow the actual expiry/wrong-event/remaining-check error. Do not repeatedly scan to create a second claim.

### 19 - Barangay: prepare the release record

**Page/action:** **Distribution day -> Releases & receipts**, select event and exact verified claim -> **Mark released**. **Needs/input:** assigned facilitator, completed identity checks, full configured pack and no active dispute/hold. Rehearse giving **1 demo pack**. Enter quantity **1**, **Official Release Log**, `TEST-LOG-01 / page 1 / row 1`, and acknowledgment after the handover. **Expected/record check:** confirmation contains the correct person/package/evidence; no saved release until confirmed. **If blocked:** complete remaining identity checks or resolve the hold; do not report a planned quantity as actually received.

### 20 - Barangay: save actual completion

Dinhi i-record nga nahatag na ang tinuod nga demo pack. Kung wala pa nahatag o kulang ang quantity, ayaw i-confirm nga complete aron lang makapadayon.

**Page/action:** **Mark assistance released**, confirm as prompted. **Needs/input:** the truthful demo handover evidence from step 19. **Expected/saved check:** claim **CLAIMED**, package/quantity, releasing actor/time and original evidence saved; receipt now available. **If response is uncertain:** use **Retry release record** for the original request or inspect this exact claim. Do not hand out another pack or replace the original evidence to get a success message.

### 21 - Barangay: issue and reopen receipt

Human sa saved handover, issue ang receipt ug ablihi pag-usab aron ma-compare ang original reference/details. Mao kini ang complete beneficiary transaction nga inyong ipakita.

**Page/action:** **Issue receipt**, confirm, review **Claim acknowledgment receipt**, print/save through the existing receipt controls. Close and reopen the same receipt. **Needs/input:** saved physical release. **Expected/saved check:** same original receipt reference/snapshot, correct event/person, package quantity 1 and TEST-LOG-01 reference; the handover and receipt now complete this beneficiary transaction. **If blocked:** verify release saved, refresh current data and follow the original receipt; do not generate another completion to obtain a receipt.

### 22 - Admin: reconcile and close the event

Human mahuman ang individual claims/receipts ug ma-review ang findings, Admin na ang mo-close sa whole event. Ayaw i-close ang bugtong case nga plano pa ninyong gamiton para sa live consultation; pag-andam og fresh consultation event.

**Page/action:** **Distributions -> Distribution events**, exact event -> **Distribution reconciliation**. Follow findings, compare signed demo log, release quantities, receipts, attendance and concerns -> refresh -> **Close distribution event**, enter TEST-CLOSE-01 note -> **Close event**. **Needs/input:** no unresolved required completion, missing receipt or active concern. **Expected/saved check:** event **CLOSED**, original claims/receipts/evidence retained; unused active credentials revoked, slots closed. Only ended unvisited appointments are marked MISSED. **If blocked:** resolve the referenced finding; do not void a legitimate handover just to close. Closure cannot be undone here.

### 23 - Admin / DSWD: show the saved evidence

**Page/action:** Admin **Reports and audit -> Reports / Audit logs**; DSWD **Reports & review -> Reports / Audit logs**, and authorized ledger/live monitoring. Apply this exact program/event/date scope; export where offered. **Needs/input:** persisted completed event and authorized access. **Expected/saved check:** same claim/receipt/log references, relevant actors/actions and totals from records. Package units and reference values have different meanings; voiding a claim does not record a return of goods. **If load/rate-limited:** preserve last known figures, wait/retry as directed; do not present stale values as current or failed loads as zero.

## 3. Separate demonstrations after the main journey

| Scenario / role and exact starting screen | Prerequisite / test input | Expected saved result | Recovery / honest limit |
| --- | --- | --- | --- |
| Enrollment correction: DSWD **Enrollment review -> Request correction -> Send correction request**; Barangay **Correct beneficiary documents -> Replace document -> Return to enrollment review -> Resubmit for review -> Resubmit enrollment** | Separate test case, specific correction reason, readable replacement | **NEEDS_CORRECTION -> PENDING -> FOR_VALIDATION -> APPROVED** after independent re-review; same person/enrollment | Replacement needs new acceptance. Do not create another person or treat rejected evidence as accepted. Final rejection is not automatically reopened. |
| QR reuse / wrong event / expiry: Barangay QR verification | Used card, other test event, or a deliberately expired separate fixture | One existing claim, appropriate rejection or existing-claim link; no duplicate handover | Reuse is a negative test. Never publish raw credentials or change the system clock. |
| Cancelled appointment: Admin/assigned Barangay **Queue and schedules / Queue & schedules -> Reactivate -> Reactivate schedule** | Separate DRAFT event, existing cancelled appointment and available compatible slot | Same appointment returns to **SCHEDULED** | Generating remaining schedules is not reactivation. No open-event walk-in bypass. |
| Face enrollment: Barangay **Beneficiary services -> Biometric identity -> Consent & enrollment** | Consenting test participant, active recorded consent and retention decision | Capture reviewed, **Save face profile** succeeds; profile cleared for claims | Photo capture alone is not enrollment. Duplicate hold needs a different authorized Admin/DSWD reviewer. Do not enroll the same face under several fictional people. |
| Claim face check: DSWD/Barangay **Biometric identity -> Claim verification -> Verify beneficiary identity** | Separate face event, exact scheduled participant, cleared reference profile, current consent, working service and a NEW live capture | **VERIFIED** only after actual successful required check | Missing profile, failed match or service outage leaves claim incomplete. Capturing/uploading a photo does not prove liveness. Remote requests ask for anti-spoofing; deployed service/device performance was not tested here. A binary API score is not measured real-world accuracy. |
| QR OR face / QR AND face | Separate drafts with the intended method configuration | **QR_OR_BIOMETRIC:** either required alternative can verify; **QR_AND_BIOMETRIC:** first check **PENDING**, both successful checks **VERIFIED** | Never describe these as interchangeable. Do not downgrade the already-open event after a failed required face check. |
| Face + signature | Separate **BIOMETRIC_AND_SIGNATURE** event; successful face check, participant acknowledgment/signature in presence of staff | Face alone remains **PENDING**; successful required signature completes **VERIFIED** | Mouse/touch/stylus or implemented typed attestation is evidence, not a standalone face replacement. Release remains separate. |
| Manual identity review: Admin explicitly configures separate draft; DSWD/Barangay **Manual identity review** | **MANUAL**, or an explicitly allowed QR/face alternative, and recorded responsible-office basis. TEST ONLY basis must be labeled fictional | **Confirm review and continue to acknowledgment** records evidence/verifier and **PENDING**; successful acknowledgment/signature -> **VERIFIED** | Cannot be added silently to an OPEN event or to required combined checks. Must not bypass holds, appointment/allocation rules or independent review. See [claim-demo guide](claim-demo.md). |
| Simulated wallet: separate **SIMULATED_WALLET** event; DSWD **Distribution & funds -> Ledger -> Credit verified claim** | Approved/scheduled/verified case and authorized DSWD confirmation | Claim **CLAIMED**, one simulated benefit credit, balance/ledger/receipt persist; Admin reconciles | No physical handover and no bank/mobile-money payment. Admin reads/creates wallets but cannot perform DSWD credit/transfer actions. |
| Wallet creation/transfer: Admin or DSWD wallet view; DSWD transfer controls | Two separate TEST wallets, sufficient simulated balance, recipient/amount reviewed | Simulated debit/credit pair and references; reopen both histories | Transfer is not another assistance approval. No actual money movement. Never use real financial accounts. |
| Imports: Admin **Staff and barangays** (Barangays/Staff accounts); Admin/Barangay **Beneficiaries**; Admin/DSWD **Assistance programs** | Download current CSV or Excel template; use one or two TEST rows | Preview validation, explicit confirm, result/history with exact created/skipped counts; programs stay DRAFT; enrollment still needs review | **CSV and XLSX** bulk imports only. PDF/JPG/PNG are supporting documents, not bulk import files. Exact duplicate checks do not guarantee fuzzy/cross-barangay identity matching or atomic manual registration. No ordinary profile-photo import. |
| Reports / audit / concern | Exact test event/claim, authorized reviewer distinct from concern filer | Saved evidence visible; a concern can block completion/closure until authorized resolution | Filing/resolving a concern does not release assistance or return goods. Do not file a disruptive concern on the only main-demo case. |
| Burial referral | Active LIVING applicant, test supporting evidence | **DRAFT -> IN_REVIEW -> READY -> ISSUED -> CLOSED** | Supplementary to the nine PDF groups; no payment/Guarantee Letter. Use [burial rehearsal](burial-referral-rehearsal.md). |

### Staff Assistant conversation checks

Use exact names from your own saved test event, not an invented TUPAD/Punta event:

1. English: **Send reminders for TEST Consultation Distribution 1116A.**
2. Cebuano: **Pahinumdomi ang scheduled beneficiaries sa TEST Consultation Distribution 1116A.**
3. Filipino: **Maghanda ng paalala para sa scheduled beneficiaries ng TEST Consultation Distribution 1116A.**
4. Follow up: **SMS lang.** / **Kanang event nga atong gihisgutan.** Expected: same confirmed event; context does not become a different/all-program event.
5. If several records match, choose the displayed record; if none match, clarify. **Karon, 10 AM** must agree with the event record and does not rewrite its schedule or automatically set SMS timing.
6. Ask **Ayaw sa ipadala.** Expected: no unconfirmed send. A draft cancellation does not recall already queued messages.
7. As Barangay/DSWD, ask to create/open an event or release assistance via chat. Expected: permission-aware guidance, not a forbidden action. Admin distribution drafts require review/confirmation and remain drafts, not automatically OPEN.
8. Ask about mobile push. Expected: **delivery unavailable while unconnected**. A saved push draft is not delivery; staff notification-bell updates are a different channel.

Intent examples are regression/review material, not automatic learning from every conversation. Program policy/FAQ drafts require responsible-staff approval. Personal status/progress must come from an implemented authenticated lookup; a generic answer/diagram is not a person's actual recorded progress. Approved diagram templates may explain the stages without inventing completion, counts, dates or confidence scores.

For this demo, show actual recorded progress from the exact beneficiary's **Assistance progress** screen. General Staff Assistant guidance is not that personal-record lookup.

## 4. Final preparation

Complete your own manual checklist, rehearse the main case once, and prepare a fresh consultation case rather than reopening a CLOSED event. Keep the reference book, a short recording/synthetic screenshots and unresolved-issue list available. Reconcile any saved handover after an outage before retrying. No passwords, OTPs or raw QR credentials belong in the consultation slide deck.

Explain the limitations openly: mobile excluded, push unconnected, wallet simulated, hardware/live face/physical printer not verified by automation, actual SMS arrival not re-tested, and the responsible office has not approved an official government procedure. The [module review](../../output/consultation-2026-11-16-module-review.md) lists the remaining bugs; this documentation task did not fix them or change application source.
