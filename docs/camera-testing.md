# USB webcam: QR and face verification

Use local practice records and a consenting participant. A camera preview or a
decoded QR does not prove that a credential is valid or that identity was verified.

## Before the rehearsal

- Run the frontend, backend and configured biometric service. Use HTTPS or
  localhost for camera access. A plain HTTP address on another computer's LAN
  may not provide browser camera access.
- Connect the USB webcam. Allow browser and Windows camera permissions. Close
  Camera, Teams, OBS or another app if it is holding the webcam.
- Use a beneficiary scheduled in an **open** event within the staff member's
  authorized barangay. Use a current QR card generated for that exact event.
- Check the event's required identity method. `QR_AND_BIOMETRIC` requires both;
  `QR_OR_BIOMETRIC` requires either. Do not change an open event to bypass a check.
- For face verification, the assigned Barangay Facilitator must first record
  active consent and save a reference face profile. Wait for it to be cleared
  for claims. A duplicate-review hold requires the authorized independent review.
- The backend must report the real remote processor for a live face-match
  demonstration. Simulated processing is a software test, not face-recognition proof.

## If no QR card is available

Opening an event does not generate its cards. In **Beneficiary QR cards**, check
the ready count. An appointment that has already ended is no longer eligible.

1. For a fresh rehearsal, create a distribution with a future date or a later
   time today. Choose **QR code only** to test scanning without a face requirement.
2. Complete **Sessions → Allocate → Schedule → Open** for the practice beneficiary.
3. Select **Generate remaining QR credentials**. The QR images appear in the
   save-and-print window. Choose **Download PDF** before closing it.
4. Use that saved card in the camera checklist below. A beneficiary ID or claim
   reference is not a QR credential. An expired appointment cannot be revived by
   replacing its card; create a correctly scheduled practice event instead.

## QR camera checklist

1. As the assigned Barangay Facilitator, open **Distribution day → QR verification**
   and select the correct event. Select **Scan with this device's camera**.
2. Choose the browser-reported USB camera name. Check the **Using:** line and
   preview; the browser may report a generic USB name rather than the product brand.
3. Hold the whole printed QR or phone QR in view, without glare. Adjust distance
   slowly until it is readable. Try both a printed card and a phone display.
4. A successful read must stop the camera and open the beneficiary review once.
   Check the person's name, queue and event. **No check-in is recorded yet.**
5. Choose **Confirm check-in** only after the review. For a combined event,
   continue to biometric verification. Confirmation does not record a handover.
6. Try an expired, used or different-event credential. The server must reject it
   without recording another claim. Do not share the full credential in screenshots.

## Face camera checklist

1. Open **Biometric identity → Claim verification**, using an authorized DSWD
   Staff or assigned Barangay Facilitator account. Select the exact open event
   and scheduled participant. Enrollment is a separate tab and separate action.
2. Choose the USB camera and select **Start live camera**. Expect **Starting
   camera** first, followed by **Camera ready** when video frames arrive.
3. Position one participant in good light. The oval is an alignment guide;
   it is not proof that a face has been detected or matched.
4. Select **Capture live photo**. Check the still image. The camera must stop,
   and the page must say that the photo has not yet been verified.
5. Select **Retake live photo** and confirm that the old photo is cleared.
   Capture again, then choose **Verify beneficiary identity**.
6. Wait for the actual backend result. Missing consent/profile, duplicate hold,
   no match, liveness failure and service outage must not appear as success.
   If the service is unavailable, the photo should remain available for retry.
7. Uploading a photo must show **Uploaded photo**, rather than a live-capture
   label. It is still subject to the backend's checks and proves no liveness by itself.

## Device recovery and keyboard checks

- Deny camera permission once. Verify the recovery message, allow access in
  browser settings, and retry.
- Unplug the active USB webcam during preview. Scanning must stop and show a
  disconnected message. Reconnect and retry, or choose another available camera.
- Switch cameras while one is starting. Only the latest selected camera may
  remain active. **Stop camera**, closing, and navigation must release the webcam.
- Close the QR dialog with Escape while permission or decoding is pending.
  No late result should open a review. Focus should return to the camera button.
- Test a narrow browser window and landscape view. Camera controls and Close
  must remain reachable by keyboard and scrolling.

## Finish the transaction separately

After all required identity checks pass, the assigned facilitator records the
actual practice handover in **Releases & receipts**, including quantity,
applicable evidence and acknowledgment. Issue and reopen the receipt afterward.
QR scanning and face matching must never perform those release actions automatically.

## Automated checks

From `garantiyaid-frontend`:

```powershell
node --test test/camera-lifecycle.test.js test/biometric-camera.test.js test/qr-workflow.test.js test/biometric-follow-up.test.js test/claim-workflow.test.js
node scripts/verify-camera-workflows.mjs
npm.cmd run lint
```

The browser harness uses synthetic camera streams, mock API results and a generated
QR image. Its screenshots go to `output/camera-workflows` at the workspace root.
It cannot enroll real beneficiaries, release assistance or send notifications.
Passing automation does not establish physical webcam quality, real matching
accuracy or anti-spoofing performance; record those hands-on results separately.
