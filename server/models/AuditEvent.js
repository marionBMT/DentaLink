const mongoose = require("mongoose");

const auditEventSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, index: true, maxlength: 100 },
    outcome: {
      type: String,
      enum: ["success", "failure"],
      default: "success",
      index: true,
    },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    targetType: { type: String, default: "", maxlength: 50 },
    targetId: { type: String, default: "", maxlength: 100 },
    ip: { type: String, default: "", maxlength: 100 },
    userAgent: { type: String, default: "", maxlength: 500 },
    requestId: { type: String, default: "", maxlength: 100 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

auditEventSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AuditEvent", auditEventSchema);