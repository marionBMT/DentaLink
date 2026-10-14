const mongoose = require("mongoose");
const { COLLATION_CI } = require("../utils/constants");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 8,
      maxlength: 13,
    },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    // Sensitive fields are excluded from queries by default (select: false).
    // Auth routes must opt in explicitly with .select('+password ...').
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ["admin", "patient"], default: "patient" },
    contactNumber: { type: String, default: "", trim: true },
    address: { type: String, default: "", trim: true, maxlength: 300 },

    // One-time code (stored as a SHA-256 hash, never in plain text)
    otp: { type: String, default: null, select: false },
    otpExpires: { type: Date, default: null, select: false },
    otpPurpose: {
      type: String,
      enum: ["login", "reset", null],
      default: null,
      select: false,
    },
    otpAttempts: { type: Number, default: 0, select: false },
    otpIssueCount: { type: Number, default: 0, select: false },
    otpWindowStart: { type: Date, default: null, select: false },

    // Brute-force protection
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, default: null, select: false },

    // Tokens issued before this moment are rejected (set on password change/reset)
    tokensValidAfter: { type: Date, default: null, select: false },

    isArchived: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      // Defense in depth: never serialize secrets even if they were selected.
      transform: (_doc, ret) => {
        delete ret.password;
        delete ret.otp;
        delete ret.otpExpires;
        delete ret.otpPurpose;
        delete ret.otpAttempts;
        delete ret.otpIssueCount;
        delete ret.otpWindowStart;
        delete ret.failedLoginAttempts;
        delete ret.lockUntil;
        delete ret.tokensValidAfter;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// "Patient001" and "patient001" must not be two different accounts.
// (The plain unique index above stays; this one adds the case-insensitive rule.)
userSchema.index(
  { username: 1 },
  { unique: true, collation: COLLATION_CI, name: "username_ci_unique" },
);
userSchema.index({ role: 1, isArchived: 1 });

userSchema.statics.byUsername = function (username) {
  return this.findOne({ username }).collation(COLLATION_CI);
};

// Finds a user by e-mail or username. `select` lets callers opt in to the
// hidden fields (e.g. '+password +lockUntil') in the same single query.
userSchema.statics.byIdentifier = async function (identifier, select = "") {
  if (identifier.includes("@")) {
    const byEmail = await this.findOne({
      email: identifier.toLowerCase(),
    }).select(select);
    if (byEmail) return byEmail;
  }
  return this.findOne({ username: identifier })
    .collation(COLLATION_CI)
    .select(select);
};

module.exports = mongoose.model("User", userSchema);
