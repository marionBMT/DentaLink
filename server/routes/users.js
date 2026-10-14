const router = require("express").Router();
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { verifyToken, isAdmin } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const v = require("../validators/userValidators");
const { sendMailSafe, renderEmail, escapeHtml } = require("../utils/mailer");
const { readPaging, setPagingHeaders } = require("../utils/pagination");
const { escapeRegex } = require("../utils/regex");
const { removeAppointments } = require("../utils/appointmentCleanup");
const { BCRYPT_ROUNDS } = require("../utils/constants");
const audit = require("../utils/audit");
const { clearSessionCookies } = require("../utils/sessionCookies");

// True if `user` is the only active admin left (removing them would lock
// everyone out of the admin dashboard).
async function isLastActiveAdmin(user) {
  if (user.role !== "admin" || user.isArchived) return false;
  const others = await User.countDocuments({
    role: "admin",
    isArchived: false,
    _id: { $ne: user._id },
  });
  return others === 0;
}

// Get users (Admin).
// Optional: ?page=&limit= (paginate), ?search= (name/email/username),
// ?archived=true|false, ?role=admin|patient. With no query it returns everyone.
router.get("/", verifyToken, isAdmin, v.list, validate, async (req, res) => {
  const { search, archived, role } = req.query;

  const filter = {};
  if (archived) filter.isArchived = archived === "true";
  if (role) filter.role = role;
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ name: rx }, { email: rx }, { username: rx }];
  }

  const { paged, skip, limit } = readPaging(req.query);
  // lean(): plain objects, no Mongoose overhead. Secrets are select:false so
  // they are never loaded in the first place.
  const query = User.find(filter).sort({ createdAt: -1 }).select("-__v").lean();

  if (!paged) return res.json(await query);

  const [items, total] = await Promise.all([
    query.skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  setPagingHeaders(res, total, req.query);
  res.json(items);
});

// Clear a password-failure lock after an administrator verifies the account
// owner through the clinic's normal support process.
router.post(
  "/:id/unlock-login",
  verifyToken,
  isAdmin,
  v.idParam,
  validate,
  async (req, res) => {
    const target = await User.findById(req.params.id).select(
      "+failedLoginAttempts +lockUntil",
    );
    if (!target) return res.status(404).json({ message: "User not found" });
    target.failedLoginAttempts = 0;
    target.lockUntil = null;
    await target.save();
    await audit(req, "user.login_unlocked", {
      targetType: "User",
      targetId: target._id,
    });
    res.json({ message: "Login lock cleared." });
  },
);

// Create user (Admin)
router.post(
  "/",
  verifyToken,
  isAdmin,
  v.adminCreateUser,
  validate,
  async (req, res) => {
    const { username, name, email, password, role } = req.body;

    const [emailTaken, usernameTaken] = await Promise.all([
      User.exists({ email }),
      User.byUsername(username).select("_id").lean(),
    ]);
    if (emailTaken)
      return res.status(400).json({ message: "Email is already used." });
    if (usernameTaken)
      return res.status(400).json({ message: "Username is already taken." });

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const newUser = await User.create({
      username,
      name,
      email,
      password: hashedPassword,
      role: role || "patient",
    });

    // toJSON strips the password hash
    res.status(201).json(newUser);
  },
);

// Get current user profile
router.get("/profile", verifyToken, async (req, res) => {
  const user = await User.findById(req.user.id).select("-__v").lean();
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
});

// Update current user profile (role, email, username can NOT be changed here)
router.put(
  "/profile",
  verifyToken,
  v.updateProfile,
  validate,
  async (req, res) => {
    const { name, contactNumber, address } = req.body;
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { name, contactNumber: contactNumber || "", address: address || "" },
      { returnDocument: "after", runValidators: true },
    );
    res.json(updatedUser);
  },
);

// Change own password (requires the current password)
router.put(
  "/change-password",
  verifyToken,
  v.changePassword,
  validate,
  async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id).select(
      "+password +tokensValidAfter",
    );

    if (!(await bcrypt.compare(currentPassword, user.password))) {
      return res
        .status(400)
        .json({ message: "Current password is incorrect." });
    }
    if (await bcrypt.compare(newPassword, user.password)) {
      return res
        .status(400)
        .json({
          message: "New password must be different from the current password.",
        });
    }

    user.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    // Every token issued before this moment (including the current one) is
    // rejected by verifyToken, so the client must log in again.
    user.tokensValidAfter = new Date();
    await user.save();
    await audit(req, "user.password_changed", {
      targetType: "User",
      targetId: user._id,
    });
    clearSessionCookies(res);

    res.json({
      message: "Password changed successfully. Please log in again.",
    });
  },
);

// Delete own account. Requires the password AND the username typed exactly,
// the same "type the name to confirm" pattern used by GitHub / AWS.
router.delete(
  "/me",
  verifyToken,
  v.deleteOwnAccount,
  validate,
  async (req, res) => {
    const { password, confirmUsername } = req.body;
    const user = await User.findById(req.user.id).select("+password");

    if (confirmUsername !== user.username) {
      return res
        .status(400)
        .json({ message: "The username you typed does not match." });
    }
    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: "Incorrect password." });
    }
    if (await isLastActiveAdmin(user)) {
      return res
        .status(400)
        .json({
          message:
            "You are the only active admin and cannot delete this account.",
        });
    }

    await removeAppointments({ patient: user._id });
    await audit(req, "user.self_deleted", {
      actor: user._id,
      targetType: "User",
      targetId: user._id,
    });
    await user.deleteOne();
    clearSessionCookies(res);

    res.json({ message: "Your account has been deleted." });
  },
);

// Archive / Restore user (Admin)
router.put(
  "/:id/archive",
  verifyToken,
  isAdmin,
  v.archive,
  validate,
  async (req, res) => {
    const { isArchived, reason, contact } = req.body;

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ message: "User not found" });

    if (isArchived) {
      if (targetUser._id.toString() === req.user.id) {
        return res
          .status(400)
          .json({ message: "You cannot archive your own account." });
      }
      if (await isLastActiveAdmin(targetUser)) {
        return res
          .status(400)
          .json({ message: "You cannot archive the only active admin." });
      }
    }

    targetUser.isArchived = isArchived;
    await targetUser.save();
    await audit(req, isArchived ? "user.archived" : "user.restored", {
      targetType: "User",
      targetId: targetUser._id,
      metadata: isArchived ? { reason } : {},
    });

    if (isArchived) {
      const adminUser = await User.findById(req.user.id)
        .select("name email")
        .lean();
      await sendMailSafe({
        to: targetUser.email,
        subject: "DentaLink - Account Archival Notice",
        html: renderEmail({
          title: "Account Archival Notice",
          color: "#d9534f",
          name: targetUser.name,
          intro: `This is an automated notification to inform you that your DentaLink account (Username: <strong>${escapeHtml(targetUser.username)}</strong>) has been archived by an administrator.`,
          details: [
            ["Archived By", `${adminUser.name} (${adminUser.email})`],
            ["Reason", reason],
            ["Admin Contact", contact],
          ],
          outro:
            "If you believe this was a mistake or need further clarification, please reach out using the admin contact provided above.",
        }),
      });
    }

    res.json({ message: "User archive status updated successfully" });
  },
);

// Delete user (Admin) - permanent, so the record must be archived first
router.delete(
  "/:id",
  verifyToken,
  isAdmin,
  v.idParam,
  validate,
  async (req, res) => {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: "User not found" });

    if (target._id.toString() === req.user.id) {
      return res
        .status(400)
        .json({ message: "You cannot delete your own account from here." });
    }
    if (!target.isArchived) {
      return res
        .status(400)
        .json({ message: "Archive this user before deleting permanently." });
    }

    // Do not leave orphaned appointments (or their uploaded files) behind
    await removeAppointments({ patient: target._id });
    await audit(req, "user.deleted", {
      targetType: "User",
      targetId: target._id,
    });
    await target.deleteOne();

    res.json({ message: "User deleted successfully" });
  },
);

module.exports = router;
