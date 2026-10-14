const rateLimit = require("express-rate-limit");

const make = (windowMs, limit, message) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message },
  });

// Whole API: generous ceiling against scraping / accidental loops
const apiLimiter = make(
  15 * 60 * 1000,
  Number(process.env.API_RATE_LIMIT) || 600,
  "Too many requests. Please try again later.",
);

// Login, OTP, register, password reset: strict (brute-force / email-bombing).
// The env override exists only so automated tests can make many auth calls.
const authLimiter = make(
  15 * 60 * 1000,
  Number(process.env.AUTH_RATE_LIMIT) || 30,
  "Too many attempts. Please try again in 15 minutes.",
);

module.exports = { apiLimiter, authLimiter };
