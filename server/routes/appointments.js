const router = require("express").Router();
const Appointment = require("../models/Appointment");
const Service = require("../models/Service");
const User = require("../models/User");
const {
  verifyToken,
  isAdmin,
  isPatient,
} = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const v = require("../validators/appointmentValidators");
const { mongoIdParam, archiveRules } = require("../validators/common");
const {
  upload,
  uploadProof,
  destroyFile,
  signedProofUrl,
} = require("../config/cloudinary");
const {
  sendMailSafe,
  renderEmail,
  escapeHtml: e,
  formatTimeFriendly,
} = require("../utils/mailer");
const { readPaging, setPagingHeaders } = require("../utils/pagination");
const { removeAppointments } = require("../utils/appointmentCleanup");
const { escapeRegex } = require("../utils/regex");
const { STATUS, BLOCKING_STATUSES } = require("../utils/constants");
const { appointmentView, appointmentViews } = require("../utils/appointmentView");
const audit = require("../utils/audit");

// ---------------------------------------------------------------------------
// Who may move an appointment from which status to which status.
// Anything not listed here is rejected, so a client can no longer set an
// arbitrary status / patient / date by sending its own request body.
// ---------------------------------------------------------------------------
const PATIENT_TRANSITIONS = {
  [STATUS.PENDING]: [STATUS.CANCELLED],
  [STATUS.ADMIN_COUNTER]: [
    STATUS.CONFIRMED,
    STATUS.PATIENT_COUNTER,
    STATUS.CANCELLATION_REQUESTED,
  ],
  [STATUS.CONFIRMED]: [STATUS.CANCELLATION_REQUESTED],
};

const ADMIN_TRANSITIONS = {
  [STATUS.PENDING]: [STATUS.CONFIRMED, STATUS.ADMIN_COUNTER, STATUS.REJECTED],
  [STATUS.PATIENT_COUNTER]: [
    STATUS.CONFIRMED,
    STATUS.ADMIN_COUNTER,
    STATUS.REJECTED,
  ],
  // "Keep appointment" returns to Confirmed / Admin_Counter_Offer
  [STATUS.CANCELLATION_REQUESTED]: [
    STATUS.CANCELLED,
    STATUS.CONFIRMED,
    STATUS.ADMIN_COUNTER,
  ],
};

// Another confirmed, non-archived appointment for the same dentist at that slot.
// This is the friendly pre-check; the partial unique index on the model is what
// actually guarantees no two confirmed bookings can share a slot under a race.
const slotTaken = (dentistName, date, time, excludeId) =>
  Appointment.exists({
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    status: STATUS.CONFIRMED,
    isArchived: false,
    dentistName,
    requestedDate: date,
    requestedTime: time,
  });

const slotConflictMessage = (dentist, date, time) =>
  `Schedule Conflict: ${dentist} is already booked on ${date} at ${formatTimeFriendly(time)}.`;

// Validates the :id param, loads the appointment and makes sure the caller is
// allowed to touch it. Patients can only reach their own, non-archived ones;
// for everyone else a 404 is returned so IDs cannot be probed.
const idCheck = [mongoIdParam(), validate];

async function loadAppointment(req, res, next) {
  const appt = await Appointment.findById(req.params.id).populate(
    "patient",
    "name email",
  );
  if (!appt) return res.status(404).json({ message: "Appointment not found" });

  if (req.user.role !== "admin") {
    const ownerId = appt.patient?._id?.toString();
    if (ownerId !== req.user.id || appt.isArchived) {
      return res.status(404).json({ message: "Appointment not found" });
    }
  }

  req.appointment = appt;
  next();
}

// Parses the optional cancellation-proof file (kept in memory, NOT uploaded
// yet). Only patients may attach one; admins skip straight through.
function patientUpload(req, res, next) {
  if (req.user.role !== "patient") return next();
  return upload.single("cancellationProof")(req, res, next);
}

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------
function adminActionEmail(appt, previousStatus, adminUser) {
  const patientName = appt.patient.name;
  const footerAdmin = { name: adminUser.name, email: adminUser.email };
  const admin = `<strong>${e(adminUser.name)}</strong>`;
  const service = `<strong>${e(appt.serviceType)}</strong>`;
  const dentist = `<strong>${e(appt.dentistName)}</strong>`;

  switch (appt.status) {
    case STATUS.CONFIRMED:
      if (previousStatus === STATUS.CANCELLATION_REQUESTED) {
        return {
          subject: "DentaLink - Appointment Kept (Cancellation Declined)",
          html: renderEmail({
            title: "Appointment Maintained",
            color: "#17a2b8",
            name: patientName,
            intro: `An administrator (${admin}) has reviewed your request to cancel the appointment for ${service}, but the appointment will be kept as scheduled.`,
            details: [
              ["Admin Reason", appt.adminRemarks],
              ["Date", appt.requestedDate],
              ["Time", formatTimeFriendly(appt.requestedTime)],
            ],
            outro:
              "Please make sure to attend, or contact the clinic directly if you have immediate concerns.",
            footerAdmin,
          }),
        };
      }
      return {
        subject: "DentaLink - Appointment Confirmed!",
        html: renderEmail({
          title: "Appointment Confirmed",
          color: "#28a745",
          name: patientName,
          intro: `Your appointment for ${service} has been officially confirmed by ${admin}.`,
          details: [
            ["Date", appt.requestedDate],
            ["Time", formatTimeFriendly(appt.requestedTime)],
            ["Assigned Dentist", appt.dentistName],
          ],
          outro:
            "You may now proceed to the clinic at your scheduled time. If you have any immediate concerns, please contact the admin who confirmed your appointment.",
          footerAdmin,
        }),
      };

    case STATUS.ADMIN_COUNTER:
      return {
        subject: "DentaLink - New Schedule Suggestion",
        html: renderEmail({
          title: "Schedule Update Suggested",
          color: "#ffc107",
          name: patientName,
          intro: `An administrator (${admin}) has reviewed your appointment request for ${service} with ${dentist} and suggested a new time.`,
          details: [
            ["Suggested Date", appt.adminSuggestedDate],
            ["Suggested Time", formatTimeFriendly(appt.adminSuggestedTime)],
            ["Admin Remarks", appt.adminRemarks],
          ],
          outro:
            "Please log in to your DentaLink dashboard to accept this new time, request another option, or cancel the request.",
          footerAdmin,
        }),
      };

    case STATUS.REJECTED:
      return {
        subject: "DentaLink - Appointment Request Declined",
        html: renderEmail({
          title: "Appointment Request Declined",
          color: "#dc3545",
          name: patientName,
          intro: `We regret to inform you that your appointment request for ${service} with ${dentist} on ${e(appt.requestedDate)} could not be accommodated at this time.`,
          details: [["Reason", appt.adminRemarks]],
          outro:
            "If you would like to schedule for a different day, please submit a new request through your dashboard.",
          footerAdmin,
        }),
      };

    case STATUS.CANCELLED:
      return {
        subject: "DentaLink - Cancellation Approved",
        html: renderEmail({
          title: "Appointment Cancellation Approved",
          color: "#6c757d",
          name: patientName,
          intro: `Your request to cancel the appointment for ${service} on <strong>${e(appt.requestedDate)}</strong> has been approved and processed by ${admin}.`,
          outro:
            "Your schedule has been cleared. If you need to book a new appointment in the future, please log in to your dashboard.",
          footerAdmin,
        }),
      };

    default:
      return null;
  }
}

function patientAcceptedEmail(appt) {
  return {
    subject: "DentaLink - Appointment Confirmed!",
    html: renderEmail({
      title: "Appointment Confirmed",
      color: "#28a745",
      name: appt.patient.name,
      intro: `You have successfully accepted the new schedule for your <strong>${e(appt.serviceType)}</strong> appointment.`,
      details: [
        ["Final Date", appt.requestedDate],
        ["Final Time", formatTimeFriendly(appt.requestedTime)],
        ["Assigned Dentist", appt.dentistName],
      ],
      outro:
        "Your appointment is now officially locked in. You may proceed to the clinic at your scheduled time.",
    }),
  };
}

// ---------------------------------------------------------------------------
// 1. CREATE APPOINTMENT (Patient)
// ---------------------------------------------------------------------------
router.post(
  "/",
  verifyToken,
  isPatient,
  v.create,
  validate,
  async (req, res) => {
    const { serviceType, dentistName, requestedDate, requestedTime } = req.body;

    // These three checks are independent, so they run together
    const [service, waiting, taken] = await Promise.all([
      // The service must exist and the dentist must actually be assigned to it
      Service.findOne({ name: serviceType, "dentists.name": dentistName })
        .select("name")
        .lean(),
      Appointment.exists({
        patient: req.user.id,
        status: { $in: BLOCKING_STATUSES },
        isArchived: false,
      }),
      slotTaken(dentistName, requestedDate, requestedTime),
    ]);

    if (!service) {
      return res
        .status(400)
        .json({ message: "That service or dentist is not available." });
    }
    if (waiting) {
      return res
        .status(400)
        .json({ message: "You already have a pending request." });
    }
    if (taken) {
      return res.status(409).json({
        message:
          "That time slot is already booked for this dentist. Please choose another.",
      });
    }

    const newAppt = await Appointment.create({
      patient: req.user.id,
      serviceType: service.name,
      dentistName,
      requestedDate,
      requestedTime,
    });

    res.status(201).json(appointmentView(newAppt));
  },
);

// ---------------------------------------------------------------------------
// 2. GET APPOINTMENTS (Smart Route)
//    Optional: ?page=&limit= (paginate), ?search= (admin), ?status=,
//    ?archived=true|false (admin)
// ---------------------------------------------------------------------------
router.get("/", verifyToken, v.list, validate, async (req, res) => {
  const isAdminUser = req.user.role === "admin";
  const { search, status, archived } = req.query;

  const filter = isAdminUser ? {} : { patient: req.user.id, isArchived: false };
  if (status) filter.status = status;
  if (isAdminUser && archived) filter.isArchived = archived === "true";
  if (isAdminUser && search) {
    const rx = new RegExp(escapeRegex(search), "i");
    const patientIds = await User.find({ $or: [{ name: rx }, { email: rx }] })
      .distinct("_id");
    filter.$or = [
      { serviceType: rx },
      { dentistName: rx },
      { patient: { $in: patientIds } },
    ];
  }

  const { paged, skip, limit } = readPaging(req.query);
  let query = Appointment.find(filter).sort({ createdAt: -1 }).select("-__v");
  if (isAdminUser) query = query.populate("patient", "name email");
  query = query.lean();

  if (!paged) return res.json(appointmentViews(await query));

  const [items, total] = await Promise.all([
    query.skip(skip).limit(limit),
    Appointment.countDocuments(filter),
  ]);
  setPagingHeaders(res, total, req.query);
  if (!isAdminUser) {
    const hasPending = await Appointment.exists({
      patient: req.user.id,
      isArchived: false,
      status: {
        $in: [
          STATUS.PENDING,
          STATUS.PATIENT_COUNTER,
          STATUS.CANCELLATION_REQUESTED,
        ],
      },
    });
    res.set("X-Has-Pending", hasPending ? "true" : "false");
  }
  res.json(appointmentViews(items));
});

router.get("/:id/proof", verifyToken, idCheck, loadAppointment, async (req, res) => {
  const appt = req.appointment;
  if (!appt.cancellationProofPublicId) {
    return res.status(404).json({ message: "No cancellation proof is attached." });
  }
  if (
    appt.cancellationProofDeliveryType !== "authenticated" ||
    !appt.cancellationProofFormat
  ) {
    return res.status(409).json({
      message: "This legacy proof must be migrated to protected storage.",
    });
  }
  res.json({
    url: signedProofUrl(
      appt.cancellationProofPublicId,
      appt.cancellationProofFormat,
      appt.cancellationProofResourceType || "image",
    ),
    expiresIn: 60,
  });
});

// ---------------------------------------------------------------------------
// 3. UPDATE APPOINTMENT STATUS (state machine, role-aware)
// ---------------------------------------------------------------------------
router.put(
  "/:id",
  verifyToken,
  idCheck,
  loadAppointment,
  patientUpload,
  v.update,
  validate,
  async (req, res) => {
    const appt = req.appointment;
    const role = req.user.role;
    const previousStatus = appt.status;
    const { status } = req.body;
    const adminRemarks = (req.body.adminRemarks || "").trim();
    const patientRemarks = (req.body.patientRemarks || "").trim();

    if (role === "admin" && appt.isArchived) {
      return res
        .status(400)
        .json({ message: "Restore this appointment before changing it." });
    }

    const allowed =
      (role === "admin" ? ADMIN_TRANSITIONS : PATIENT_TRANSITIONS)[
        previousStatus
      ] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        message: `You cannot change an appointment from "${previousStatus.replace(/_/g, " ")}" to "${status.replace(/_/g, " ")}".`,
      });
    }

    let attachProof = false;

    // --- Apply only the fields that belong to this specific transition ---
    if (role === "admin") {
      switch (status) {
        case STATUS.CONFIRMED:
          if (previousStatus === STATUS.CANCELLATION_REQUESTED) {
            // "Keep appointment": a reason is mandatory
            if (!adminRemarks)
              return res.status(400).json({
                message: "Please provide a reason for keeping the appointment.",
              });
            // The slot was released while the cancellation was pending, so
            // someone else may have taken it in the meantime.
            if (
              await slotTaken(
                appt.dentistName,
                appt.requestedDate,
                appt.requestedTime,
                appt._id,
              )
            ) {
              return res.status(409).json({
                message: `${slotConflictMessage(appt.dentistName, appt.requestedDate, appt.requestedTime)} Approve the cancellation instead.`,
              });
            }
            appt.adminRemarks = adminRemarks;
          } else {
            if (
              await slotTaken(
                appt.dentistName,
                appt.requestedDate,
                appt.requestedTime,
                appt._id,
              )
            ) {
              return res.status(409).json({
                message: slotConflictMessage(
                  appt.dentistName,
                  appt.requestedDate,
                  appt.requestedTime,
                ),
              });
            }
            appt.adminRemarks = ""; // clear any stale counter-offer note
          }
          break;

        case STATUS.ADMIN_COUNTER:
          if (previousStatus === STATUS.CANCELLATION_REQUESTED) {
            if (!adminRemarks)
              return res.status(400).json({
                message: "Please provide a reason for keeping the appointment.",
              });
            if (!appt.adminSuggestedDate || !appt.adminSuggestedTime) {
              return res
                .status(400)
                .json({ message: "There is no counter offer to return to." });
            }
          } else {
            const { adminSuggestedDate, adminSuggestedTime } = req.body;
            if (!adminSuggestedDate || !adminSuggestedTime || !adminRemarks) {
              return res.status(400).json({
                message:
                  "A suggested date, time and reason are required for a counter offer.",
              });
            }
            appt.adminSuggestedDate = adminSuggestedDate;
            appt.adminSuggestedTime = adminSuggestedTime;
          }
          appt.adminRemarks = adminRemarks;
          break;

        case STATUS.REJECTED:
          if (!adminRemarks)
            return res.status(400).json({
              message: "Please provide a reason for rejecting this request.",
            });
          appt.adminRemarks = adminRemarks;
          break;

        default: // CANCELLED: nothing else to set
          break;
      }
    } else {
      switch (status) {
        case STATUS.CANCELLED: // patient withdraws a pending request
          appt.patientRemarks = "Cancelled by patient.";
          break;

        case STATUS.CONFIRMED: // patient accepts the admin's counter offer
          if (!appt.adminSuggestedDate || !appt.adminSuggestedTime) {
            return res
              .status(400)
              .json({ message: "There is no offer to accept." });
          }
          // Date/time come from the stored offer, never from the request
          if (
            await slotTaken(
              appt.dentistName,
              appt.adminSuggestedDate,
              appt.adminSuggestedTime,
              appt._id,
            )
          ) {
            return res.status(409).json({
              message:
                "That offered slot has just been taken. Please request another option.",
            });
          }
          appt.requestedDate = appt.adminSuggestedDate;
          appt.requestedTime = appt.adminSuggestedTime;
          appt.patientRemarks = "";
          // The counter-offer note must not linger: the UI shows any
          // remark on a Confirmed appointment as a "Keep Appointment" note.
          appt.adminRemarks = "";
          break;

        case STATUS.PATIENT_COUNTER:
        case STATUS.CANCELLATION_REQUESTED:
          if (!patientRemarks)
            return res
              .status(400)
              .json({ message: "Please provide a message for the admin." });
          appt.patientRemarks = patientRemarks;
          attachProof =
            status === STATUS.CANCELLATION_REQUESTED && Boolean(req.file);
          break;

        default:
          break;
      }
    }

    // Every check has passed: only now is the file sent to Cloudinary, so a
    // refused request can never leave an orphaned upload behind.
    let proof = null;
    let previousProofId = "";
    let previousProofResourceType = "image";
    if (attachProof) {
      try {
        proof = await uploadProof(req.file);
      } catch (err) {
        if (err.code === "INVALID_FILE_TYPE") throw err; // -> 400
        console.error("Cloudinary upload failed:", err.message);
        return res
          .status(502)
          .json({ message: "File upload failed. Please try again." });
      }
      previousProofId = appt.cancellationProofPublicId;
      previousProofResourceType =
        appt.cancellationProofResourceType || "image";
      appt.cancellationProofUrl = "";
      appt.cancellationProofPublicId = proof.publicId;
      appt.cancellationProofFormat = proof.format;
      appt.cancellationProofDeliveryType = proof.deliveryType;
      appt.cancellationProofResourceType = proof.resourceType;
    }

    appt.status = status;
    try {
      await appt.save();
    } catch (err) {
      if (proof) await destroyFile(proof.publicId, proof.resourceType);
      throw err; // duplicate-slot (E11000) becomes a 409 in errorHandler
    }
    if (proof && previousProofId) {
      destroyFile(previousProofId, previousProofResourceType); // replaced file
    }
    await audit(req, "appointment.status_changed", {
      targetType: "Appointment",
      targetId: appt._id,
      metadata: {
        from: previousStatus,
        to: status,
        proofAttached: Boolean(proof),
      },
    });

    // --- Notifications (never block or fail the request) ---
    if (appt.patient?.email) {
      if (role === "admin") {
        const adminUser = await User.findById(req.user.id)
          .select("name email")
          .lean();
        const mail = adminActionEmail(appt, previousStatus, adminUser);
        if (mail) sendMailSafe({ to: appt.patient.email, ...mail });
      } else if (status === STATUS.CONFIRMED) {
        sendMailSafe({
          to: appt.patient.email,
          ...patientAcceptedEmail(appt),
        });
      }
    }

    res.json(appointmentView(appt));
  },
);

// ---------------------------------------------------------------------------
// ARCHIVE / RESTORE APPOINTMENT (Admin) WITH EMAIL NOTIFICATION
// ---------------------------------------------------------------------------
router.put(
  "/:id/archive",
  verifyToken,
  isAdmin,
  archiveRules,
  validate,
  async (req, res) => {
    const { isArchived, reason, contact } = req.body;

    const targetAppt = await Appointment.findById(req.params.id).populate(
      "patient",
      "name email",
    );
    if (!targetAppt)
      return res.status(404).json({ message: "Appointment not found" });

    // Restoring a confirmed booking puts it back in the schedule, so its slot
    // must still be free (the unique index would reject it anyway).
    if (
      !isArchived &&
      targetAppt.status === STATUS.CONFIRMED &&
      (await slotTaken(
        targetAppt.dentistName,
        targetAppt.requestedDate,
        targetAppt.requestedTime,
        targetAppt._id,
      ))
    ) {
      return res.status(409).json({
        message: `Cannot restore: ${slotConflictMessage(targetAppt.dentistName, targetAppt.requestedDate, targetAppt.requestedTime)}`,
      });
    }

    targetAppt.isArchived = isArchived;
    await targetAppt.save();
    await audit(req, isArchived ? "appointment.archived" : "appointment.restored", {
      targetType: "Appointment",
      targetId: targetAppt._id,
      metadata: isArchived ? { reason } : {},
    });

    if (isArchived && targetAppt.patient?.email) {
      const adminUser = await User.findById(req.user.id)
        .select("name email")
        .lean();
      await sendMailSafe({
        to: targetAppt.patient.email,
        subject: "DentaLink - Appointment Archival Notice",
        html: renderEmail({
          title: "Appointment Archival Notice",
          color: "#d9534f",
          name: targetAppt.patient.name,
          intro: `This is an automated notification to inform you that your DentaLink appointment request for <strong>${e(targetAppt.serviceType)}</strong> on <strong>${e(targetAppt.requestedDate)}</strong> has been archived by an administrator.`,
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

    res.json({ message: "Appointment archive status updated successfully" });
  },
);

// ---------------------------------------------------------------------------
// 4. DELETE APPOINTMENT (Admin) - permanent, so it must be archived first
// ---------------------------------------------------------------------------
router.delete("/:id", verifyToken, isAdmin, idCheck, async (req, res) => {
  const appt = await Appointment.findById(req.params.id)
    .select("isArchived")
    .lean();
  if (!appt) return res.status(404).json({ message: "Appointment not found" });

  if (!appt.isArchived) {
    return res.status(400).json({
      message: "Archive this appointment before deleting permanently.",
    });
  }

  await removeAppointments({ _id: appt._id }); // also removes the proof file
  await audit(req, "appointment.deleted", {
    targetType: "Appointment",
    targetId: appt._id,
  });
  res.json({ message: "Appointment deleted" });
});

module.exports = router;
