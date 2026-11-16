# Location, enrollment and distribution verification

## Location model

The hierarchy is **City → Barangay → Sitio / Purok**. A Purok remains labeled as a Purok; the app does not rename it to a Barangay or assume it is the same kind of area as a Sitio.

- City is stored on the existing Barangay record.
- A Barangay owns a confirmed `serviceAreas` list. The parent Barangay ID and area name identify a selection; identical area names in different Barangays are independent.
- Beneficiaries retain their existing `barangayId` and nullable `sitioPurok` text. Unconfirmed text is preserved and marked **Location needs review** in the record list and details. **Not recorded** means no Sitio/Purok has been supplied.
- Admin maintains the list after checking local records. Importing a beneficiary does not automatically confirm a new area. Renaming/removing an area requires reviewing affected beneficiary text; records and old session coverage are retained.

Migration: `garantiyaid-backend/prisma/migrations/20261116103000_barangay_service_areas/migration.sql` adds `barangays.service_areas TEXT[] NOT NULL DEFAULT '{}'`. It does not overwrite City, Barangay assignments, beneficiary addresses or Sitio/Purok text. This migration has been applied locally. For another checkout/database, run `npx.cmd prisma migrate deploy` and `npx.cmd prisma generate` from the backend, then restart that API.

A separate City table or Sitio entity is unnecessary for the current forms and exact area-name scheduling. Use a separate entity if the platform later needs stable area IDs across renames, area-specific permissions or additional area metadata. Existing names must still be reviewed before that migration.

## Findings and changes

Already working: authenticated role scope, duplicate-person protections, one enrollment per beneficiary/program, document acceptance before approval, independent review, event-specific allocation/schedule/claim IDs, separate release and receipt, and case-insensitive Sitio/Purok coverage matching.

Confirmed gaps addressed:

1. There was no confirmed area registry. Free-text areas could be reused under a different parent. The new picker scopes choices to the Barangay and requires review of an existing child when City or Barangay changes. Admin City options come from registry records. The Barangay master form can add a City when registering an actual new location.
2. Beneficiary import had no separate City cross-check. A City column now disambiguates repeated Barangay names; conflicting City/Barangay values block import. Unlisted Sitio/Purok text produces a nonblocking review warning and is preserved. Existing files without City or Sitio remain supported.
3. Enrollment progress searched by surname before filtering a paginated response. It now requests the exact beneficiary ID from the API. The backend still applies role/Barangay scope.
4. Event labels did not show the actual service Barangay, allowing an arbitrary event title to look like its location. Choices now show title, date, Barangay and City, filtered by the selected program and beneficiary's Barangay IDs.
5. Event progress now verifies returned event IDs and only renders records belonging to the current beneficiary/event context. Changing selection clears progress; late previous responses are ignored.
6. The facilitator form previously preferred the login session's Barangay summary over the loaded registry. It now uses current registry data first, so the confirmed Sitio/Purok choices reflect that assigned Barangay.

CSV and Excel use the same mapping/review workflow. Updated downloadable templates contain City, Barangay and Sitio/Purok separately. The Barangay template accepts an optional **Sitios / Puroks** column with names separated by `|`. Confirm those names before importing. PDF is not a supported structured import format.

## Admin testing guide

Use synthetic people and locally confirmed location mappings. Do not send real notifications while rehearsing.

1. **Administration → Staff and barangays → Barangays → Edit**. In **Confirmed Sitios / Puroks**, enter one locally confirmed name per line, preserving labels such as `Sitio …` or `Purok …`. Click **Save changes**. Do this separately for each parent Barangay.
2. **Beneficiaries → Beneficiary records → Register beneficiary**. Select **City**, **Barangay**, then **Sitio / Purok**. Change the City/Barangay and verify the previous area requires review. Choose a confirmed area, retain it as unconfirmed text, or explicitly choose **Not recorded**. Complete **Review beneficiary details → Register beneficiary**.
3. For imports, use **Import beneficiaries → Match columns → Review beneficiaries**. Map City when present, verify the actual Barangay and area in the preview, resolve blocking issues, and review unconfirmed-area warnings before confirming. Re-importing the same people must not create duplicates. A record-only import is not a program approval.
4. Open the beneficiary, select **Active program**, upload its required documents using **Upload for review**, then **Submit enrollment**. In **Beneficiaries → Enrollment review**, use an authorized independent reviewer. Start review, review/accept the required documents, request correction if needed, and approve only when the existing checks pass. The submitter cannot approve their own case.
5. **Distributions → Distribution events → Create distribution event**. Select the same program, **City**, **Service barangay**, a valid future schedule and the appropriate verification method. The title is a name; the service location is determined by the selected Barangay and venue.
6. Follow **Sessions → Allocate → Schedule → Open**. For **Whole barangay**, eligible beneficiaries from that event's Barangay share the queue. For **By Sitio / Purok**, choose confirmed areas in **Covered Sitios / Puroks**. Missing areas require beneficiary correction; unconfirmed text requires checking the beneficiary and parent Barangay registry. Refresh the event after corrections. Whole Barangay can serve someone without a recorded Sitio.
7. Return to the beneficiary's **Assistance progress**. Click **Refresh progress**, choose **Program enrollment**, then **Distribution event**. Verify title/date/Barangay. An event appearing in the selector is only an available event; the **Event allocation** stage shows whether this person is assigned.
8. Create a second event under the same program at a non-overlapping future time. The existing approved enrollment can be selected for allocation again if the current program, beneficiary, location, coverage and budget rules allow it. Do not create another enrollment for the same beneficiary/program. The second event needs its own allocation, appointment and claim. Its initial progress must show no prior receipt.

## Barangay testing guide

1. Sign in with a Barangay Facilitator assigned by Admin. In **Beneficiary services → Beneficiaries**, City and Barangay are fixed to that assignment. Confirm that **Sitio / Purok** offers only its areas. An unassigned account must ask Admin for an assignment; it must not select its own scope.
2. Open the scheduled beneficiary in **Distribution day → Queue & schedules** and check the exact event. Continue in **QR verification** for a valid current credential, or use the event's other explicitly allowed identity method. Completing identity checks does not record a handover.
3. **Distribution day → Releases & receipts**: open the exact claim, record the actual assistance/evidence with **Mark released → Mark assistance released**, then **Issue receipt**. Reopen the receipt and confirm its original person, event and reference. Closing the whole event is a separate Admin reconciliation step.
4. In the beneficiary's **Assistance progress**, switch to the second event. It must show its own queue/checks/release/receipt. Switch programs or beneficiaries and check that the old person's receipt never appears.

## Automated verification

From `garantiyaid-backend`, run:

```powershell
node scripts/verify-integrated-workflow.js --locations
```

This uses the existing acceptance harness to start its own temporary PostgreSQL instance, apply migrations, authenticate synthetic Admin/DSWD/Barangay accounts and run real API/browser workflows. Email is disabled, SMS and face processing are simulated. It leaves a report and screenshots in `output/location-workflow`, then removes only its own temporary database/files. It does not use the operational database or send actual notifications.

Additional targeted checks: backend `test/location-hierarchy.test.js`, existing beneficiary/import/enrollment/slot suites; frontend `test/locations.test.js`, `beneficiary-journey.test.js`, `beneficiary-import.test.js` and `import-templates.test.js`. The report records successful scenarios and any failure rather than treating an incomplete run as passed.

Verified on November 16, 2026: **25 integrated API/browser scenarios, 64 targeted backend tests and all 311 frontend tests passed**. The beneficiary form browser regression also passed registration, editing, failed-save retention, role payloads and responsive keyboard focus. The standalone session planner passed coverage matching, capacity calculations, keyboard interaction, duplicate-submit protection, retry recovery and 320–1440px layouts. Frontend lint and compilation passed; the existing large-bundle warning remains. Production URL validation was tested with a placeholder HTTPS API URL for compilation only; this was not a deployment.

Local data check: 10 Barangays currently have no confirmed area list; all 10 beneficiary records retain their existing nonempty Sitio/Purok text and therefore need location review before area-specific planning. No operational beneficiary, enrollment, event, claim or receipt was reset or created by the acceptance checks. The local API was restarted after migration and its health endpoint responded.

Physical QR scanning, a real face processor, printer output, real SMS delivery and mobile integration are outside these mocked workflow checks. Official Sitio/Purok mapping remains a staff review task.
