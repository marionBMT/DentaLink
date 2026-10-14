const crypto = require("crypto");

const AUTH_COOKIE = "dentalink_session";
const CSRF_COOKIE = "dentalink_csrf";

function parseCookies(req) {
  if (req.cookies) return req.cookies;
  const cookies = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  req.cookies = cookies;
  return cookies;
}

function cookieOptions({ httpOnly = false } = {}) {
  const production = process.env.NODE_ENV === "production";
  const sameSite = (process.env.COOKIE_SAME_SITE || "lax").toLowerCase();
  const secure = production || process.env.COOKIE_SECURE === "true";
  if (sameSite === "none" && !secure) {
    throw new Error("COOKIE_SAME_SITE=none requires Secure cookies.");
  }
  return { httpOnly, secure, sameSite, path: "/" };
}

function appendCookie(res, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path || "/"}`];
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  res.append("Set-Cookie", parts.join("; "));
}

function setAuthCookie(res, token) {
  appendCookie(res, AUTH_COOKIE, token, cookieOptions({ httpOnly: true }));
}

function issueCsrfToken(res) {
  const token = crypto.randomBytes(32).toString("base64url");
  appendCookie(res, CSRF_COOKIE, token, cookieOptions());
  return token;
}

function clearSessionCookies(res) {
  appendCookie(res, AUTH_COOKIE, "", {
    ...cookieOptions({ httpOnly: true }),
    maxAge: 0,
  });
  appendCookie(res, CSRF_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}

function readAuthToken(req) {
  const header = req.headers.authorization || "";
  const [scheme, bearer] = header.split(" ");
  if (scheme === "Bearer" && bearer) return { token: bearer, source: "bearer" };
  const token = parseCookies(req)[AUTH_COOKIE];
  return token ? { token, source: "cookie" } : { token: null, source: null };
}

function safeEqual(a, b) {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

// Double-submit CSRF protection. Bearer-token clients are not vulnerable to
// ambient-cookie CSRF, so only requests authenticated by the browser cookie
// need the cookie/header comparison.
function requireCsrf(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.headers.authorization?.startsWith("Bearer ")) return next();

  const cookies = parseCookies(req);
  if (!cookies[AUTH_COOKIE]) return next();

  const header = req.headers["x-csrf-token"];
  if (!safeEqual(cookies[CSRF_COOKIE], header)) {
    return res.status(403).json({ message: "Invalid or missing CSRF token." });
  }
  next();
}

module.exports = {
  AUTH_COOKIE,
  CSRF_COOKIE,
  parseCookies,
  setAuthCookie,
  issueCsrfToken,
  clearSessionCookies,
  readAuthToken,
  requireCsrf,
  cookieOptions,
};