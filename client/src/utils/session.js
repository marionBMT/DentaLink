// The signed JWT lives only in an httpOnly cookie and is never exposed here.
// sessionStorage contains non-secret UI metadata plus the double-submit CSRF
// token. The server remains the authority and App.jsx rehydrates on refresh.

const KEYS = ["authenticated", "role", "name", "userId", "csrfToken"];
const FLASH_KEY = "dentalink_flash";

export function getSession() {
  return {
    authenticated: sessionStorage.getItem("authenticated") === "true",
    role: sessionStorage.getItem("role"),
    name: sessionStorage.getItem("name"),
    userId: sessionStorage.getItem("userId"),
    csrfToken: sessionStorage.getItem("csrfToken"),
  };
}

// Reads the user id carried by the signed JWT so the UI can identify the
// current account. This is display logic only; the server still authorizes
// every operation independently.
export function getCurrentUserId() {
  return getSession().userId || null;
}

export function saveSession({ role, name, userId, csrfToken }) {
  sessionStorage.setItem("authenticated", "true");
  sessionStorage.setItem("role", role);
  sessionStorage.setItem("name", name);
  sessionStorage.setItem("userId", userId);
  sessionStorage.setItem("csrfToken", csrfToken);
  window.dispatchEvent(new Event("dentalink-session"));
}

export function updateSessionName(name) {
  sessionStorage.setItem("name", name);
  window.dispatchEvent(new Event("dentalink-session"));
}

export function clearSession() {
  KEYS.forEach((k) => sessionStorage.removeItem(k));
  window.dispatchEvent(new Event("dentalink-session"));
}

// One-shot message shown on the next page (survives a full page redirect).
// Replaces alert() so the user sees a normal in-page banner instead.
export function setFlash(type, text) {
  sessionStorage.setItem(FLASH_KEY, JSON.stringify({ type, text }));
}

// Reading does not delete it: React StrictMode runs state initialisers twice
// in development, which would otherwise swallow the message. Call
// clearFlash() from an effect once it has been shown.
export function peekFlash() {
  try {
    return JSON.parse(sessionStorage.getItem(FLASH_KEY));
  } catch {
    return null;
  }
}

export function clearFlash() {
  sessionStorage.removeItem(FLASH_KEY);
}

// Ends the session locally and goes to the login page (full reload so every
// piece of in-memory state is dropped). Optionally leaves a message behind.
export function endSession({ message, type = "info", to = "/login" } = {}) {
  clearSession();
  if (message) setFlash(type, message);
  window.location.href = to;
}
