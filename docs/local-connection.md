# Local frontend and API connection

Run the API from `garantiyaid-backend` with `npm run dev`. Wait for
`GarantiyAid API listening on port 4000.` Start the frontend separately from
`garantiyaid-frontend` with `npm run dev`, then open
`http://localhost:5173/login`.

Leave `VITE_API_URL` unset or blank for local development. The browser requests
`/api/v1` and `/socket.io` from the frontend's own address; Vite forwards them to
`http://127.0.0.1:4000`. The API's authentication and origin checks remain active.
Vite now stops if port 5173 is occupied instead of silently choosing another port.
Use the already-running frontend or stop its terminal before starting another.

Docker's Redis and biometric containers do not replace the Node API process.
Both the frontend and API terminals must remain running.

After changing connection settings, restart the frontend if necessary and use
Ctrl+Shift+R in the browser. If the API is stopped, the local proxy returns
HTTP 503 with a message identifying the unavailable API. An invalid-credentials
response means the request reached the login service; it is a separate issue.

The login page checks `/api/v1/health` before enabling sign-in. While the API is
starting, it shows a connection message and checks again every three seconds.
Each check has a five-second timeout. Once connected, polling stops and the
user can submit the form. A connection failure during submission starts health
checks again; the application never automatically resubmits a password.

Quick connection check: open `http://localhost:5173/api/v1/health`. A JSON response
with `service: garantiyaid-backend` and `status: ok` verifies the proxy and API
process, but does not by itself prove database or account authentication health.

For a deployed production build, set `VITE_API_URL` to the deployed HTTPS API
address including `/api/v1`, and configure that API's explicit trusted frontend
origin. The local development proxy is not included in the built static files.
