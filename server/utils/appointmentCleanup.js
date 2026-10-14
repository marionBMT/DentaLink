const Appointment = require("../models/Appointment");
const { destroyFile } = require("../config/cloudinary");

// Deletes appointments matching `filter` AND their uploaded proof files, so
// removing a user/appointment does not leave orphaned files in Cloudinary.
async function removeAppointments(filter) {
  const docs = await Appointment.find(filter)
    .select("cancellationProofPublicId cancellationProofResourceType")
    .lean();
  if (docs.length === 0) return 0;

  await Appointment.deleteMany({ _id: { $in: docs.map((d) => d._id) } });
  await Promise.all(
    docs.map((d) =>
      destroyFile(
        d.cancellationProofPublicId,
        d.cancellationProofResourceType || "image",
      ),
    ),
  );
  return docs.length;
}

module.exports = { removeAppointments };
