const crypto = require('crypto');

// Cryptographically secure 6-digit code (Math.random is predictable).
function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

// OTPs are stored hashed so a database leak does not expose live codes.
function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

function otpMatches(plain, storedHash) {
  if (!plain || !storedHash) return false;
  const a = Buffer.from(hashOtp(plain), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { generateOtp, hashOtp, otpMatches };
