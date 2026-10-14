function isDevelopmentOtpEnabled(env = process.env) {
  return env.DEV_EXPOSE_OTP === "true" && env.NODE_ENV !== "production";
}

module.exports = { isDevelopmentOtpEnabled };