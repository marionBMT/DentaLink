# DentaLink: Next Steps for Developers

Status updated October 14, 2026. Items are ordered by priority.

## 0. Verification

- [x] `cd server && npm test` — October 14, 2026: **32 passed, 1 skipped**. With `RUN_CLOUDINARY=1`, **33 passed** and none were skipped.
- [x] `cd client && npm test && npm run lint && npm run build` — October 14, 2026: 4 unit tests pass; build passes; lint has **0 errors and 8 warnings**, all from the consciously downgraded `react-hooks/set-state-in-effect` rule for initial data-loading/page-reset effects.
- [x] `npm audit` — October 14, 2026: 0 vulnerabilities in both projects.
- [x] `npm run check-data` — October 14, 2026: all checks pass, including protected proof metadata and the atomic one-blocking-request rule.
- [x] `npm run smoke:external` — real email and authenticated Cloudinary upload/download/delete pass.
- [ ] Click through the whole app in a browser. None of the client changes have been run in a browser.
  - Register, then log in (OTP), then log out.
  - Forgot password.
  - Profile: edit, change password, delete account.
  - Patient booking and cancellation, with and without a file.
  - Admin: approve, reject, counter-offer, archive, restore, delete.

## 1. Client wiring that is DONE (review, don't redo)

- `src/api/axiosClient.js`: API URL from `VITE_API_URL`; one interceptor logs out on any response with `forceLogout: true` and shows a banner (no more `alert()`); `errorMessage()` helper.
- `src/utils/session.js` (session + one-shot flash messages), `src/utils/validation.js` (rules mirroring `server/utils/constants.js`).
- `src/components/`: `RouteGuards.jsx` (`ProtectedRoute`, `GuestRoute`), `FlashMessage.jsx`, `ConfirmModal.jsx` (typed confirmation, busy state, in-modal errors), `NotFound.jsx`.
- `App.jsx`: guarded routes, 404, flash banner, real logout (`POST /auth/logout`), navbar refreshes after a profile edit.
- `Login.jsx` (cooldown 429 jumps to the OTP step, resend button), `Register.jsx`, `ForgotPassword.jsx` (sends `otp` to reset-password), `Profile.jsx` (change password, delete account with typed username + password).
- `Services.jsx`: shared contact validation, load errors shown.

## 2. Client wiring completed

The dashboard pages now show server/network failures, protect requests with busy states, and use the shared session/validation/modal helpers.

- [x] **`AdminDashboard.jsx`**
  - Show server errors for `handleAction`, `submitReject`, `submitKeep`, `submitCounter`, `loadAppointments`, `loadUsers` (add an `actionError` banner using `errorMessage` from `api/axiosClient`).
  - `executeModalAction`: keep the confirm modal OPEN on failure and show the message inside it; add a busy state. Replace the six inline `setItemToProcess(...); setShowConfirmModal(true)` calls with one `openConfirm()` helper that also clears `archiveError`.
  - Permanent delete: use `ConfirmModal` with `requireText="DELETE"` (the server already forces archive-first).
  - Replace the duplicated validation (`validateForm`, `passwordRegex`, `contactRegex`, which also causes 6 lint errors) with `validateAccountFields`, `isEmailOrPhone`, `CONTACT_MESSAGE` from `utils/validation.js`.
  - Hide the Archive button for the current admin; remove the hard-coded `marionbusinezz@gmail.com` check (the server already blocks self-archive and archiving the last active admin).
  - Handle 409 from approve (the client-side `conflictError` modal only covers conflicts it can see locally; the server is the source of truth).
- [x] **`PatientDashboard.jsx`**
  - Show server errors for `handleAcceptOffer` (409 "offered slot just taken"), `handleDirectCancel`, `submitPatientAction`, `loadAppointments` (all currently `console.error` only).
  - Add busy states to submit/accept/cancel buttons.
  - Replace `window` reload/other raw `localStorage` use with `utils/session.js` where applicable.
- [x] Use `errorMessage()` instead of `err.response?.data?.message || ...` in client error paths.
- [x] Add `client/.env.example` with `VITE_API_URL=http://localhost:5000/api`.
- [x] Consciously downgrade `react-hooks/set-state-in-effect` to a warning in `eslint.config.js`; no lint errors remain.

## 3. Server: environment and deployment

- [x] Create `server/.env.example` listing required and optional configuration without secret values.
- [x] Confirm real `.env` files are ignored and untracked. Rotate any secret that has ever been pasted into a chat, ticket or log.
- [ ] Production: set `NODE_ENV=production` (hides internal error details), `CLIENT_URL` to the real front-end origin, serve everything over HTTPS, set `TRUST_PROXY` if behind a proxy.
- [x] `server/seed.js` now requires validated `SEED_ADMIN_*` environment variables and has no built-in password.

## 4. Database steps (run in this order)

1. [x] `npm run check-data` re-run October 14, 2026. The obsolete development appointment referencing a nonexistent service was backed up and removed; **all checks now pass**.
2. [ ] Start the server once so MongoDB builds the new indexes: `one_confirmed_per_dentist_slot`, `no_duplicate_pending_request` (Appointment); `username_ci_unique` (User); the TTL index on `RevokedToken`. If an index build fails, `check-data` will say which records conflict.
3. [ ] Old appointments without a `dentistName` still work (field is optional in the schema). Decide whether to backfill them.
4. [ ] Emails are now stored lower-case. `check-data` reported none with capitals in the dev DB. Re-run it on any other environment before deploying.

## 5. Disposition of the 11 hardening findings

- [x] **Switch the dashboards to server-side pagination.**
  - Admin active users, active appointments, archived users, and archived appointments use independent API pages.
  - Patient appointment history uses API pages and `X-Has-Pending` preserves the booking-form pending guard across all pages.
  - Admin appointment search supports patient name/email, service, and dentist through the API.
- [x] **1 — Browser token storage:** JWT moved from `localStorage` to an httpOnly cookie. CORS credentials and double-submit CSRF protection are implemented; browser code stores only non-secret session metadata and the CSRF token in `sessionStorage`.
- [x] **2 — Proof privacy:** new proofs use authenticated Cloudinary storage and 60-second signed URLs. Nine legacy records were migrated/backfilled on October 14, including one historical DOCX stored as authenticated `raw`. The seven legacy origins are deleted; CDN invalidation was requested.
- [x] **3 — Database inconsistency:** the obsolete development appointment was backed up and removed; all data checks pass.
- [ ] **4 — Manual browser coverage:** still requires a human click-through because this workspace has no configured browser automation. Use the checklist in section 0.
- [~] **5 — Client automation:** zero-dependency unit tests now cover shared client validation and run with `npm test`. React component/browser E2E coverage still requires intentionally adopting a test framework.
- [x] **6 — Different-request race:** `one_blocking_request_per_patient` is a partial unique MongoDB index and the integration suite races two different slots to verify only one is created.
- [~] **7 — Lockout abuse:** the API-wide/auth IP limiter constrains one source, administrators have an audited unlock endpoint and UI action, and successful login clears the lock. Distributed intentional relocking cannot be eliminated completely without a risk/CAPTCHA service.
- [x] **8 — OTP abuse:** a 30-second resend cooldown and persistent per-account cap of 10 issues per rolling 24 hours are enforced and blocked issuance is audited.
- [x] **9 — Weak production configuration:** production startup fails for missing required variables, a JWT secret under 32 characters, or non-HTTPS client origins.
- [x] **10 — External integrations:** the external smoke test validates real email plus authenticated Cloudinary upload, signed retrieval and deletion; the opt-in integration test covers the application upload/delete route.
- [~] **11 — Operations:** durable audit events, admin audit listing, structured JSON request/error logs, request IDs, graceful shutdown, liveness and DB-backed readiness are implemented. A deployed log/error-monitoring provider and formal backup/restore drill remain environment/operator work.
- [x] Run `npm audit` regularly. October 14, 2026 result: 0 vulnerabilities in server and client. (`multer-storage-cloudinary` was removed because it pinned a vulnerable `cloudinary` 1.x.)
- [ ] Have someone other than the author review `routes/auth.js`, `routes/appointments.js` and `middleware/authMiddleware.js`.

## 6. Documentation (weakest rubric item, 5 points)

- [x] Root `README.md`: application summary, features, tech stack, setup, env table, scripts, API endpoints, tests, project-brief checklist, and screenshot placeholders. Real screenshots remain pending browser verification.
- [x] Replace the Vite-template `client/README.md`.
- [x] Document the appointment status flow from `PATIENT_TRANSITIONS` / `ADMIN_TRANSITIONS`.
- [x] Add Mermaid ER and appointment-flow diagrams for the presentation.

## 7. Behaviour changes to be aware of (already in the code)

- Bad, expired, revoked or password-invalidated tokens now return **401 with `forceLogout: true`** (previously 403 without the flag). Archived accounts still return 403 + `forceLogout`.
- Forgot-password answers identically for unknown emails; reset-password requires the OTP.
- Login OTP and reset OTP are separate, single-use, hashed, expire in 10 minutes, burn after 5 wrong tries, and cannot be re-requested within 30 seconds.
- Accounts lock for 15 minutes after 5 wrong passwords.
- Admins cannot delete active records: archive first. They cannot archive or delete themselves or the last active admin. Deleting a user also deletes their appointments and uploaded files.
- A service with live appointments cannot be deleted; renaming it updates its appointments; a dentist with live appointments cannot be removed.
- Usernames are case-insensitive; emails are lower-cased.
- `npm run check-data` (read-only DB health check) and `npm run smoke:external` (sends one email to `EMAIL_USER`, uploads and deletes one test image) are available.
