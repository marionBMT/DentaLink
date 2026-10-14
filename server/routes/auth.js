const router = require("express").Router();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const RevokedToken = require("../models/RevokedToken");
const { verifyToken } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const v = require("../validators/authValidators");
const { sendMail, sendMailSafe } = require("../utils/mailer");
const { generateOtp, hashOtp, otpMatches } = require("../utils/otp");
const {
  setAuthCookie,
  issueCsrfToken,
  clearSessionCookies,
} = require("../utils/sessionCookies");
const {
  BCRYPT_ROUNDS,
  OTP_TTL_MS,
  OTP_RESEND_MS,
  OTP_MAX_ATTEMPTS,
  OTP_ISSUE_WINDOW_MS,
  OTP_MAX_ISSUES_PER_WINDOW,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_LOCK_MS,
} = require("../utils/constants");
const audit = require("../utils/audit");
const { isDevelopmentOtpEnabled } = require("../utils/developmentOtp");

// Compared against when the account does not exist so that response time does
// not reveal whether a username/email is registered.
const DUMMY_HASH = bcrypt.hashSync("dentalink-dummy-password", BCRYPT_ROUNDS);

const OTP_FIELDS = "+otp +otpExpires +otpPurpose +otpAttempts";

// True if a code was issued to this account less than OTP_RESEND_MS ago.
// (Issue time is derived from the expiry, so no extra column is needed.)
const inResendCooldown = (user) =>
  Boolean(user.otpExpires) &&
  user.otpExpires.getTime() - OTP_TTL_MS > Date.now() - OTP_RESEND_MS;

async function issueOtp(user, purpose) {
  const now = Date.now();
  if (
    !user.otpWindowStart ||
    user.otpWindowStart.getTime() <= now - OTP_ISSUE_WINDOW_MS
  ) {
    user.otpWindowStart = new Date(now);
    user.otpIssueCount = 0;
  }
  if ((user.otpIssueCount || 0) >= OTP_MAX_ISSUES_PER_WINDOW) {
    const err = new Error("OTP issue limit reached");
    err.code = "OTP_ISSUE_LIMIT";
    throw err;
  }
  user.otpIssueCount = (user.otpIssueCount || 0) + 1;
  const code = generateOtp();
  user.otp = hashOtp(code);
  user.otpExpires = new Date(Date.now() + OTP_TTL_MS);
  user.otpPurpose = purpose;
  user.otpAttempts = 0;
  await user.save();
  return code;
}

function clearOtp(user) {
  user.otp = null;
  user.otpExpires = null;
  user.otpPurpose = null;
  user.otpAttempts = 0;
}

// Checks an OTP and enforces expiry + max attempts. Returns an error message
// string on failure, or null on success. Does NOT consume the OTP.
async function checkOtp(user, otp, purpose) {
  if (
    !user ||
    !user.otp ||
    user.otpPurpose !== purpose ||
    !user.otpExpires ||
    user.otpExpires < Date.now()
  ) {
    return "Invalid or expired OTP code.";
  }

  if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
    clearOtp(user);
    await user.save();
    return "Too many incorrect attempts. Please request a new code.";
  }

  if (!otpMatches(otp, user.otp)) {
    user.otpAttempts += 1;
    await user.save();
    return "Invalid or expired OTP code.";
  }

  return null;
}

// --- REGISTER ROUTE ---
router.post("/register", v.register, validate, async (req, res) => {
  const { username, name, email, password } = req.body;

  const [emailTaken, usernameTaken] = await Promise.all([
    User.exists({ email }),
    User.byUsername(username).select("_id").lean(),
  ]);
  if (emailTaken) {
    return res.status(400).json({
      message: "Email is already used. Please log in or use another email.",
    });
  }
  if (usernameTaken) {
    return res.status(400).json({ message: "Username is already taken." });
  }

  const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
  // role is never read from the request: public sign-ups are always patients
  const user = await User.create({
    username,
    name,
    email,
    password: hashedPassword,
    role: "patient",
  });

  res
    .status(201)
    .json({ message: "Account created successfully", userId: user._id });
});

// --- STEP 1: LOGIN (Check Password & Send OTP) ---
router.post("/login", v.login, validate, async (req, res) => {
  const { identifier, password } = req.body;

  const user = await User.byIdentifier(
    identifier,
    `+password +failedLoginAttempts +lockUntil +otpExpires +otpIssueCount +otpWindowStart`,
  );

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    return res.status(401).json({ message: "Invalid credentials." });
  }

  if (user.lockUntil && user.lockUntil > Date.now()) {
    const minutes = Math.ceil((user.lockUntil - Date.now()) / 60000);
    return res.status(429).json({
      message: `Too many failed attempts. Try again in ${minutes} minute(s).`,
    });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= LOGIN_MAX_ATTEMPTS) {
      user.lockUntil = new Date(Date.now() + LOGIN_LOCK_MS);
      user.failedLoginAttempts = 0;
    }
    await user.save();
    await audit(req, "auth.login.password_failed", {
      outcome: "failure",
      actor: user._id,
      targetType: "User",
      targetId: user._id,
    });
    return res.status(401).json({ message: "Invalid credentials." });
  }

  // Archived status is only revealed to someone who knows the password
  if (user.isArchived) {
    return res.status(403).json({
      message:
        "Your account has been archived. Please check your email or contact administration.",
    });
  }

  // Stops the login form from being used to flood someone's inbox
  if (inResendCooldown(user)) {
    // requireOtp lets the login form jump straight to the code-entry step:
    // the code that was just sent is still valid.
    return res.status(429).json({
      message:
        "A code was just sent to your email. Enter it below, or wait a few seconds to request a new one.",
      requireOtp: true,
    });
  }

  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  let code;
  try {
    code = await issueOtp(user, "login");
  } catch (err) {
    if (err.code !== "OTP_ISSUE_LIMIT") throw err;
    await audit(req, "auth.otp_issue_blocked", {
      outcome: "failure",
      actor: user._id,
      targetType: "User",
      targetId: user._id,
      metadata: { purpose: "login" },
    });
    return res.status(429).json({
      message: "Too many security codes were requested for this account. Try again later or contact an administrator.",
    });
  }

  if (!isDevelopmentOtpEnabled()) {
    try {
      await sendMail({
        to: user.email,
        subject: "DentaLink - Your Login Security Code",
        text: `Your 6-digit login code is: ${code}\n\nThis code will expire in 10 minutes.\nIf you did not try to log in, please change your password.`,
      });
    } catch (err) {
      console.error("OTP email failed:", err.message);
      clearOtp(user);
      await user.save();
      return res.status(502).json({
        message: "Could not send the verification email. Please try again.",
      });
    }
  }

  res.json({
    message: isDevelopmentOtpEnabled()
      ? "Development OTP generated locally."
      : "OTP sent to email",
    requireOtp: true,
    email: user.email,
    ...(isDevelopmentOtpEnabled() ? { developmentOtp: code } : {}),
  });
});

// --- STEP 2: VERIFY OTP & LOGIN ---
router.post("/verify-otp", v.verifyOtp, validate, async (req, res) => {
  const { identifier, otp } = req.body;

  const user = await User.byIdentifier(identifier, OTP_FIELDS);

  const problem = await checkOtp(user, otp, "login");
  if (problem) return res.status(400).json({ message: problem });

  if (user.isArchived) {
    return res.status(403).json({ message: "Your account has been archived." });
  }

  clearOtp(user);
  await user.save();

  // jwtid makes every token individually revocable (see POST /logout)
  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: process.env.JWT_EXPIRES_IN || "1d",
      jwtid: crypto.randomUUID(),
    },
  );

  setAuthCookie(res, token);
  const csrfToken = issueCsrfToken(res);
  const body = {
    role: user.role,
    name: user.name,
    userId: user._id.toString(),
    csrfToken,
  };
  // Browser clients never receive the JWT. Tests and deliberate API clients
  // may opt in to bearer delivery for non-cookie integrations.
  if (process.env.NODE_ENV === "test" || process.env.AUTH_RETURN_TOKEN === "true") {
    body.token = token;
  }
  res.json(body);
  await audit(req, "auth.login.succeeded", {
    actor: user._id,
    targetType: "User",
    targetId: user._id,
  });
});

// Rehydrates browser UI metadata and rotates the CSRF token without exposing
// the httpOnly JWT to JavaScript.
router.get("/session", verifyToken, async (req, res) => {
  const user = await User.findById(req.user.id).select("name role").lean();
  if (!user) return res.status(401).json({ message: "Session not found.", forceLogout: true });
  res.json({
    authenticated: true,
    role: user.role,
    name: user.name,
    userId: user._id.toString(),
    csrfToken: issueCsrfToken(res),
  });
});

// --- LOGOUT: revokes the token that made the request ---
router.post("/logout", verifyToken, async (req, res) => {
  const { jti, exp } = req.token;
  if (jti) {
    await RevokedToken.updateOne(
      { jti },
      { $setOnInsert: { jti, expiresAt: new Date(exp * 1000) } },
      { upsert: true },
    );
  }
  clearSessionCookies(res);
  res.json({ message: "Logged out." });
  await audit(req, "auth.logout", { targetType: "User", targetId: req.user.id });
});

// --- FORGOT PASSWORD - SEND OTP ---
// Always answers the same way so the endpoint cannot be used to discover
// which emails are registered (or whether a code was just sent).
router.post(
  "/forgot-password",
  v.forgotPassword,
  validate,
  async (req, res) => {
    const { email } = req.body;
    let developmentOtp;
    const user = await User.findOne({ email }).select(
      "+otpExpires +otpIssueCount +otpWindowStart",
    );

    if (user && !user.isArchived && !inResendCooldown(user)) {
      try {
        const code = await issueOtp(user, "reset");
        if (isDevelopmentOtpEnabled()) {
          developmentOtp = code;
        } else {
          await sendMailSafe({
            to: user.email,
            subject: "DentaLink - Password Reset OTP",
            text: `Your 6-digit password reset code is: ${code}\n\nThis code will expire in 10 minutes.\nIf you did not request this, you can ignore this email.`,
          });
        }
      } catch (err) {
        if (err.code !== "OTP_ISSUE_LIMIT") throw err;
        await audit(req, "auth.otp_issue_blocked", {
          outcome: "failure",
          actor: user._id,
          targetType: "User",
          targetId: user._id,
          metadata: { purpose: "reset" },
        });
      }
    }

    res.json({
      message:
        "If that email is registered, a password reset code has been sent.",
      ...(developmentOtp ? { developmentOtp } : {}),
    });
  },
);

// --- FORGOT PASSWORD - VERIFY OTP (does not consume the code) ---
router.post(
  "/verify-reset-otp",
  v.verifyResetOtp,
  validate,
  async (req, res) => {
    const { email, otp } = req.body;
    const user = await User.findOne({ email }).select(OTP_FIELDS);

    const problem = await checkOtp(user, otp, "reset");
    if (problem) return res.status(400).json({ message: problem });

    res.json({ message: "OTP verified successfully" });
  },
);

// --- FORGOT PASSWORD - RESET PASSWORD ---
// The OTP must be sent again here: previously this endpoint only needed an
// email, which let anyone reset any account's password.
router.post("/reset-password", v.resetPassword, validate, async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const user = await User.findOne({ email }).select(
    `${OTP_FIELDS} +password +failedLoginAttempts +lockUntil +tokensValidAfter`,
  );

  const problem = await checkOtp(user, otp, "reset");
  if (problem) return res.status(400).json({ message: problem });

  if (await bcrypt.compare(newPassword, user.password)) {
    return res
      .status(400)
      .json({ message: "Cannot change password with the current password." });
  }

  user.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  user.tokensValidAfter = new Date(); // invalidates every JWT issued before now
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  clearOtp(user);
  await user.save();

  await audit(req, "auth.password_reset", {
    actor: user._id,
    targetType: "User",
    targetId: user._id,
  });
  clearSessionCookies(res);

  res.json({ message: "Password changed successfully" });
});

module.exports = router;
