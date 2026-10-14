const jwt = require("jsonwebtoken");
const User = require("../models/User");
const RevokedToken = require("../models/RevokedToken");
const { readAuthToken } = require("../utils/sessionCookies");

async function verifyToken(req, res, next) {
  const { token, source } = readAuthToken(req);

  if (!token) {
    return res
      .status(401)
      .json({ message: "Access denied. No token provided." });
  }

  let decoded;
  try {
    // Pin the algorithm so tokens signed with "none"/other algs are rejected.
    decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
  } catch (err) {
    // 401 (not 403): the caller is not authenticated. forceLogout tells the
    // client to clear its stored session.
    return res.status(401).json({
      message: "Your session has expired. Please log in again.",
      forceLogout: true,
    });
  }

  try {
    // Both lookups are independent, so run them together
    const [user, revoked] = await Promise.all([
      User.findById(decoded.id)
        .select("role isArchived +tokensValidAfter")
        .lean(),
      decoded.jti ? RevokedToken.exists({ jti: decoded.jti }) : null,
    ]);

    if (revoked)
      return res.status(401).json({
        message: "Your session has ended. Please log in again.",
        forceLogout: true,
      });
    if (!user)
      return res.status(401).json({
        message: "This account no longer exists.",
        forceLogout: true,
      });

    if (user.isArchived) {
      // 'forceLogout' tells the frontend to clear the session
      return res
        .status(403)
        .json({ message: "Account is archived.", forceLogout: true });
    }

    // Reject tokens issued before the last password change/reset
    if (
      user.tokensValidAfter &&
      decoded.iat * 1000 < user.tokensValidAfter.getTime()
    ) {
      return res.status(401).json({
        message: "Your password was changed. Please log in again.",
        forceLogout: true,
      });
    }

    // Role comes from the database, NOT the token, so a demoted/promoted
    // account takes effect immediately instead of when the JWT expires.
    req.user = { id: user._id.toString(), role: user.role };
    req.token = { jti: decoded.jti, exp: decoded.exp };
    req.authSource = source;
    next();
  } catch (err) {
    next(err);
  }
}

function isAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Access denied. Admin only." });
  }
  next();
}

function isPatient(req, res, next) {
  if (req.user?.role !== "patient") {
    return res.status(403).json({ message: "Access denied. Patients only." });
  }
  next();
}

module.exports = { verifyToken, isAdmin, isPatient };
