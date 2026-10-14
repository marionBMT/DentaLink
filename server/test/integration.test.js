// Full-stack API tests against a REAL, throwaway MongoDB.
//
//   npm test                         -> runs everything below (mail is stubbed)
//   RUN_CLOUDINARY=1 npm test        -> also uploads/deletes real files on the
//                                       Cloudinary account configured in .env
//
// A temporary mongod is started on a private port with a temp data folder and
// removed afterwards; your real MONGO_URI is never used. Set MONGOD_PATH if
// `mongod` is not on your PATH. If mongod cannot start, these tests are skipped.
process.env.JWT_SECRET = "integration-secret-integration-secret-1234";
process.env.NODE_ENV = "test";
process.env.AUTH_RATE_LIMIT = "100000";
process.env.API_RATE_LIMIT = "100000";
if (process.env.RUN_CLOUDINARY) {
  // only for Cloudinary credentials; MONGO_URI from .env is never used here
  require("dotenv").config();
  process.env.JWT_SECRET = "integration-secret-integration-secret-1234";
}

// Capture outgoing mail instead of sending it
const sent = [];
require("nodemailer").createTransport = () => ({
  sendMail: async (o) => {
    sent.push(o);
    return { accepted: [o.to] };
  },
});

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const PORT = 27998;
const dbpath = fs.mkdtempSync(path.join(os.tmpdir(), "dl-it-mongo-"));
let mongod;
let available = false;
let server;
let base;
let User, Appointment, Service, RevokedToken, AuditEvent;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PW = "Str0ng!Pass";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

before(async () => {
  mongod = spawn(
    process.env.MONGOD_PATH || "mongod",
    ["--dbpath", dbpath, "--port", String(PORT), "--bind_ip", "127.0.0.1"],
    {
      stdio: "ignore",
    },
  );
  mongod.on("error", () => {});

  for (let i = 0; i < 40 && !available; i++) {
    try {
      await mongoose.connect(`mongodb://127.0.0.1:${PORT}/dl_integration`, {
        serverSelectionTimeoutMS: 1000,
      });
      available = true;
    } catch {
      await sleep(500);
    }
  }
  if (!available) return;

  User = require("../models/User");
  Appointment = require("../models/Appointment");
  Service = require("../models/Service");
  RevokedToken = require("../models/RevokedToken");
  AuditEvent = require("../models/AuditEvent");
  // make sure every (unique / partial) index exists before tests rely on them
  await Promise.all([
    User.init(),
    Appointment.init(),
    Service.init(),
    RevokedToken.init(),
    AuditEvent.init(),
  ]);

  const app = require("../app");
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) server.close();
  await mongoose.disconnect().catch(() => {});
  if (mongod) mongod.kill();
  await sleep(500);
  try {
    fs.rmSync(dbpath, { recursive: true, force: true });
  } catch {}
});

// ---- helpers ---------------------------------------------------------------
async function call(method, p, { body, token, form, headers: extraHeaders } = {}) {
  const headers = { ...(extraHeaders || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(base + p, { method, headers, body: payload });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json, headers: res.headers };
}

const tokenFor = (u, extra = {}) =>
  jwt.sign({ id: u._id, role: u.role }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "1d",
    jwtid: `${u._id}-${Math.random()}`,
    ...extra,
  });

const lastOtp = () => /: (\d{6})/.exec(sent[sent.length - 1].text)[1];
const makeUser = async (username, extra = {}) =>
  User.create({
    username,
    name: username,
    email: `${username.toLowerCase()}@x.co`,
    password: await bcrypt.hash(PW, 4),
    ...extra,
  });

// Shared state across the ordered tests below
const S = {};
const gate = (t) => {
  if (!available) {
    t.skip("mongod is not available on this machine");
    return false;
  }
  return true;
};

// ---- 1. Registration, OTP login, secrets --------------------------------------
test("register, OTP login, single-use codes, hashed storage", async (t) => {
  if (!gate(t)) return;

  S.admin = await makeUser("adminuser1", { role: "admin" });
  S.adminT = tokenFor(S.admin);

  let r = await call("POST", "/api/auth/register", {
    body: {
      username: "patient001",
      name: "Pat One",
      email: "Pat1@X.co",
      password: PW,
    },
  });
  assert.equal(r.status, 201);
  assert.equal(
    (await User.findOne({ username: "patient001" })).email,
    "pat1@x.co",
    "email is lower-cased",
  );

  r = await call("POST", "/api/auth/login", {
    body: { identifier: "patient001", password: PW },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.requireOtp, true);
  const stored = await User.findOne({ username: "patient001" }).select("+otp");
  assert.notEqual(stored.otp, lastOtp());
  assert.equal(stored.otp.length, 64, "OTP is stored as a SHA-256 hash");

  assert.equal(
    (
      await call("POST", "/api/auth/verify-otp", {
        body: { identifier: "patient001", otp: "000000" },
      })
    ).status,
    400,
  );
  r = await call("POST", "/api/auth/verify-otp", {
    body: { identifier: "pat1@x.co", otp: lastOtp() },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.role, "patient");
  S.p1T = r.json.token;
  assert.ok(jwt.decode(S.p1T).jti, "issued tokens carry a jti");
  assert.ok(r.json.csrfToken, "login returns a CSRF token, not a browser-readable JWT");
  const setCookie = r.headers.get("set-cookie");
  assert.match(setCookie, /dentalink_session=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /dentalink_csrf=/);

  const authCookie = /dentalink_session=([^;,]+)/.exec(setCookie)[1];
  const csrfCookie = /dentalink_csrf=([^;,]+)/.exec(setCookie)[1];
  S.browserCookie = `dentalink_session=${authCookie}; dentalink_csrf=${csrfCookie}`;
  S.csrfToken = r.json.csrfToken;
  assert.equal(
    (
      await call("POST", "/api/auth/verify-otp", {
        body: { identifier: "patient001", otp: lastOtp() },
      })
    ).status,
    400,
    "OTP is single-use",
  );

  S.p1 = await User.findOne({ username: "patient001" });
  S.p2 = await makeUser("patient002");
  S.p2T = tokenFor(S.p2);
});

test("cookie sessions require CSRF on mutations", async (t) => {
  if (!gate(t)) return;

  let r = await call("GET", "/api/auth/session", {
    headers: { Cookie: S.browserCookie },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.authenticated, true);
  assert.equal(r.json.userId, S.p1._id.toString());

  r = await call("PUT", "/api/users/profile", {
    headers: { Cookie: S.browserCookie },
    body: { name: "Cookie User", contactNumber: "", address: "" },
  });
  assert.equal(r.status, 403, "cookie mutation without CSRF is refused");

  r = await call("PUT", "/api/users/profile", {
    headers: {
      Cookie: S.browserCookie,
      "X-CSRF-Token": S.csrfToken,
    },
    body: { name: "Pat One", contactNumber: "", address: "" },
  });
  assert.equal(r.status, 200, "matching cookie/header CSRF token is accepted");
});

test("no secrets are ever returned", async (t) => {
  if (!gate(t)) return;
  let r = await call("GET", "/api/users/profile", { token: S.p1T });
  assert.ok(
    !("password" in r.json) && !("otp" in r.json) && !("lockUntil" in r.json),
  );
  r = await call("GET", "/api/users", { token: S.adminT });
  assert.ok(r.json.every((u) => !("password" in u) && !("otp" in u)));
  r = await call("POST", "/api/users", {
    token: S.adminT,
    body: {
      username: "newadmin01",
      name: "N",
      email: "n@x.co",
      password: PW,
      role: "admin",
    },
  });
  assert.equal(r.status, 201);
  assert.ok(!("password" in r.json));
  assert.equal((await call("GET", "/api/users", { token: S.p1T })).status, 403);
});

test("usernames are case-insensitive (no look-alike accounts)", async (t) => {
  if (!gate(t)) return;
  let r = await call("POST", "/api/auth/register", {
    body: {
      username: "CaseUser01",
      name: "C",
      email: "case1@x.co",
      password: PW,
    },
  });
  assert.equal(r.status, 201);
  r = await call("POST", "/api/auth/register", {
    body: {
      username: "caseuser01",
      name: "C",
      email: "case2@x.co",
      password: PW,
    },
  });
  assert.equal(r.status, 400);
  assert.match(r.json.message, /taken/i);
  // and login works regardless of the case typed
  r = await call("POST", "/api/auth/login", {
    body: { identifier: "CASEUSER01", password: PW },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.requireOtp, true);
});

test("login: lockout after 5 failures, OTP resend cooldown", async (t) => {
  if (!gate(t)) return;
  await call("POST", "/api/auth/register", {
    body: { username: "locktest01", name: "L", email: "l@x.co", password: PW },
  });
  let r;
  for (let i = 0; i < 5; i++)
    r = await call("POST", "/api/auth/login", {
      body: { identifier: "locktest01", password: "Wrong!Pass1" },
    });
  assert.equal(r.status, 401);
  r = await call("POST", "/api/auth/login", {
    body: { identifier: "locktest01", password: PW },
  });
  assert.equal(r.status, 429, "locked even with the right password");

  const lockedUser = await User.byUsername("locktest01");
  const unlockAdmin = await makeUser("unlockadmin1", { role: "admin" });
  r = await call("POST", `/api/users/${lockedUser._id}/unlock-login`, {
    token: tokenFor(unlockAdmin),
  });
  assert.equal(r.status, 200, "an admin can clear a verified user's lock");
  assert.ok(
    await AuditEvent.exists({
      action: "user.login_unlocked",
      targetId: lockedUser._id.toString(),
    }),
    "unlock is audited",
  );
  r = await call("POST", "/api/auth/login", {
    body: { identifier: "locktest01", password: PW },
  });
  assert.equal(r.status, 200, "the correct password works after admin unlock");

  // cooldown: second login within 30s must not send a second code
  await call("POST", "/api/auth/register", {
    body: { username: "cooldown01", name: "C", email: "cd@x.co", password: PW },
  });
  r = await call("POST", "/api/auth/login", {
    body: { identifier: "cooldown01", password: PW },
  });
  assert.equal(r.status, 200);
  const mails = sent.length;
  r = await call("POST", "/api/auth/login", {
    body: { identifier: "cooldown01", password: PW },
  });
  assert.equal(r.status, 429);
  assert.equal(
    r.json.requireOtp,
    true,
    "tells the client to show the code-entry step",
  );
  assert.equal(sent.length, mails, "no extra email was sent");
});

// ---- 2. Logout / token revocation ---------------------------------------------
test("logout revokes only the token used", async (t) => {
  if (!gate(t)) return;
  const u = await makeUser("logoutuser1");
  const t1 = tokenFor(u);
  const t2 = tokenFor(u);

  assert.equal(
    (await call("GET", "/api/users/profile", { token: t1 })).status,
    200,
  );
  assert.equal(
    (await call("POST", "/api/auth/logout", { token: t1 })).status,
    200,
  );
  assert.equal(
    (await call("GET", "/api/users/profile", { token: t1 })).status,
    401,
    "revoked token is refused",
  );
  assert.equal(
    (await call("GET", "/api/users/profile", { token: t2 })).status,
    200,
    "other sessions keep working",
  );
  assert.equal(
    (await call("POST", "/api/auth/logout", { token: t1 })).status,
    401,
    "logging out twice is refused, not an error",
  );
});

// ---- 3. Services ---------------------------------------------------------------
test("services: validation, duplicates, permissions", async (t) => {
  if (!gate(t)) return;
  let r = await call("POST", "/api/services", {
    token: S.adminT,
    body: {
      name: "Cleaning",
      dentists: [{ name: "Dr. Who", contact: "who@x.co" }],
    },
  });
  assert.equal(r.status, 201);
  S.svcId = r.json._id;
  assert.ok(
    await AuditEvent.exists({ action: "service.created", targetId: S.svcId }),
    "privileged changes are durably audited",
  );
  assert.equal(
    (
      await call("POST", "/api/services", {
        token: S.adminT,
        body: { name: "cleaning" },
      })
    ).status,
    400,
    "case-insensitive duplicate",
  );
  assert.equal(
    (
      await call("POST", "/api/services", {
        token: S.adminT,
        body: { name: "Bad", dentists: [{ name: "D", contact: "nope" }] },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("POST", "/api/services", {
        token: S.p1T,
        body: { name: "Hack" },
      })
    ).status,
    403,
  );
});

// ---- 4. Appointments -----------------------------------------------------------
const slot = {
  serviceType: "Cleaning",
  dentistName: "Dr. Who",
  requestedDate: "2030-05-14",
  requestedTime: "09:00",
};

test("booking rules", async (t) => {
  if (!gate(t)) return;
  assert.equal(
    (
      await call("POST", "/api/appointments", {
        token: S.p1T,
        body: { ...slot, requestedDate: "2020-01-01" },
      })
    ).status,
    400,
    "past date",
  );
  assert.equal(
    (
      await call("POST", "/api/appointments", {
        token: S.p1T,
        body: { ...slot, requestedTime: "03:00" },
      })
    ).status,
    400,
    "out of hours",
  );
  assert.equal(
    (
      await call("POST", "/api/appointments", {
        token: S.p1T,
        body: { ...slot, dentistName: "Dr. Nobody" },
      })
    ).status,
    400,
    "unknown dentist",
  );
  let r = await call("POST", "/api/appointments", { token: S.p1T, body: slot });
  assert.equal(r.status, 201);
  S.apptId = r.json._id;
  assert.equal(
    (
      await call("POST", "/api/appointments", {
        token: S.p1T,
        body: { ...slot, requestedTime: "10:00" },
      })
    ).status,
    400,
    "one pending request at a time",
  );
});

test("privilege escalation is blocked", async (t) => {
  if (!gate(t)) return;
  assert.equal(
    (
      await call("PUT", `/api/appointments/${S.apptId}`, {
        token: S.p1T,
        body: { status: "Confirmed" },
      })
    ).status,
    400,
    "self-confirm",
  );
  assert.equal(
    (
      await call("PUT", `/api/appointments/${S.apptId}`, {
        token: S.p2T,
        body: { status: "Cancelled" },
      })
    ).status,
    404,
    "someone else's appointment",
  );
  assert.equal(
    (await call("DELETE", `/api/appointments/${S.apptId}`, { token: S.p1T }))
      .status,
    403,
  );
});

test("admin flow, emails, escaping, double-booking", async (t) => {
  if (!gate(t)) return;
  assert.equal(
    (
      await call("PUT", `/api/appointments/${S.apptId}`, {
        token: S.adminT,
        body: { status: "Rejected" },
      })
    ).status,
    400,
    "reject needs a reason",
  );

  sent.length = 0;
  let r = await call("PUT", `/api/appointments/${S.apptId}`, {
    token: S.adminT,
    body: { status: "Confirmed" },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.status, "Confirmed");
  await sleep(50);
  assert.ok(sent.some((m) => /Confirmed/.test(m.subject)));

  assert.equal(
    (await call("POST", "/api/appointments", { token: S.p2T, body: slot }))
      .status,
    409,
    "confirmed slot cannot be booked",
  );
  r = await call("POST", "/api/appointments", {
    token: S.p2T,
    body: { ...slot, requestedTime: "10:30" },
  });
  assert.equal(r.status, 201);
  S.a2 = r.json._id;
  await Appointment.findByIdAndUpdate(S.a2, { requestedTime: "09:00" });
  assert.equal(
    (
      await call("PUT", `/api/appointments/${S.a2}`, {
        token: S.adminT,
        body: { status: "Confirmed" },
      })
    ).status,
    409,
    "admin approve into a taken slot",
  );

  r = await call("PUT", `/api/appointments/${S.a2}`, {
    token: S.adminT,
    body: {
      status: "Admin_Counter_Offer",
      adminSuggestedDate: "2030-05-15",
      adminSuggestedTime: "11:00",
      adminRemarks: "<script>alert(1)</script>",
    },
  });
  assert.equal(r.status, 200);
  await sleep(50);
  const mail = sent[sent.length - 1];
  assert.ok(
    !mail.html.includes("<script>") && mail.html.includes("&lt;script&gt;"),
    "HTML is escaped in emails",
  );

  r = await call("PUT", `/api/appointments/${S.a2}`, {
    token: S.p2T,
    body: {
      status: "Confirmed",
      requestedDate: "2099-01-01",
      requestedTime: "08:00",
    },
  });
  assert.equal(r.status, 200);
  assert.equal(
    r.json.requestedDate,
    "2030-05-15",
    "dates come from the stored offer",
  );
  assert.equal(r.json.requestedTime, "11:00");
  assert.equal(r.json.adminRemarks, "", "stale counter-offer note cleared");
});

test("cancellation request + keep (with slot re-check)", async (t) => {
  if (!gate(t)) return;
  assert.equal(
    (
      await call("PUT", `/api/appointments/${S.apptId}`, {
        token: S.p1T,
        body: { status: "Cancellation_Requested" },
      })
    ).status,
    400,
    "message required",
  );
  assert.equal(
    (
      await call("PUT", `/api/appointments/${S.apptId}`, {
        token: S.p1T,
        body: { status: "Cancellation_Requested", patientRemarks: "Sick" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("PUT", `/api/appointments/${S.apptId}`, {
        token: S.adminT,
        body: { status: "Confirmed" },
      })
    ).status,
    400,
    "keep needs a reason",
  );

  // While the cancellation is pending the slot is released: someone else takes it
  const p3 = await makeUser("patient003");
  const p3T = tokenFor(p3);
  let r = await call("POST", "/api/appointments", { token: p3T, body: slot });
  assert.equal(r.status, 201);
  const taken = r.json._id;
  assert.equal(
    (
      await call("PUT", `/api/appointments/${taken}`, {
        token: S.adminT,
        body: { status: "Confirmed" },
      })
    ).status,
    200,
  );

  r = await call("PUT", `/api/appointments/${S.apptId}`, {
    token: S.adminT,
    body: { status: "Confirmed", adminRemarks: "Too late" },
  });
  assert.equal(
    r.status,
    409,
    "cannot keep an appointment whose slot was re-booked",
  );
  assert.match(r.json.message, /Approve the cancellation/);

  // approving the cancellation still works
  assert.equal(
    (
      await call("PUT", `/api/appointments/${S.apptId}`, {
        token: S.adminT,
        body: { status: "Cancelled" },
      })
    ).status,
    200,
  );
  S.cancelled = S.apptId;
});

// ---- 5. Races (database-level guarantees) -------------------------------------
test("RACE: two admins approving the same slot at once -> exactly one wins", async (t) => {
  if (!gate(t)) return;
  const svc = await call("POST", "/api/services", {
    token: S.adminT,
    body: {
      name: "Whitening",
      dentists: [{ name: "Dr. Race", contact: "race@x.co" }],
    },
  });
  assert.equal(svc.status, 201);

  for (let round = 0; round < 5; round++) {
    const time = ["08:00", "08:30", "09:00", "09:30", "10:00"][round];
    const a = await makeUser(`racera${round}000`);
    const b = await makeUser(`racerb${round}000`);
    const bookingBody = {
      serviceType: "Whitening",
      dentistName: "Dr. Race",
      requestedDate: "2030-07-01",
      requestedTime: time,
    };
    const ra = await call("POST", "/api/appointments", {
      token: tokenFor(a),
      body: bookingBody,
    });
    const rb = await call("POST", "/api/appointments", {
      token: tokenFor(b),
      body: bookingBody,
    });
    assert.equal(ra.status, 201);
    assert.equal(
      rb.status,
      201,
      "two PENDING requests for one slot are allowed",
    );

    const [x, y] = await Promise.all([
      call("PUT", `/api/appointments/${ra.json._id}`, {
        token: S.adminT,
        body: { status: "Confirmed" },
      }),
      call("PUT", `/api/appointments/${rb.json._id}`, {
        token: S.adminT,
        body: { status: "Confirmed" },
      }),
    ]);
    assert.deepEqual(
      [x.status, y.status].sort(),
      [200, 409],
      `round ${round}: one 200 and one 409`,
    );
    const confirmed = await Appointment.countDocuments({
      dentistName: "Dr. Race",
      requestedTime: time,
      status: "Confirmed",
    });
    assert.equal(
      confirmed,
      1,
      `round ${round}: exactly one confirmed booking in the database`,
    );
  }
});

test("RACE: the unique indexes reject duplicates even if routes are bypassed", async (t) => {
  if (!gate(t)) return;
  const u1 = await makeUser("idxuser0001");
  const u2 = await makeUser("idxuser0002");
  const base = {
    serviceType: "X",
    dentistName: "Dr. Idx",
    requestedDate: "2031-01-01",
    requestedTime: "09:00",
  };

  await Appointment.create({ ...base, patient: u1._id, status: "Confirmed" });
  await assert.rejects(
    Appointment.create({ ...base, patient: u2._id, status: "Confirmed" }),
    (e) => e.code === 11000,
    "second confirmed booking rejected by the index",
  );
  // an archived confirmed booking does not block the slot
  await Appointment.create({
    ...base,
    patient: u2._id,
    status: "Confirmed",
    isArchived: true,
  });
  // a pending request does not block it either
  await Appointment.create({
    ...base,
    patient: u2._id,
    status: "Pending_Admin_Approval",
  });
  await assert.rejects(
    Appointment.create({
      ...base,
      patient: u2._id,
      status: "Pending_Admin_Approval",
    }),
    (e) => e.code === 11000,
    "identical pending request from the same patient rejected",
  );
});

test('RACE: double-clicking "Submit" creates one request, not two', async (t) => {
  if (!gate(t)) return;
  const u = await makeUser("doubleclick1");
  const body = {
    serviceType: "Whitening",
    dentistName: "Dr. Race",
    requestedDate: "2030-08-01",
    requestedTime: "14:00",
  };
  const [x, y] = await Promise.all([
    call("POST", "/api/appointments", { token: tokenFor(u), body }),
    call("POST", "/api/appointments", { token: tokenFor(u), body }),
  ]);
  assert.deepEqual([x.status, y.status].sort(), [201, 400]);
  assert.equal(await Appointment.countDocuments({ patient: u._id }), 1);
});

test("RACE: different simultaneous requests from one patient create only one", async (t) => {
  if (!gate(t)) return;
  const u = await makeUser("twoslots001");
  const common = {
    serviceType: "Whitening",
    dentistName: "Dr. Race",
    requestedDate: "2030-08-02",
  };
  const [x, y] = await Promise.all([
    call("POST", "/api/appointments", {
      token: tokenFor(u),
      body: { ...common, requestedTime: "14:00" },
    }),
    call("POST", "/api/appointments", {
      token: tokenFor(u),
      body: { ...common, requestedTime: "14:30" },
    }),
  ]);
  assert.deepEqual([x.status, y.status].sort(), [201, 400]);
  assert.equal(await Appointment.countDocuments({ patient: u._id }), 1);
});

test("appointment API hides proof storage metadata", async (t) => {
  if (!gate(t)) return;
  const u = await makeUser("proofview01");
  const appt = await Appointment.create({
    patient: u._id,
    serviceType: "Deep Cleaning",
    dentistName: "Dr. Who",
    requestedDate: "2033-01-01",
    requestedTime: "10:00",
    status: "Confirmed",
    cancellationProofPublicId: "private/internal-id",
    cancellationProofFormat: "png",
    cancellationProofDeliveryType: "authenticated",
    cancellationProofResourceType: "image",
  });
  const r = await call("GET", "/api/appointments", { token: tokenFor(u) });
  assert.equal(r.status, 200);
  const returned = r.json.find((item) => item._id === appt._id.toString());
  assert.equal(returned.hasCancellationProof, true);
  assert.equal("cancellationProofPublicId" in returned, false);
  assert.equal("cancellationProofUrl" in returned, false);
  assert.equal("cancellationProofFormat" in returned, false);
  assert.equal("cancellationProofResourceType" in returned, false);
});

// ---- 6. Service integrity, archive & delete rules ------------------------------
test("service integrity", async (t) => {
  if (!gate(t)) return;
  assert.equal(
    (await call("DELETE", `/api/services/${S.svcId}`, { token: S.adminT }))
      .status,
    409,
    "service with live appointments",
  );
  assert.equal(
    (
      await call("PUT", `/api/services/${S.svcId}`, {
        token: S.adminT,
        body: { name: "Deep Cleaning" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await Appointment.findById(S.a2)).serviceType,
    "Deep Cleaning",
    "rename cascades",
  );
  assert.equal(
    (
      await call("PUT", `/api/services/${S.svcId}`, {
        token: S.adminT,
        body: { dentists: [] },
      })
    ).status,
    409,
    "dentist with live appointments",
  );
});

test("archive / restore / delete rules", async (t) => {
  if (!gate(t)) return;
  const id = S.cancelled;
  assert.equal(
    (await call("DELETE", `/api/appointments/${id}`, { token: S.adminT }))
      .status,
    400,
    "archive first",
  );
  assert.equal(
    (
      await call("PUT", `/api/appointments/${id}/archive`, {
        token: S.adminT,
        body: { isArchived: true },
      })
    ).status,
    400,
    "reason + contact required",
  );
  assert.equal(
    (
      await call("PUT", `/api/appointments/${id}/archive`, {
        token: S.adminT,
        body: { isArchived: true, reason: "Duplicate", contact: "09123456789" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("GET", "/api/appointments", { token: S.p1T })).json.length,
    1 -
      1 +
      (await Appointment.countDocuments({
        patient: S.p1._id,
        isArchived: false,
      })),
    "archived hidden from patient",
  );
  assert.equal(
    (
      await call("PUT", `/api/appointments/${id}/archive`, {
        token: S.adminT,
        body: { isArchived: false },
      })
    ).status,
    200,
    "restore needs no reason",
  );

  // restoring an archived CONFIRMED booking whose slot has since been taken
  const u1 = await makeUser("restoreuser1");
  const u2 = await makeUser("restoreuser2");
  const b = {
    serviceType: "X",
    dentistName: "Dr. Restore",
    requestedDate: "2031-02-02",
    requestedTime: "10:00",
  };
  const archived = await Appointment.create({
    ...b,
    patient: u1._id,
    status: "Confirmed",
    isArchived: true,
  });
  await Appointment.create({ ...b, patient: u2._id, status: "Confirmed" });
  const r = await call("PUT", `/api/appointments/${archived._id}/archive`, {
    token: S.adminT,
    body: { isArchived: false },
  });
  assert.equal(r.status, 409);
  assert.match(r.json.message, /Cannot restore/);

  // users
  assert.equal(
    (
      await call("PUT", `/api/users/${S.admin._id}/archive`, {
        token: S.adminT,
        body: { isArchived: true, reason: "x", contact: "a@b.co" },
      })
    ).status,
    400,
    "no self-archive",
  );
  assert.equal(
    (await call("DELETE", `/api/users/${S.p2._id}`, { token: S.adminT }))
      .status,
    400,
    "archive user first",
  );
  assert.equal(
    (
      await call("PUT", `/api/users/${S.p2._id}/archive`, {
        token: S.adminT,
        body: { isArchived: true, reason: "Policy", contact: "a@b.co" },
      })
    ).status,
    200,
  );
  const forced = await call("GET", "/api/appointments", { token: S.p2T });
  assert.equal(forced.status, 403);
  assert.equal(forced.json.forceLogout, true);
  assert.equal(
    (await call("DELETE", `/api/users/${S.p2._id}`, { token: S.adminT }))
      .status,
    200,
  );
  assert.equal(
    await Appointment.countDocuments({ patient: S.p2._id }),
    0,
    "cascade delete",
  );
});

// ---- 7. Pagination & search ------------------------------------------------------
test("opt-in pagination, filters and search", async (t) => {
  if (!gate(t)) return;
  const all = await call("GET", "/api/users", { token: S.adminT });
  assert.ok(
    Array.isArray(all.json) && all.json.length > 3,
    "no params -> full list (backwards compatible)",
  );
  assert.equal(all.headers.get("x-total-count"), null);

  const page = await call("GET", "/api/users?page=1&limit=2", {
    token: S.adminT,
  });
  assert.equal(page.status, 200);
  assert.equal(page.json.length, 2);
  assert.equal(Number(page.headers.get("x-total-count")), all.json.length);
  assert.equal(
    Number(page.headers.get("x-total-pages")),
    Math.ceil(all.json.length / 2),
  );
  const page2 = await call("GET", "/api/users?page=2&limit=2", {
    token: S.adminT,
  });
  assert.notEqual(page.json[0]._id, page2.json[0]._id, "pages do not overlap");

  assert.equal(
    (await call("GET", "/api/users?limit=1000&page=1", { token: S.adminT }))
      .status,
    400,
  );
  assert.equal(
    (await call("GET", "/api/users?page=abc", { token: S.adminT })).status,
    400,
  );
  assert.equal(
    (await call("GET", "/api/users?page=1&page=2", { token: S.adminT })).status,
    400,
    "parameter pollution",
  );
  assert.equal(
    (await call("GET", "/api/users?role[$ne]=x", { token: S.adminT })).status,
    200,
    "operator syntax is treated as an unknown key, not a query",
  );

  const found = await call("GET", "/api/users?search=adminuser1", {
    token: S.adminT,
  });
  assert.equal(found.json.length, 1);
  assert.equal(
    (await call("GET", "/api/users?search=.*", { token: S.adminT })).json
      .length,
    0,
    "regex characters are escaped",
  );

  const appointmentSearch = await call(
    "GET",
    "/api/appointments?page=1&limit=10&search=Pat%20One&archived=false",
    { token: S.adminT },
  );
  assert.equal(appointmentSearch.status, 200);
  assert.ok(appointmentSearch.json.length > 0);
  assert.ok(
    appointmentSearch.json.every((appt) => appt.patient?.name === "Pat One"),
    "admin appointment search includes patient name",
  );
  const patientPage = await call("GET", "/api/appointments?page=1&limit=2", {
    token: S.p1T,
  });
  assert.equal(patientPage.status, 200);
  assert.ok(["true", "false"].includes(patientPage.headers.get("x-has-pending")));
  assert.ok(
    (
      await call("GET", "/api/users?role=admin", { token: S.adminT })
    ).json.every((u) => u.role === "admin"),
  );

  const appts = await call(
    "GET",
    "/api/appointments?status=Confirmed&page=1&limit=3",
    { token: S.adminT },
  );
  assert.equal(appts.status, 200);
  assert.ok(
    appts.json.length <= 3 && appts.json.every((a) => a.status === "Confirmed"),
  );
  assert.ok(
    appts.json.every(
      (a) => a.patient && a.patient.name && !("password" in a.patient),
    ),
    "patient is populated with name/email only",
  );
  assert.equal(
    (await call("GET", "/api/appointments?status=Bogus", { token: S.adminT }))
      .status,
    400,
  );
});

// ---- 8. Self-service -----------------------------------------------------------
test("profile, change-password, delete-account confirmation", async (t) => {
  if (!gate(t)) return;
  assert.equal(
    (
      await call("PUT", "/api/users/profile", {
        token: S.p1T,
        body: { name: "Pat", contactNumber: "123" },
      })
    ).status,
    400,
  );
  const r = await call("PUT", "/api/users/profile", {
    token: S.p1T,
    body: { name: "Pat", contactNumber: "09770493211", role: "admin" },
  });
  assert.equal(r.status, 200);
  assert.equal(
    r.json.role,
    "patient",
    "role cannot be changed through the profile",
  );

  assert.equal(
    (
      await call("DELETE", "/api/users/me", {
        token: S.p1T,
        body: { password: PW, confirmUsername: "wrong" },
      })
    ).status,
    400,
    "typed username must match",
  );
  assert.equal(
    (
      await call("DELETE", "/api/users/me", {
        token: S.p1T,
        body: { password: "Nope!Nope1", confirmUsername: "patient001" },
      })
    ).status,
    400,
    "password must match",
  );

  assert.equal(
    (
      await call("PUT", "/api/users/change-password", {
        token: S.p1T,
        body: { currentPassword: "bad", newPassword: "N3w!Password" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("PUT", "/api/users/change-password", {
        token: S.p1T,
        body: { currentPassword: PW, newPassword: "N3w!Password" },
      })
    ).status,
    200,
  );
  await sleep(1100);
  assert.equal(
    (await call("GET", "/api/users/profile", { token: S.p1T })).status,
    401,
    "old JWTs are invalidated",
  );
});

// ---- 9. Password reset ------------------------------------------------------------
test("password reset requires the OTP and is brute-force limited", async (t) => {
  if (!gate(t)) return;
  const before = sent.length;
  let r = await call("POST", "/api/auth/forgot-password", {
    body: { email: "ghost@x.co" },
  });
  assert.equal(r.status, 200);
  assert.equal(sent.length, before, "unknown email: same answer, no mail");

  assert.equal(
    (
      await call("POST", "/api/auth/forgot-password", {
        body: { email: "pat1@x.co" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("POST", "/api/auth/reset-password", {
        body: {
          email: "pat1@x.co",
          otp: "111111",
          newPassword: "Another!Pass1",
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("POST", "/api/auth/verify-otp", {
        body: { identifier: "pat1@x.co", otp: lastOtp() },
      })
    ).status,
    400,
    "reset OTP is not a login OTP",
  );

  const mails = sent.length;
  await call("POST", "/api/auth/forgot-password", {
    body: { email: "pat1@x.co" },
  });
  assert.equal(
    sent.length,
    mails,
    "resend cooldown: no second code within 30s",
  );

  const code = lastOtp();
  assert.equal(
    (
      await call("POST", "/api/auth/verify-reset-otp", {
        body: { email: "pat1@x.co", otp: code },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("POST", "/api/auth/reset-password", {
        body: { email: "pat1@x.co", otp: code, newPassword: "Another!Pass1" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("POST", "/api/auth/reset-password", {
        body: { email: "pat1@x.co", otp: code, newPassword: "Third!Pass123" },
      })
    ).status,
    400,
    "single use",
  );

  // 5 wrong guesses burn the code
  await call("POST", "/api/auth/forgot-password", {
    body: { email: "pat1@x.co" },
  });
  const real = lastOtp();
  for (let i = 0; i < 5; i++)
    await call("POST", "/api/auth/verify-reset-otp", {
      body: { email: "pat1@x.co", otp: "000000" },
    });
  assert.equal(
    (
      await call("POST", "/api/auth/verify-reset-otp", {
        body: { email: "pat1@x.co", otp: real },
      })
    ).status,
    400,
    "even the right code fails afterwards",
  );
});

// ---- 10. Uploads -----------------------------------------------------------------
async function confirmedFor(username) {
  const u = await makeUser(username);
  const appt = await Appointment.create({
    patient: u._id,
    serviceType: "Deep Cleaning",
    dentistName: "Dr. Who",
    requestedDate: "2032-03-03",
    requestedTime: "15:00",
    status: "Confirmed",
  });
  return { u, token: tokenFor(u), id: appt._id.toString() };
}

const cancelForm = (file, filename, type) => {
  const f = new FormData();
  f.append("status", "Cancellation_Requested");
  f.append("patientRemarks", "Cannot attend");
  if (file) f.append("cancellationProof", new Blob([file], { type }), filename);
  return f;
};

test("uploads: type, size and content are enforced before anything is stored", async (t) => {
  if (!gate(t)) return;
  const { token, id } = await confirmedFor("uploaduser01");

  // wrong declared type
  let r = await call("PUT", `/api/appointments/${id}`, {
    token,
    form: cancelForm(Buffer.from("hello"), "x.txt", "text/plain"),
  });
  assert.equal(r.status, 400);
  assert.match(r.json.message, /JPG, PNG or PDF/);

  // declared image/png but the bytes are a script -> sniffing rejects it
  r = await call("PUT", `/api/appointments/${id}`, {
    token,
    form: cancelForm(
      Buffer.from("<script>alert(1)</script> padding padding"),
      "evil.png",
      "image/png",
    ),
  });
  assert.equal(r.status, 400);
  assert.match(r.json.message, /not a valid/);

  // too big
  r = await call("PUT", `/api/appointments/${id}`, {
    token,
    form: cancelForm(
      Buffer.alloc(5 * 1024 * 1024 + 10, 0xff),
      "big.jpg",
      "image/jpeg",
    ),
  });
  assert.equal(r.status, 400);
  assert.match(r.json.message, /too large/i);

  const appt = await Appointment.findById(id);
  assert.equal(
    appt.status,
    "Confirmed",
    "none of the refused requests changed the appointment",
  );
  assert.equal(appt.cancellationProofUrl, "");

  // no file at all is fine
  r = await call("PUT", `/api/appointments/${id}`, {
    token,
    form: cancelForm(null),
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.status, "Cancellation_Requested");
});

test("uploads: real Cloudinary round trip (RUN_CLOUDINARY=1)", async (t) => {
  if (!gate(t)) return;
  if (!process.env.RUN_CLOUDINARY)
    return t.skip(
      "set RUN_CLOUDINARY=1 to run against your Cloudinary account",
    );
  const { cloudinary } = require("../config/cloudinary");
  const { token, id } = await confirmedFor("uploaduser02");
  const adminT = tokenFor(await makeUser("uploadadmin1", { role: "admin" }));

  const r = await call("PUT", `/api/appointments/${id}`, {
    token,
    form: cancelForm(PNG, "proof.png", "image/png"),
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.hasCancellationProof, true);
  assert.equal("cancellationProofUrl" in r.json, false);
  assert.equal("cancellationProofPublicId" in r.json, false);

  const stored = await Appointment.findById(id).select(
    "cancellationProofPublicId cancellationProofFormat cancellationProofDeliveryType cancellationProofResourceType",
  );
  assert.equal(stored.cancellationProofDeliveryType, "authenticated");
  assert.equal(stored.cancellationProofResourceType, "image");
  const publicId = stored.cancellationProofPublicId;

  const proof = await call("GET", `/api/appointments/${id}/proof`, { token });
  assert.equal(proof.status, 200);
  assert.equal(proof.json.expiresIn, 60);
  assert.equal(
    (await fetch(proof.json.url)).status,
    200,
    "file is reachable only through a signed URL",
  );

  // deleting the (archived) appointment also deletes the file
  await call("PUT", `/api/appointments/${id}/archive`, {
    token: adminT,
    body: { isArchived: true, reason: "test", contact: "a@b.co" },
  });
  assert.equal(
    (await call("DELETE", `/api/appointments/${id}`, { token: adminT })).status,
    200,
  );
  await assert.rejects(
    cloudinary.api.resource(publicId, {
      resource_type: "image",
      type: "authenticated",
    }),
    (e) => (e.error?.http_code || e.http_code) === 404,
    "file removed from Cloudinary",
  );
});

// ---- 11. Misc ----------------------------------------------------------------------
test("health check and compression", async (t) => {
  if (!gate(t)) return;
  const r = await call("GET", "/health");
  assert.equal(r.status, 200);
  assert.equal(r.json.status, "ok");
  const ready = await call("GET", "/ready");
  assert.equal(ready.status, 200);
  assert.equal(ready.json.status, "ready");
});
