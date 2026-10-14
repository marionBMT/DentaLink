import axios from "axios";
import { endSession, getSession } from "../utils/session";

// Set VITE_API_URL in client/.env for any environment other than local dev.
const api = axios.create({
    baseURL: 'https://dentalink-backend-34zx.onrender.com/api',
    withCredentials: true
});

// The JWT is an httpOnly cookie. Mutating cookie-authenticated requests also
// carry the matching double-submit CSRF token.
api.interceptors.request.use((config) => {
  const method = (config.method || "get").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrfToken = getSession().csrfToken;
    if (csrfToken) config.headers["X-CSRF-Token"] = csrfToken;
  }
  return config;
});

// Response interceptor: one place that reacts to "your session is over".
// The server marks every such response with `forceLogout: true`:
//   401  token missing/expired/invalid/revoked, password changed, user deleted
//   403  account archived mid-session
// Wrong-password / wrong-OTP responses are 401/400 WITHOUT the flag, so they
// still reach the form that made the request.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const data = error.response?.data;
    if (data?.forceLogout && !error.config?.skipForceLogout) {
      endSession({
        message: data.message || "Your session has ended. Please log in again.",
        type: "warning",
      });
    }
    return Promise.reject(error);
  },
);

// Turns any Axios/network error into a message that is safe to show a user.
export function errorMessage(
  err,
  fallback = "Something went wrong. Please try again.",
) {
  if (err.response?.data?.message) return err.response.data.message;
  if (err.response?.status === 429)
    return "Too many requests. Please wait a moment and try again.";
  if (!err.response)
    return "Cannot reach the server. Check your connection and try again.";
  return fallback;
}

export default api;
