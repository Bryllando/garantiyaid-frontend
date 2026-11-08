# Garantiyaid consultation practice

Ready for a capstone consultation and demonstration using synthetic data. Official procedure approval, deployed pilot acceptance, and actual staff/device validation remain pending. This guide follows the implemented application; it is not an approved government SOP.

## Prepare once

- Use a separate local/demo environment and fictional beneficiary records and documents.
- Prepare one System Administrator, one DSWD Staff and one Barangay Facilitator account. Use separate browser profiles/windows to keep the roles clear. Complete password change and authenticator setup if prompted.
- Confirm that the Barangay Facilitator is assigned to the same active barangay used for the beneficiary and distribution.
- Keep a small test log with the beneficiary, enrollment, event, claim and receipt references. Never write passwords, authenticator codes or raw QR credentials in the consultation notes.
- Start with **physical assistance + QR**. Test face/signature and simulated wallet branches after this first journey succeeds.
- Check the frontend/API connection using the [local connection guide](local-connection.md). Run only one API on port 4000 and one frontend on port 5173. Use `npm run dev` during local practice so backend code changes reload. A healthy API connection is not proof that the whole workflow passed.
- A step is **PASS** only after the assigned tester performs it and records the expected result. Use **FAIL** for a reproduced defect and **NOT RUN** for an untried step. Do not copy automated results into the manual-results column.

## Test example

These values are demonstration choices, not official eligibility requirements or entitlements.

| Item | Example |
| --- | --- |
| Program | TEST Consultation Food Pack |
| Program code | TEST-CONSULT-01; use a new unique suffix for another program |
| Program type | FOOD_ASSISTANCE |
| Grant value / budget | PHP 100 / PHP 1,000, synthetic reference values only |
| Application dates | Include the day of the practice session |
| Eligibility criterion | Age greater than or equal to 18; required |
| Required document | Valid ID type, with a clearly labeled TEST DOCUMENT sample PDF in the demo environment |
| Beneficiary | One fictional adult with a birth date satisfying the test rule |
| Event | TEST Consultation Distribution |
| Delivery / verification | Physical goods / QR |
| Package / unit / quantity | Demo food pack / pack / 1 per beneficiary |
| Session | Today in PHT, with a time slot that has not ended and capacity of at least 1. For example, when practicing at 10 AM, use 10 AM–12 noon and a 120-minute slot; adjust both times to your actual practice time. Do not cross midnight. |
| Handover evidence | A test log entry such as TEST-LOG-01, page 1, row 1 |

For the first run, use only **Valid ID**. For a separate multiple-document run, select **Valid ID + Other**, enter **Request letter → Add document**, then **Certificate of indigency → Add document**. Save and reopen the draft before activation: both names must remain. There are now **three individual requirements**: Valid ID, Request letter, and Certificate of indigency. These are test choices, not an official office checklist. Use a different program code, such as `TEST-CONSULT-DOCS-01`.

## Walk through the main flow

1. **Admin — service area and accounts.** Open **Administration → Staff and barangays**. Check the active barangay, active DSWD account and active Barangay Facilitator assignment. Create missing demo accounts through the normal account form. Keep the barangay active throughout the journey.
   - Check: the facilitator signs in and sees the correct assigned area.

2. **DSWD — prepare the program.** Open **Programs & enrollment → Assistance programs → Create program**. Use the test example above. Save the draft, select it, choose **Add criterion**, and set Age / Greater than or equal / 18 / Required. Choose **Activate program**. Admin can also manage programs, but use DSWD for this practice handoff.
   - Check: the program is Active, its application period covers today, and the requirements are visible.

3. **Barangay — register the person.** Open **Beneficiary services → Beneficiaries**. Search first, then register the fictional person in the assigned barangay. Open that exact record.
   - Check: one beneficiary record exists. Registration alone is not enrollment or approval.

4. **Barangay — documents and enrollment.** Upload the TEST DOCUMENT under the program's required type. Select the active test program and choose **Submit enrollment**, then **View submitted enrollment**. Keep the enrollment reference for DSWD.
   - Check: the enrollment is submitted/pending and its attachment is listed. Do not create a second beneficiary for the same case.
   - Multiple-document run: choose the active program above the document list. Upload one Valid ID sample, then choose **Request letter** directly from **Document type** and upload its file. Repeat for **Certificate of indigency** with its own file. You can also click **Upload** beside each missing requirement to select it automatically. Submission stays disabled until all three requirements have a submitted or accepted file.

5. **DSWD — independent review.** Open **Programs & enrollment → Enrollment review**, select that enrollment, then **Start validation**. Open and review the attachment, accept the required document, review the eligibility result, then approve the enrollment. The submitting user cannot approve their own submission.
   - Check: the enrollment is Approved. The person is not yet assigned to an event.
   - Multiple-document run: review and accept each of the three files separately. Accepting only Request letter must not satisfy Certificate of indigency. Approval stays blocked while any required document lacks an accepted matching file.

6. **Admin — distribution setup.** Open **Distributions → Distribution events → Create distribution**. Select the same program and barangay, choose **Physical assistance**, and select **Allowed verification methods → QR code** only. Set the demo package to 1 pack and use today's PHT date with a session that will still be valid during verification. Choose **Review event details → Create draft event**. Follow **Sessions → Allocate → Schedule → Open**: prepare a whole-barangay session and capacity, allocate the approved enrollment, choose **Schedule 1 remaining** for this one-person example, review readiness, then **Open distribution event** and confirm **Open event**.
   - Session grouping: **Whole barangay** creates a shared queue for allocated beneficiaries from any Sitio/Purok in the selected barangay. It does not enroll all residents. **By Sitio / Purok** limits each session to its selected recorded areas; each eligible area needs a session, and missing Sitio/Purok records must be corrected first. Only approved, active beneficiaries allocated to this event can be scheduled.
   - Capacity is per time slot: **08:00-12:00 with 40-minute slots and 10 people per slot = 6 slots and 60 places**. This is room in the plan, not 60 approved or assigned people. Generate the session plan first, then allocate and schedule. Dates, times, venue and area coverage stay fixed after generation; slot capacity remains editable while the event is a draft.
   - Check: the event is Open and the beneficiary has one allocation and appointment. Opening locks the verification requirement, package, sessions, allocations and schedules.
   - Select the allowed verification methods using the **QR code** and **Live face match** checkboxes. With both selected, a beneficiary can complete **QR OR face match**; the unused alternative is not required. QR can be printed, and face matching uses the staff camera, so neither needs a beneficiary phone. Face matching still requires active consent and a cleared face profile. **Require both methods for every beneficiary** explicitly changes this to QR AND face match; existing strict events keep their rule. With face matching alone selected, **Require a signature after the face match** adds a required signature and prevents QR from replacing it. Choose the rule while the event is a draft.

7. **Admin — issue the QR.** In the open event, the first operations section is **Beneficiary QR cards**. Choose **Generate remaining QR credentials**. Print/download the test credential immediately; its raw value is shown once. Supply it to the person playing the test beneficiary.
   - Prefer **Download PDF** to keep a copy you can print again. The on-screen QR is enlarged for reading; downloaded PDFs and printing use compact cards with a 38 mm QR, normally four cards per A4 page. Long details may need more pages. To print immediately, choose **Print QR cards** with **A4 portrait**, **100% / actual size**, and browser headers/footers off. Cut along each card's border. After printing, confirm **I have printed or securely saved all cards**, then choose **Done**. Cancelling print does not count as saving. **Staff backup options** contains **Save CSV** and **Copy tokens** for authorized backups.
   - Check: the credential belongs to the same person/event and is not expired. A claim reference or beneficiary number is not the credential.
   - If the page says **1 issued · 0 ready to generate**, issuance is already complete. Use the saved card/PDF or the **Token** column in `garantiyaid-qr-tokens.csv`. If no copy was saved, find the beneficiary in **Beneficiary QR cards → Replace lost QR → Create replacement QR**, then save the new card. Replacement invalidates the old card and keeps the same event, appointment and beneficiary. Used credentials, existing claims and ended service sessions cannot be replaced.
   - If **Too many requests** appears, wait for the displayed retry time. Repeated clicks do not send more requests during the general API cooldown, and replacement is never retried automatically. After a backend code update, restart the existing backend terminal with **Ctrl+C**, then **npm start**; keep one backend process running.

8. **Barangay — verify the visit.** Open **Distribution day → Queue & schedules**, select the event and find the beneficiary. Open **QR verification**, scan the credential using the device camera or USB 2D scanner, review the person/event, then confirm. For this QR-only event, successful verification creates the verified claim and checks in the appointment.
   - Check: one verified claim exists and the schedule is Checked in. Verification has not recorded a physical release.
   - If no camera/scanner is available: Admin can use **Distributions → Verify QR claims**, paste the full backup credential, choose **Review QR claim**, review and confirm. Return to Barangay for release. Record that this exercised the Admin backup path; it did not validate the physical scanner/camera.
   - If the claim says **Awaiting face verification**, the event requires a face check in addition to QR and differs from this QR-only rehearsal. Choose **Continue identity checks**. If it reports **The beneficiary does not have an enrolled biometric profile**, choose **Review consent & enrollment**. Barangay selects the same test beneficiary, explains and records the actual consent decision, then chooses **Save face profile** after a reference capture. With active consent and an Enrolled profile, choose **Return to claim verification** and take a **new live photo** for the same beneficiary and event. Only a successful required match completes verification. Registering a beneficiary or enrolling them in an assistance program does not enroll their face profile.
   - Do not repeat verification captures while the reference profile is missing. If equipment is unavailable, use a new QR-only test event for this rehearsal; keep the existing event's verification requirement and claim history intact. Simulated face checks exercise workflow only and do not prove real face recognition or liveness.
   - **Photo captured is not yet enrolled.** In **Consent & enrollment**, take one reference photo, review it, then choose **Save face profile**. Active consent stays visible; **Change consent decision** is collapsed because recording a new decision revokes the previous consent/profile. If the face service is unavailable, keep the page open and use **Retry saving face profile** after the service is ready; the same captured photo is retained and no automatic retry is sent. The local CPU face service may take more than 30 seconds to warm up; the configured request timeout is 90 seconds. After applying this backend/config update, restart the existing backend terminal with **Ctrl+C → npm start**. Do not start a second backend process.

9. **Barangay — demo handover and receipt.** Open **Distribution day → Releases & receipts** and select the exact claim, then **Mark released** to open the release form. In this synthetic environment, rehearse the handover of 1 demo pack, enter **Quantity handed over: 1**, the applicable acknowledgment/evidence and test-log reference, then **Mark assistance released** to save it. Choose **Issue receipt**, review it and print/save the test copy. Reopen it to confirm the same reference and original details.
   - Check: one recorded handover, correct package/quantity/reference and one issued receipt. Do not use these demo entries as evidence of a real assistance release.

10. **Admin — reconcile and close.** Return to the event's **Distribution reconciliation**. Compare the beneficiary, claim, 1 pack, evidence and receipt against the test log. Resolve every finding. Review **Reports and audit → Reports / Audit logs**, then **Close distribution event** with the test closing-sheet/log reference.
    - Check: the event is Closed and its receipt, handover and audit history remain visible. Closure cannot be undone through this workflow; use a new test event for another full run.
    - Keep the session open long enough to finish verification. Future unvisited appointments or unfinished claims can correctly prevent closure; follow the findings instead of changing attendance or the device clock to force a pass.

## Identify a bug versus an expected block

Run the normal journey first. Use separate synthetic cases for exception tests, before closing their events.

| Test / screen | Expected result | Report a bug if |
| --- | --- | --- |
| Program draft: add two Other names, save, reopen | Both names remain as separate requirements | A name disappears, saving reports an unrecognized document field, or the list is merged into one requirement |
| Program draft: add the same Other name twice, changing only case or spaces | Duplicate is rejected; the first name remains | Duplicate requirements can be saved |
| Barangay documents: leave one named requirement missing | Submit enrollment remains disabled / API rejects submission | An incomplete enrollment can be submitted |
| DSWD review: leave one required file unaccepted | Approval remains blocked | Enrollment becomes approved without all required files accepted |
| DSWD correction: return a separate case, Barangay replaces rejected file and resubmits | Same beneficiary and enrollment continue; new file needs review | Another person/case is needed to continue, or rejected evidence is accepted silently |
| Independent review | The submitting staff user cannot approve their own case | Self-approval succeeds |
| Distribution setup: capacity, allocation or queue missing | Open action is blocked with the outstanding prerequisite | An incomplete event opens, or a fully ready event fails without an explanation |
| Open event: attempt package/schedule edits | Draft configuration is locked | The opened event's package or appointments can be changed through draft controls |
| Queue/QR: scan valid credential, then scan it again | One claim; used QR leads to the existing claim | A second claim or duplicate completion appears |
| Claim: verified but no handover | Claim is verified; release and receipt are still incomplete | Verification alone records release, or a physical receipt can be issued before handover |
| Release: wrong quantity / no acknowledgment | Save is blocked; correct whole package and acknowledgment are required | Wrong quantity or missing acknowledgment completes the release |
| Release: retry after an uncertain response, in a controlled demo only | Original saved completion and evidence remain; no second handover | Actor, quantity or original evidence changes, or completion is duplicated |
| Receipt: reopen and reprint | Same receipt reference and original snapshot | A new receipt/reference or different original details appear |
| Barangay access: a second facilitator assigned to a different test area | Other area's person, event and claim are inaccessible | Cross-barangay private records can be read or changed |
| Admin reconciliation: unfinished claim, missing receipt or active concern | Closure is blocked and the finding points to the affected record | Event closes despite unresolved findings |
| Closed event: try another verification or release | Action is rejected; prior evidence remains readable | New completion is accepted or old records disappear |
| Barangay archive with an active facilitator or draft/open event | Archive is blocked | Linked active work is archived without resolving the blocker |
| Unused test barangay: archive, then restore | Area moves between lists; linked history remains; staff accounts are not reactivated automatically | Records disappear or restoring the area silently activates staff |
| Search, filters and mobile/keyboard use | Correct matching records; clear filters recover the list; labels/buttons remain readable and reachable | Results remain stale, the wrong record opens, focus is trapped, or important actions are hidden |

A disabled button with a correct missing prerequisite is not a bug. A generic error on valid, complete input needs investigation. For **No distributions in this scope**, check event status, selected filters, program and barangay assignment before reporting a defect. Do not create another beneficiary to work around an error.

## Keep proof for the consultation

Use one fictional case all the way through. Keep the program, beneficiary, enrollment, distribution, claim and receipt references together so the screenshots prove one connected journey.

| Evidence | Capture after |
| --- | --- |
| E01 — Access and area | Three roles sign in successfully; facilitator has the intended area. Exclude passwords, authenticator screens/codes and tokens. |
| E02 — Program | Active program, eligibility criterion and required document names are visible. |
| E03 — Submission | The fictional person's documents and submitted enrollment are visible. |
| E04 — Review | Required files are accepted and the same enrollment is approved. |
| E05 — Distribution | Open event, correct package, allocation, session and queue entry are visible. |
| E06 — Verification | The same person's claim is verified and attendance is checked in. Do not expose a raw QR credential. |
| E07 — Completion | Recorded package quantity, acknowledgment/log reference and saved receipt are visible. Save the synthetic receipt PDF. |
| E08 — Reconciliation | Reconciliation, closed event and relevant audit records agree with the test log. |
| E09 — Negative tests | Failed/blocked attempts and their expected explanations are logged separately. |

Use this row for every normal step and exception test; leave a blank result as NOT RUN, not PASS:

| Test ID | Tester / role | Date / time PHT | Screen and action | Expected result | Actual result | PASS / FAIL / NOT RUN | Evidence reference | Issue and retest reference |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MAIN-01 | | | | | | NOT RUN | | |

For a failure, record exact clicks, the displayed error, browser/device, and the synthetic record references. Keep the failed observation and add a separate retest row after the fix. Do not overwrite a failure with PASS without repeating that affected step and the steps that depend on it.

Before Wednesday: complete one normal physical/QR journey, repeat it with a new event, test the two named Other documents, and record the correction/duplicate/access checks. Keep the demonstration database and generated evidence available; do not close or delete the only event you plan to demonstrate live. Use a new prepared event for the consultation.

Bring a short screen recording of the connected journey, E01–E09, the test log and any open issues. Mark actual camera/scanner, printer, mobile-app integration, SMS delivery and real payment settlement as NOT RUN unless those exact paths were separately exercised and recorded. No actual SMS delivery or real payment settlement is implemented by the simulated branches. Consult with recorded limitations rather than describing an untested branch as working.

## Try after the first successful run

- **Correction:** use a separate test person. DSWD returns an enrollment with a clear correction note; Barangay fixes the document and resubmits; DSWD independently reviews it again.
- **Duplicate prevention:** reuse the used QR. Follow the existing-claim link; confirm that no second claim/handover is created. For a repeat release request, inspect the original saved claim instead of handing out another pack.
- **Barangay archive:** use a separate unused demo barangay. Admin archives it, checks **Archived barangays**, then restores it. An active facilitator or draft/open event must block archive. Do not archive the area in the middle of the main journey.
- **Other verification:** use a separate event for face/combined/signature requirements. Record actual camera/device results separately from fixture or simulated face checks. There is no manual identity-check bypass.
- **Simulated wallet:** use a separate event. After its required verification, DSWD records **Credit verified claim**, then receipt/reconciliation. This does not transfer real money and has no physical handover step.

## Separate burial-referral demonstration

1. Barangay opens the **living applicant's** beneficiary record → **Prepare burial referral**.
2. Enter the deceased person's details, purpose, offices, proposed signatory and attachments. Save and **Submit for review**.
3. DSWD opens **Burial referrals**, checks and accepts attachments, then **Prepare letter for signature**, or returns the same case for correction.
4. Staff chooses **Preview letter → Print / Save PDF**. Printing does not issue the referral.
5. Rehearse the designated officer's offline signing and handoff using demo paperwork; Barangay/DSWD records **signed issuance** with the test reference.
6. Leave it issued while waiting for a response. Only in the demo environment, rehearse a clearly labeled synthetic external response and close the referral.

Admin has read/preview oversight here. The receiving office needs no system account. A referral is not an approval, Guarantee Letter or payment; the receiving office's authority and accepted procedure remain consultation questions.

## Bring these questions to the consultation

- Which office, named assistance program and barangays will use it?
- Which actual positions may assess, approve, verify, hand over, sign letters and reconcile?
- Which documents, eligibility rules, package quantities and acknowledgment/receipt forms apply?
- What happens for representatives, failed verification, accessibility needs, shortages and outages?
- Who keeps the signed evidence, handles concerns and accepts the pilot? Which actual devices and notification channel will be used?

For a failed step, record: **role → screen → action → expected result → actual result → test record reference**. Use synthetic/redacted screenshots. A completed automated rehearsal is not actual staff acceptance.

Detailed references: [staff workflow](staff-workflow.md), [burial referrals](../../garantiyaid-backend/docs/burial-referrals.md), [supervised pilot](../../garantiyaid-backend/docs/supervised-pilot.md), and [office procedure review](../../garantiyaid-backend/docs/government-procedure-review.md).

### Practice the alternative verification methods

Create a separate draft with **QR code** and **Live face match** checked; leave **Require both methods for every beneficiary** unchecked. Prepare two approved beneficiaries with active schedules. Verify one by QR only. For the other, open QR verification and choose **Use face match instead**, or open Biometric identity directly; a successful face match completes verification without scanning a QR. Confirm that the unused alternative is marked **Alternative not needed**. Verify that neither method passing prevents release, and that trying the other method after completion cannot create a second claim. Physical release or simulated wallet credit remains a separate authorized action.
