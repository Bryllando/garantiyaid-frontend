# Burial referral: defense rehearsal

Verified on 15 November 2026 using the actual API, an isolated PostgreSQL database and Chrome. These are software checks with synthetic records, not an approved government procedure. Run the hands-on steps below in your separate demo/test environment.

The automated runner removes its temporary database when finished. Its sample PDF references and TEST Maria Santos record are therefore **not records in your usual running web app**. Create or reuse your own test records for the manual rehearsal; do not expect the automated fixtures to remain there.

## What completes this flow

```text
Living applicant + supporting documents
                 |
               DRAFT
                 |
        Submit for review
                 |
             IN_REVIEW
                 |
    Independent DSWD review
    All listed documents accepted
                 |
               READY
                 |
     Preview / Print / Save PDF
       (status remains READY)
                 |
     Officer signs offline; handoff
     Staff records signed issuance
                 |
              ISSUED
                 |
     Record actual office response
                 |
              CLOSED

IN_REVIEW or READY -> NEEDS_CORRECTION
                       |
               Edit the SAME case
                       |
                Resubmit -> IN_REVIEW
```

**CLOSED means the receiving-office response was recorded. Dili kini pasabot nga nabayran ang burial assistance.** Issued means staff recorded signing and handoff/dispatch; it does not prove the receiving office received the letter. Printing alone changes neither status.

This referral does not require a distribution event, allocation, queue, QR, face verification or wallet credit. An assistance distribution/payment is a separate workflow. Do not create the deceased as the applicant or describe this letter as a Guarantee Letter.

## Prepare the rehearsal

1. Use a separate test/demo database with fictional records. Do not reset an existing database or point the test runner at live records.
2. Use separate browser profiles for Barangay, DSWD and Admin. The Barangay account needs the applicant's barangay assignment. Use a different authorized DSWD reviewer; Admin is read-only here.
3. Keep one backend terminal and one frontend terminal running for your manual test. To load these backend fixes, stop the existing backend with Ctrl+C and run `npm.cmd start` there; refresh the web page. Reuse existing terminals instead of starting another server on port 4000.
4. Prepare a PDF/JPG/PNG marked **TEST ONLY**, at most 5 MB, containing no real personal information. This fixture is not an official checklist.
5. Note your applicant ID, referral reference, status and actual test result. Take screenshots of test data only.

| Field | Test value |
| --- | --- |
| Living applicant | TEST Maria Santos, active in the assigned test barangay |
| Deceased person's full name | TEST Jose Santos |
| Date of death | 2026-11-12 |
| Applicant's relationship to the deceased | Daughter |
| Sending office | TEST Barangay Desk |
| Receiving office | TEST Receiving Office |
| Receiving office address | TEST ONLY address, Test City |
| Authorized signatory's name | TEST Authorized Officer |
| Signatory's position | TEST ONLY designated officer |
| Purpose of referral | TEST ONLY burial referral for assessment |
| Document description for the letter | TEST ONLY synthetic supporting record |
| Signed-original / dispatch reference | TEST-ISSUE-01 |
| Reported outcome | OTHER |
| Response / withdrawal document reference | TEST-RESPONSE-01 |
| Response details and responding office | TEST ONLY simulated office response. No actual government decision or payment. |

## If DSWD only sees a Draft

**Save draft is not Submit for review.** A draft with no listed attachments has no DSWD review actions.

1. Barangay reopens the same BR- reference and selects **Edit details**.
2. Correct any misplaced values: receiving office is an office name; receiving address is its location; authorized signatory is a person's full name; position is that person's designation; purpose describes the request. Keep each in its own field.
3. **Upload and attach** a supporting document, or use **Add to this referral** for an existing applicant document. Select **Save draft**, then **Submit for review**.
4. DSWD opens the same reference and selects **Refresh**. Continue only when its status is **Awaiting review**; review/accept the listed documents before **Prepare letter for signature**.

The relationship field offers suggestions and accepts another relationship. Sending office is prefilled from the applicant's Barangay. Office, address and signatory details remain manual because there is no approved office/signatory directory in the app; confirm them with the responsible office. Suggestions do not establish eligibility or signing authority.

## Numbered manual journey

1. **Barangay: Beneficiary services -> Beneficiaries.** Search for the living applicant. If absent, use **Register beneficiary** with fictional details; select the saved active record. Expected saved result: one intended living applicant in the correct barangay.
2. Choose **Prepare burial referral**. Expected: TEST Maria Santos appears as **Living applicant**, with separate fields for the deceased. No referral has been saved yet.
3. Enter the sample deceased, office, signatory and purpose fields. **Date of death** must be a valid date no later than today in Philippine time. Expected: required fields completed; typing does not save.
4. Under **Supporting documents for this request**, choose **Upload a new document**. Enter **New document description**, select the test file, then **Upload and attach**. Expected saved result: an uploaded applicant document, and one document attached to the form. Selecting a file alone does not attach it or save the referral.
5. Alternatively choose **Use an existing document**, select **Existing applicant document**, enter **Document description for the letter**, then **Add to this referral**. Use this applicant's current submitted/accepted files. Expected: the file appears once in the attached list.
6. Choose **Save draft** once. Expected database status: **DRAFT**; screen label: **Draft**. Record the BR- reference and URL. Refresh/reopen that exact referral and check that details/attachments persisted.
7. Choose **Submit for review**. Expected: **IN_REVIEW**, displayed as **Awaiting review**. Barangay cannot edit submitted details directly.
8. **DSWD: Programs & enrollment -> Burial referrals.** Search by applicant or deceased name and use **Open referral**. Compare the BR- reference. Expected: the same saved **IN_REVIEW** case.
9. Use **View document** to open each listed attachment inside the page, or **Download** to save it. Closing the preview returns focus to its button. Previewing does not accept a document. Choose **Accept document** only for appropriate test evidence. Expected document status: **ACCEPTED** for every listed attachment; referral remains **IN_REVIEW**. Preparing stays blocked while evidence is unaccepted/unavailable.
10. Check the review confirmation after checking parties, attachments, destination and signatory. Choose **Prepare letter for signature**. Expected: **READY**, displayed as **Ready for signature**. The reviewed snapshot, reference and review actor/time are saved together.
11. Choose **Preview letter**. Check applicant/deceased, date, destination, purpose, attachment descriptions and signatory. **Save PDF** downloads an A4 PDF directly; **Print letter** opens the printer dialog. Expected: **FOR SIGNATURE - not yet issued**; status remains **READY**. Supporting files must accompany the letter separately; they are not embedded in its PDF.
12. Close the preview or press Escape. Expected: focus returns to **Preview letter**. Reopen the referral: reference and reviewed details remain unchanged. Later applicant profile edits must not rewrite this prepared snapshot.
13. **Offline signing/handoff rehearsal:** use TEST ONLY paperwork. For actual operation, the designated authorized officer must sign and the letter must be handed over/dispatched before staff confirm issuance. The app does not create or verify that handwritten signature.
14. **Barangay or DSWD:** under **Record issuance after signing**, follow the three reminders for printing, obtaining the officer's signature and handing over/dispatching. Enter **TEST-ISSUE-01** in **Signed-original / dispatch reference** for this rehearsal. For actual use, enter the logbook entry, signed-copy number or dispatch record where the signed original is kept, not a status such as “Ready for signature.” After the synthetic handoff, check the acknowledgment and choose **Record signed issuance**. Expected: **ISSUED**, displayed as **Issued · awaiting response**. Reopen to verify issuer, time and reference.
15. Choose **Preview letter** again. Expected: **ISSUED RECORD COPY - original signature is not reproduced**, the original reviewed reference/details, and TEST-ISSUE-01. Reprinting does not change status. Retain the signed original separately.
16. In actual operation, **leave it ISSUED while waiting for an actual response**. In this isolated rehearsal only, enter **OTHER**, **TEST-RESPONSE-01** and the explicit TEST ONLY response above under **Record receiving-office response**.
17. Choose **Save response and close referral**. Expected: **CLOSED**, displayed as **Response recorded**. Refresh/reopen: outcome, reference/note, actor/time and original letter snapshot persist. No claim, wallet payment or assistance approval is created.
18. **Admin: Beneficiaries -> Burial referrals.** Open/preview the same case. Expected: **Read-only oversight**, without create, edit, review, issue or close controls. Direct API mutation attempts must also be rejected.

## Correction on the same case

1. Before issuance, DSWD fills **What needs correction?** and chooses **Return for correction**, from **IN_REVIEW** or **READY**. Expected: **NEEDS_CORRECTION**, with the saved note visible.
2. Barangay opens the same BR- reference, chooses **Edit details**, corrects the indicated fields/files, then **Save draft**. Expected: corrections persist; status stays **NEEDS_CORRECTION**.
3. Barangay chooses **Submit for review**. Expected: **IN_REVIEW**, same reference.
4. DSWD reviews and prepares again. Expected: **READY** with the new snapshot; previous correction/review history stays in the audit log.
5. **ISSUED/CLOSED** records cannot be edited through this flow. Follow the responsible office's records procedure for an already signed letter.

## Recovery and negative checks

Use separate test cases if a check would disrupt your main rehearsal.

| Try | Expected result |
| --- | --- |
| Missing required office/purpose or impossible/future death date | Validation blocks saving; no partial referral. |
| Draft without attachments, then submit | Draft allowed, submission blocked until supporting evidence is attached. |
| Foreign, rejected, superseded or removed attachment | Backend rejects it; choose current evidence belonging to this applicant. |
| Prepare before all listed files are accepted | Blocked; review files or return for correction. |
| Issue before READY, close before ISSUED | Blocked; follow the state order. |
| Wrong barangay, inactive applicant, unauthorized role | Backend rejects inappropriate access/actions. |
| First applicant load fails | **Refresh** stays available; retry on the same applicant URL after restoring connection. |
| Save response lost after the server may have saved | **Retry last save** keeps the original request/key; editing stays disabled until resolved. |
| Rate limit | Wait for the countdown; fields are kept and saves are paused. Expiry does not automatically save. |
| Two staff act on one version | One succeeds; the other refreshes and reviews the new state. |
| Lost tab/session after uncertain save | Search/inspect the exact case before creating another; unsaved details do not survive sign-out. |
| Reprint or profile edit after preparation | Reviewed snapshot/reference unchanged. |
| Long names/purpose/attachment descriptions | Text wraps; A4 may continue on another page without shortening the record. |

## Automated verification and evidence

From `garantiyaid-backend`:

```powershell
node scripts/verify-integrated-workflow.js --burial
```

The runner starts its own temporary PostgreSQL instance/port, applies migrations, authenticates synthetic staff, runs real API/Chrome journeys and removes only its own test database. Email is disabled; SMS is simulated. It does not need port 4000 or leave an interactive demo server running.

- [Actual API/browser results](../../output/burial-referrals/results.json): 10 scenario groups passed; `databaseRemoved: true`.
- [Verification report](../../output/burial-referrals/verification.md).
- [Reviewed letter](../../output/burial-referrals/referral-letter.pdf), [issued copy](../../output/burial-referrals/issued-record-copy.pdf), [long letter](../../output/burial-referrals/long-referral-letter.pdf): TEST ONLY examples, 1 / 1 / 2 A4 pages.
- [Desktop review](../../output/burial-referrals/reviewed-referral-1440.png), [mobile preparation](../../output/burial-referrals/prepare-referral-390.png), [mobile preview](../../output/burial-referrals/letter-preview-390.png).

## Record your manual results

Automated PASS does not certify your physical/manual rehearsal. Update rows only after your team performs them, noting the reference or screenshot.

| Manual check | Before your rehearsal | Your evidence / notes |
| --- | --- | --- |
| Living applicant and correct barangay | NOT RUN | |
| Documents and saved draft | NOT RUN | |
| Submit, refresh/reopen | NOT RUN | |
| Independent DSWD review | NOT RUN | |
| Correction/resubmission, same reference | NOT RUN | |
| Prepared letter and Save as PDF | NOT RUN | |
| Physical printer output | NOT RUN | |
| TEST ONLY offline signing/handoff | NOT RUN | |
| Issuance and unchanged reprint | NOT RUN | |
| OTHER response and CLOSED record | NOT RUN | |
| Admin oversight | NOT RUN | |

Use PASS, FAIL, BLOCKED or NOT RUN and record actual evidence.

## Questions for the adviser/receiving office

Confirm the accepting office, official checklist/form, signing authority, signed-original retention and staff allowed to record responses. The configured DSWD reviewer role does not establish jurisdiction over an LGU service. Receiving-office integration, verified electronic signing, physical receipt confirmation and payment are not implemented by this referral workflow.
