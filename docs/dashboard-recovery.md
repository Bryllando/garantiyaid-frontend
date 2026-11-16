**Dashboard request limits and recovery**

The “Too many requests” message is an HTTP 429 response. The current general API budget is 300 requests per 15-minute window for each signed staff identity. The displayed wait is the remaining time until that window resets; separate protections still apply to login, biometric checks and notification actions.

A repeated live-update stream could exhaust that budget during ordinary viewing. Each metrics event reloaded the summary, draft events and two enrollment lists, while staff notifications also fetched their inbox. A short debounce combined events arriving together but did not bound a continuous stream. React development mounting could also issue identical reads simultaneously.

**Implemented behavior**

- Automatic overview, monitoring, queue, claim, notification and event-review refreshes share a small scheduler. It groups sustained updates in 20-second intervals, defers to the server cooldown and pauses automatic reads while the page is hidden. Explicit record actions still use their existing APIs and confirmation rules.
- Identical in-flight JSON GET requests from the same token/path/headers share one response. Completed results are not cached; a later refresh fetches current data. Caller-controlled abort signals remain independent. Writes are never shared or automatically replayed by this change.
- The dashboard shows a live countdown from the server-provided `Retry-After` value, disables refresh during the pause and makes a fresh dashboard read when it expires. Admin, DSWD and Barangay use the same recovery behavior.
- If figures have already loaded, they remain visible with their existing update timestamp and a pause notice. The interface does not present an old snapshot as a newly loaded result.
- A connection failure has a separate message and a manual **Try again** action. Navigation, authentication and role restrictions remain in place.
- Background import status checks run every 10 seconds, pause when hidden and honor the actual retry delay. Import processing continues on the server while display updates are paused.

The server limits were not increased or disabled. Heavy manual traffic or several active windows sharing an account can still legitimately reach the quota. A current server cooldown must expire; signing out and signing back in does not create a different staff identity. Remote changes may take up to one automatic refresh interval to appear, plus the response time; **Refresh records** checks immediately when the API is available.

**Verification**

The controlled browser reproduction sent 85 rounds of paired dashboard/inbox events. Before the fix it made 301 authenticated reads and hit the 300-request limit. After the fix the same reproduction made 25 reads with no limit response. The test uses mocked application APIs and controlled events, not real beneficiary records or a production load test.

The browser checks also cover:

- All three staff roles waiting through the full server delay and recovering automatically.
- No HTTP retries before the cooldown expires.
- Previously loaded figures remaining visible during a later 429.
- Failed connection → restored connection → manual retry.
- 320, 390 and 1440 pixel layouts and zero state-changing requests.

Commands:

```powershell
npm.cmd test
npm.cmd run lint
node scripts/verify-dashboard-recovery.mjs
node scripts/verify-barangay-queue.mjs
node scripts/verify-claim-alternatives.mjs
node scripts/verify-dswd-monitoring.mjs
```

The frontend suite passed 295 tests. Backend API-limit tests passed all three checks for identity isolation, invalid credentials and login throttling. Queue/QR, manual claim/release/receipt and DSWD monitoring browser regressions passed with mocked APIs. A frontend build also passed using a temporary placeholder HTTPS API URL, without deployment.

Screenshots and request counts are saved under `../../output/dashboard-recovery/`. No real SMS/email was sent, no live claims were changed and no persistent application server was started by these checks.

**During a rehearsal**

1. Keep one backend terminal and one frontend terminal running. Load the updated frontend in the browser.
2. Use separate role accounts for Admin, DSWD and Barangay. Keep only the tabs needed for the demonstration active.
3. If a 429 appears, leave the dashboard open for its countdown. If a connection error appears, restore the API/network connection and use **Try again**.
4. Review the displayed update time before relying on figures. A verified identity, recorded release, issued receipt and accepted SMS remain separate workflow results.

Real deployment load, physical scanners/cameras and notification arrival were not measured by this change.
