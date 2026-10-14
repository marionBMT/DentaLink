// READ-ONLY health check of an existing DentaLink database.
// Run it before relying on the stricter schema/indexes:   npm run check-data
//
// It never writes anything and never prints personal data (only counts and
// record ids), so its output is safe to paste into a bug report.
require("dotenv").config();
const mongoose = require("mongoose");

// Must be set BEFORE the models are loaded: otherwise connecting would build
// the new indexes / create collections, which is a write.
mongoose.set("autoIndex", false);
mongoose.set("autoCreate", false);

const User = require("../models/User");
const Appointment = require("../models/Appointment");
const Service = require("../models/Service");
const { STATUS } = require("../utils/constants");

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  await mongoose.connect(process.env.MONGO_URI);
  console.log(
    `Connected to database "${mongoose.connection.name}" (read-only checks)\n`,
  );

  let problems = 0;
  const report = (ok, label, detail = "") => {
    if (!ok) problems++;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ->  ${detail}` : ""}`,
    );
  };

  // 1. Two CONFIRMED, non-archived bookings sharing a dentist slot would make
  //    the new unique index impossible to build.
  const slotDupes = await Appointment.aggregate([
    { $match: { status: STATUS.CONFIRMED, isArchived: false } },
    {
      $group: {
        _id: {
          d: "$dentistName",
          date: "$requestedDate",
          time: "$requestedTime",
        },
        ids: { $push: "$_id" },
        n: { $sum: 1 },
      },
    },
    { $match: { n: { $gt: 1 } } },
  ]);
  report(
    slotDupes.length === 0,
    "No double-booked confirmed slots",
    slotDupes.map((g) => g.ids.join(" + ")).join(" | "),
  );

  // 1b. Identical pending requests from one patient would block the
  //     duplicate-request index.
  const pendingDupes = await Appointment.aggregate([
    { $match: { status: STATUS.PENDING, isArchived: false } },
    {
      $group: {
        _id: {
          p: "$patient",
          d: "$dentistName",
          date: "$requestedDate",
          time: "$requestedTime",
        },
        ids: { $push: "$_id" },
        n: { $sum: 1 },
      },
    },
    { $match: { n: { $gt: 1 } } },
  ]);
  report(
    pendingDupes.length === 0,
    "No duplicate pending requests from one patient",
    pendingDupes.map((g) => g.ids.join(" + ")).join(" | "),
  );

  // 1c. The atomic business-rule index permits only one unresolved request
  //     waiting on an admin per patient, even when the slots differ.
  const blockingDupes = await Appointment.aggregate([
    {
      $match: {
        status: {
          $in: [
            STATUS.PENDING,
            STATUS.PATIENT_COUNTER,
            STATUS.CANCELLATION_REQUESTED,
          ],
        },
        isArchived: false,
      },
    },
    {
      $group: {
        _id: "$patient",
        ids: { $push: "$_id" },
        n: { $sum: 1 },
      },
    },
    { $match: { n: { $gt: 1 } } },
  ]);
  report(
    blockingDupes.length === 0,
    "At most one unresolved admin-waiting request per patient",
    blockingDupes.map((g) => g.ids.join(" + ")).join(" | "),
  );

  // 2. Usernames that differ only by letter case would block the
  //    case-insensitive unique index.
  const nameDupes = await User.aggregate([
    {
      $group: {
        _id: { $toLower: "$username" },
        ids: { $push: "$_id" },
        n: { $sum: 1 },
      },
    },
    { $match: { n: { $gt: 1 } } },
  ]);
  report(
    nameDupes.length === 0,
    "No usernames that differ only by case",
    nameDupes.map((g) => g.ids.join(" + ")).join(" | "),
  );

  // 3. Emails stored with capitals no longer match at login (emails are now
  //    lower-cased). Count only, no addresses printed.
  const mixedCaseEmails = await User.find({ email: { $regex: /[A-Z]/ } })
    .select("_id")
    .lean();
  report(
    mixedCaseEmails.length === 0,
    "All emails are lower-case",
    mixedCaseEmails.map((u) => u._id).join(", "),
  );

  // 4. Every existing document must satisfy the stricter schema rules.
  async function validateAll(Model, label) {
    const bad = [];
    for await (const doc of Model.find().cursor()) {
      const err = await doc.validate().then(
        () => null,
        (e) => e,
      );
      if (err)
        bad.push(`${doc._id} (${Object.keys(err.errors || {}).join(", ")})`);
    }
    report(
      bad.length === 0,
      `All ${label} pass schema validation`,
      bad.join(" | "),
    );
  }
  await validateAll(User, "users");
  await validateAll(Appointment, "appointments");
  await validateAll(Service, "services");

  const legacyProofs = await Appointment.find({
    $or: [
      { cancellationProofUrl: { $nin: ["", null] } },
      {
        cancellationProofPublicId: { $nin: ["", null] },
        $or: [
          { cancellationProofDeliveryType: { $ne: "authenticated" } },
          { cancellationProofResourceType: { $nin: ["image", "raw"] } },
        ],
      },
    ],
  })
    .select("_id")
    .lean();
  report(
    legacyProofs.length === 0,
    "All cancellation proofs use authenticated delivery with storage metadata",
    legacyProofs.map((a) => a._id).join(", "),
  );

  // 5. Appointments pointing at a patient / service that no longer exists
  const patientIds = await Appointment.distinct("patient");
  const existing = new Set(
    (
      await User.find({ _id: { $in: patientIds } })
        .select("_id")
        .lean()
    ).map((u) => String(u._id)),
  );
  const orphans = await Appointment.find({ patient: { $nin: [...existing] } })
    .select("_id")
    .lean();
  report(
    orphans.length === 0,
    "No appointments with a missing patient",
    orphans.map((a) => a._id).join(", "),
  );

  const serviceNames = new Set(
    (await Service.find().select("name").lean()).map((s) => s.name),
  );
  const usedServices = await Appointment.distinct("serviceType", {
    status: {
      $in: [
        STATUS.PENDING,
        STATUS.ADMIN_COUNTER,
        STATUS.PATIENT_COUNTER,
        STATUS.CONFIRMED,
        STATUS.CANCELLATION_REQUESTED,
      ],
    },
    isArchived: false,
  });
  const missing = usedServices.filter((n) => !serviceNames.has(n));
  report(
    missing.length === 0,
    "Every live appointment refers to an existing service",
    missing.length ? `${missing.length} unknown service name(s)` : "",
  );

  // 6. At least one active admin
  const admins = await User.countDocuments({
    role: "admin",
    isArchived: false,
  });
  report(admins > 0, "At least one active admin exists", `${admins} found`);

  console.log(
    `\n${problems === 0 ? "All checks passed." : `${problems} check(s) need attention.`}`,
  );
  await mongoose.disconnect();
  process.exitCode = problems === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("Check failed:", err.message);
  process.exit(1);
});
