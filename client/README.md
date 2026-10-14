# DentaLink client

This directory contains the React/Vite single-page application for DentaLink. It provides public registration, two-step OTP login, password recovery, patient booking, profile management, and the administrator dashboard.

For the complete system documentation, API list, status flow, data model, and server setup, see the root `README.md`.

## Stack

- React 19
- Vite 8
- React Router 7
- Axios
- Bootstrap 5
- ESLint 10

## Setup

```powershell
Set-Location C:\path\to\DentaLink\client
npm install
Copy-Item .env.example .env
npm run dev
```

The default application URL is `http://localhost:5173`.

## Configuration

```dotenv
VITE_API_URL=http://localhost:5000/api
```

If `VITE_API_URL` is not set, `src/api/axiosClient.js` uses the same local URL by default. Vite variables are embedded at build time, so set the production API URL before running `npm run build`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite development mode. |
| `npm run build` | Build the production client into `dist/`. |
| `npm run lint` | Run ESLint. |
| `npm run preview` | Preview the production build. |

## Source structure

```text
src/
├── api/
│   └── axiosClient.js       API base URL, bearer token, force-logout interceptor
├── components/
│   ├── ConfirmModal.jsx     Busy/error states and optional typed confirmation
│   ├── FlashMessage.jsx     One-shot cross-page message
│   ├── NotFound.jsx         404 page
│   └── RouteGuards.jsx      Guest and protected role-aware routes
├── pages/
│   ├── AdminDashboard.jsx
│   ├── ForgotPassword.jsx
│   ├── Login.jsx
│   ├── PatientDashboard.jsx
│   ├── Profile.jsx
│   ├── Register.jsx
│   └── Services.jsx
├── utils/
│   ├── session.js           Session and flash-message helpers
│   └── validation.js        Rules mirrored from the server constants
├── App.jsx                  Navigation, routes, logout flow, global flash banner
└── main.jsx                 React entry point
```

## Client behavior

- The request interceptor adds `Authorization: Bearer <token>`.
- A response containing `forceLogout: true` clears the session and redirects to login with a flash message.
- `errorMessage()` converts server, rate-limit, and network failures into safe user-facing text.
- `ProtectedRoute` enforces the expected role in the UI; the server remains the authorization authority.
- Permanent deletes use typed confirmation and display server failures inside the open modal.

## Validation

Before committing client changes, run:

```powershell
npm run lint
npm test
npm run build
npm audit
```

As of October 14, 2026, unit tests, build, and audit pass. Lint has no errors and eight consciously downgraded `react-hooks/set-state-in-effect` warnings for initial load/page-reset effects.

## Manual test checklist

- [ ] Register, request a login OTP, verify it, and log out.
- [ ] Complete forgot-password recovery.
- [ ] Edit the profile, change the password, and test account deletion confirmation.
- [ ] Book and cancel as a patient, with and without a proof file.
- [ ] Approve, reject, counter, archive, restore, and delete as an admin.
- [ ] Capture real screenshots for the root README after the flows pass.
