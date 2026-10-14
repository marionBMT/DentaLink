const router = require("express").Router();
const { query } = require("express-validator");
const AuditEvent = require("../models/AuditEvent");
const { verifyToken, isAdmin } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const { pagingQuery } = require("../validators/common");
const { readPaging, setPagingHeaders } = require("../utils/pagination");

const listRules = [
  ...pagingQuery,
  query("action").optional().isString().trim().isLength({ max: 100 }),
  query("outcome").optional().isIn(["success", "failure"]),
];

router.get("/", verifyToken, isAdmin, listRules, validate, async (req, res) => {
  const filter = {};
  if (req.query.action) filter.action = req.query.action;
  if (req.query.outcome) filter.outcome = req.query.outcome;

  const { paged, skip, limit } = readPaging(req.query);
  let request = AuditEvent.find(filter)
    .sort({ createdAt: -1 })
    .select("-__v")
    .populate("actor", "name email role")
    .lean();
  if (!paged) return res.json(await request);

  const [items, total] = await Promise.all([
    request.skip(skip).limit(limit),
    AuditEvent.countDocuments(filter),
  ]);
  setPagingHeaders(res, total, req.query);
  res.json(items);
});

module.exports = router;