const router = require("express").Router();
const Service = require("../models/Service");
const Appointment = require("../models/Appointment");
const { verifyToken, isAdmin } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const v = require("../validators/serviceValidators");
const { STATUS, COLLATION_CI } = require("../utils/constants");
const audit = require("../utils/audit");

// Appointments that still need the service/dentist to exist
const LIVE_STATUSES = [
  STATUS.PENDING,
  STATUS.ADMIN_COUNTER,
  STATUS.PATIENT_COUNTER,
  STATUS.CONFIRMED,
  STATUS.CANCELLATION_REQUESTED,
];

// Case-insensitive comparison so "Cleaning" and "cleaning" count as duplicates
const nameTaken = (name, excludeId) => {
  const filter = excludeId ? { name, _id: { $ne: excludeId } } : { name };
  return Service.findOne(filter).collation(COLLATION_CI).select("_id").lean();
};

// GET all services (Both patients and admins need to see the list)
router.get("/", verifyToken, async (req, res) => {
  const services = await Service.find()
    .sort({ createdAt: -1 })
    .select("-__v")
    .lean();
  res.json(services);
});

// CREATE a new service (Admin only)
router.post("/", verifyToken, isAdmin, v.create, validate, async (req, res) => {
  const { name, dentists } = req.body;

  if (await nameTaken(name)) {
    return res
      .status(400)
      .json({ message: "A service with this name already exists." });
  }

  const newService = await Service.create({
    name,
    // only whitelisted dentist fields are stored
    dentists: (dentists || []).map(({ name, contact }) => ({ name, contact })),
  });
  await audit(req, "service.created", {
    targetType: "Service",
    targetId: newService._id,
  });
  res.status(201).json(newService);
});

// UPDATE a service (Admin only) - Used for renaming OR assigning/removing dentists
router.put(
  "/:id",
  verifyToken,
  isAdmin,
  v.update,
  validate,
  async (req, res) => {
    const { name, dentists } = req.body;

    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: "Service not found" });

    const oldName = service.name;

    if (name && name !== oldName) {
      if (await nameTaken(name, service._id)) {
        return res
          .status(400)
          .json({ message: "A service with this name already exists." });
      }
      service.name = name;
    }

    if (dentists) {
      // Block un-assigning a dentist who still has live appointments
      const keptIds = new Set(
        dentists.filter((d) => d._id).map((d) => String(d._id)),
      );
      const removed = service.dentists.filter(
        (d) => !keptIds.has(String(d._id)),
      );

      if (removed.length > 0) {
        // One query for all removed dentists instead of one per dentist
        const busy = await Appointment.distinct("dentistName", {
          serviceType: oldName,
          dentistName: { $in: removed.map((d) => d.name) },
          status: { $in: LIVE_STATUSES },
          isArchived: false,
        });
        if (busy.length > 0) {
          return res.status(409).json({
            message: `${busy[0]} still has active appointments for this service. Resolve them first.`,
          });
        }
      }

      service.dentists = dentists.map(({ _id, name, contact }) =>
        _id ? { _id, name, contact } : { name, contact },
      );
    }

    await service.save();
    await audit(req, "service.updated", {
      targetType: "Service",
      targetId: service._id,
    });

    // Keep existing appointments pointing at the renamed service
    if (service.name !== oldName) {
      await Appointment.updateMany(
        { serviceType: oldName },
        { serviceType: service.name },
      );
    }

    res.json(service);
  },
);

// DELETE a service (Admin only)
router.delete(
  "/:id",
  verifyToken,
  isAdmin,
  v.idParam,
  validate,
  async (req, res) => {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: "Service not found" });

    const live = await Appointment.countDocuments({
      serviceType: service.name,
      status: { $in: LIVE_STATUSES },
      isArchived: false,
    });
    if (live > 0) {
      return res.status(409).json({
        message: `Cannot delete "${service.name}": ${live} active appointment(s) still use it.`,
      });
    }

    await service.deleteOne();
    await audit(req, "service.deleted", {
      targetType: "Service",
      targetId: service._id,
      metadata: { name: service.name },
    });
    res.json({ message: "Service deleted successfully" });
  },
);

module.exports = router;
