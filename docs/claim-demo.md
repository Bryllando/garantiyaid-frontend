# Claim verification, handover and receipt rehearsal

This guide describes implemented staff workflows. All seeded records below are synthetic. A successful identity check is not a recorded handover. The physical claim becomes `CLAIMED` when the assigned Barangay Facilitator saves the actual release; issuing its receipt finishes documenting that beneficiary's transaction. Admin reconciliation and event closure are separate.

## What changed

Existing QR, face, QR OR face, QR AND face, and Face + Signature events keep their requirements. New drafts can explicitly permit **Manual staff verification + acknowledgment/signature**, alone or as an alternative to QR/face. An Admin must record the responsible office's approved verification basis. Manual review cannot be added to required combined checks or silently enabled on open events.

Manual review records the scheduled person, approved basis, identity-evidence reference, notes, verifier and time. It creates a `PENDING` claim and checks in the appointment. The existing signature component then collects a drawn signature (mouse, touch, compatible stylus) or typed acknowledgment with staff attestation. Only successful acknowledgment changes the claim to `VERIFIED`. A signature alone cannot create identity evidence. A signed handover log is separate release evidence.

Manual verification belongs to authorized DSWD Staff and assigned Barangay Facilitators. Admin configures events and reviews records. Cancelled/expired appointments, suspended enrollments, duplicate-profile holds, existing claims and claim disputes must be resolved through their authorized workflows. Manual review is not a bypass for those restrictions.

Camera selection is available for QR, reference enrollment and claim-day capture. The QR scanner uses native decoding where available and lazy-loads the bundled [jsQR decoder](https://github.com/cozmo/jsQR) otherwise. Captures/QR decoding run on the staff device; QR values still need backend validation. Camera permission, HTTPS/localhost, focus and adequate lighting are required. No compatibility or biometric-accuracy claim is made for an untested webcam.

## Install and migration

Backend, from `garantiyaid-backend`:

```powershell
npm.cmd ci
npx.cmd prisma migrate deploy
npx.cmd prisma generate
```

The additive migration `202611120001_manual_identity_verification` adds nullable `distributions.manual_verification_basis` and `claims.manual_verification`. Existing rows remain null; no event requirement, identity profile or receipt is rewritten. `MANUAL` reuses an existing database enum value.

Frontend, from `garantiyaid-frontend`:

```powershell
npm.cmd ci
```

Restart the existing backend terminal after the update: **Ctrl+C**, then `npm.cmd start`. Keep one API process running. Restart the frontend dev terminal if necessary. The notification worker is unrelated; do not start another worker for this rehearsal.

## Prepare an isolated local demo

The setup refuses production mode and non-local PostgreSQL. Run it only against your development/demo database. It creates a dedicated `TEST-CLAIM-<run>` program, synthetic approved enrollment fixtures, allocations, appointments and four open physical-assistance events. This is explicitly seeded test preparation, not evidence of an actual eligibility review. Existing active Admin, DSWD reviewer and assigned Barangay accounts are reused; no accounts, contacts, consent or face profiles are fabricated. No SMS/email/push jobs are queued.

Backend:

```powershell
node scripts/prepare-claim-demo.js --apply --local-demo --run=20261112
```

Use a new short run label for another rehearsal, for example `--run=defense01`. Dates and service windows use current **Asia/Manila** time, with four sequential, non-overlapping sessions of up to one hour each, ending no later than 23:59. Preparation refuses a conflict with any existing event in the barangay; it does not move or overwrite it. Repeating the same label preserves its records and credentials instead of resetting completed or expired work. A new label creates a fresh isolated set.

The scenarios are:

| Event method | Synthetic beneficiary | After identity checks |
|---|---|---|
| QR | DEMO Qr Participant | `VERIFIED` after QR review and confirmation |
| BIOMETRIC | DEMO Face Participant | `VERIFIED` after a successful live match |
| QR_AND_BIOMETRIC | DEMO Face Participant | `PENDING` after the first check; `VERIFIED` after both |
| MANUAL | DEMO Manual Participant | `PENDING` after staff identity review; `VERIFIED` after acknowledgment/signature |

The same DEMO Face Participant is deliberately reused across its two events, with one reference profile, so the rehearsal does not enroll the same person under two biometric identities.

The setup issues the two QR credentials through the authenticated backend issuance API. It stores their one-time raw values only in the private, git-ignored `garantiyaid-backend/recovery/claim-demo-<run>/credentials.json`. Do not paste this file into AI chat, commit it, or publish it. `summary.json` contains non-secret event references. Existing issued tokens are not automatically replaced on rerun.

Export using the actual existing QR-card dialog and PDF builder, from `garantiyaid-frontend`:

```powershell
node scripts/export-claim-demo.mjs --credentials=../garantiyaid-backend/recovery/claim-demo-20261112/credentials.json
```

This writes `qr-cards.pdf` and `qr_and_biometric-cards.pdf` next to the private credentials file. Print A4 portrait at actual size, with browser headers/footers off. The PDFs contain working single-use test credentials, not generic sample QR images. They expire at the recorded appointment end; always check the printed validity time.

## QR rehearsal

1. Barangay opens **Distribution day → Queue & schedules** and selects the `TEST ONLY — QR` event for this run.
2. Find **DEMO Qr Participant**, choose **Check QR**, then **Scan with this device's camera**. Select the USB webcam if necessary.
3. Hold the printed card or its PDF on another screen in front of the camera. Review the beneficiary and event, then explicitly **Confirm check-in**.
4. Expected: one `VERIFIED` claim and a `CHECKED_IN` appointment. Assistance is not yet released.

If the camera is unavailable, Admin can use its existing **Verify QR claims** backup form with the full credential from the private saved card. This tests the authorized credential-entry path, not hardware scanning. Do not use a beneficiary number or claim reference as the credential.

## Face rehearsal

1. With a consenting demo participant, Barangay opens **Beneficiary services → Biometric identity → Consent & enrollment** and selects **DEMO Face Participant**.
2. Explain and record the actual consent decision. Capture a clear reference photo, review it, then **Save face profile**. Wait for an enrolled, cleared profile. Capturing a photo alone does not save the profile.
3. Open **Claim verification**, select this run's BIOMETRIC event and the same participant. Take a **new live photo** and choose **Verify beneficiary identity**.
4. Expected only after the actual service reports a successful check: `VERIFIED`. A missing profile, unavailable service or failed match leaves verification incomplete; do not record a fabricated pass.
5. For the combined event, scan its separate QR card and complete the face check against the same enrolled profile. Both are required. Claiming in one event does not authorize another event without its own allocated appointment.

The remote face service must be available. If your local Docker setup is configured, the existing backend command is `npm.cmd run biometric:ai:up`; inspect logs using `npm.cmd run biometric:ai:logs`. If a profile is missing, finish enrollment. If the service is unavailable, restore the service and retry the retained capture. A new photo cannot fix a service outage. A potential duplicate profile requires independent authorized review; do not delete or clear a record just to force the demo to pass.

## Manual rehearsal

1. Open **Distribution day → Manual identity review** (Barangay) or **Identity & claims → Manual identity review** (DSWD). Alternatively, in **Queue & schedules**, select this run's MANUAL event and choose **Review identity** for **DEMO Manual Participant**. On events with an explicitly enabled alternative, QR/face screens also provide **Use permitted manual identity review**.
2. Read the event's approved basis. For this synthetic rehearsal only, record `DEMO-ID-01 / row 1` and a truthful note describing the supervised participant/appointment review. This is not a prescribed government ID requirement.
3. Confirm the staff review and choose **Confirm review and continue to acknowledgment**.
4. Expected: `PENDING`, acknowledgment required, no handover recorded. Reloading the page retrieves that same claim.
5. Ask the participant to sign with mouse/touch/stylus or use the existing typed acknowledgment option. Confirm it was made in your presence and submit.
6. Expected: `VERIFIED — awaiting release`. Open **Releases & receipts**.

Do not enter full ID numbers, passwords, OTPs or raw QR credentials into manual-review notes. If the approved basis or evidence is missing, pause and contact the responsible office rather than inventing requirements.

## End every physical-assistance transaction

1. Open the exact verified claim in **Releases & receipts → Mark released**.
2. Rehearse giving the configured **1 demo pack**. Record quantity **1**, the applicable evidence type, `TEST-LOG-01 / page 1 / row 1`, and acknowledgment after the handover.
3. Choose **Mark assistance released**. Expected: `CLAIMED`, recorded package/quantity, releasing staff and time. A receipt is now available.
4. Choose **Issue receipt**, review and print/save it. Expected: **Completed — released and receipted**.
5. Reopen the receipt: its original reference and evidence remain unchanged. Repeated clicks must not create another handover or receipt.

The scripted preparation does not complete these steps for you. Simulated wallet credits remain a separate DSWD workflow; no real money is transferred. Admin reconciles and closes the overall event separately after all outcomes and concerns are resolved.

## Validation scope

Automated tests use mocked providers and do not send messages. They cover method permissions, scope, missing evidence, acknowledgment gates, duplicate requests, release/receipt eligibility, strict-rule compatibility, saved-state recovery and camera constraints. Browser QA decodes a real backend-issued QR from the rendered PDF and exercises the manual review/acknowledgment interface with mocked APIs. Actual Gsou camera focus, physical paper/screen scanning, real face matching, spoof resistance and printer output require a supervised hardware rehearsal.
