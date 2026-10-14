// Tests that run WITHOUT a database: they only exercise the layers that reject
// a request before any query is made (auth guard, validation, error handling).
// Run with:  npm test
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const app = require("../app");
const { isDocx } = require("../config/cloudinary");

let server;
let base;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(() => server.close());

const call = (method, path, { body, token } = {}) =>
  fetch(base + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

test("root and unknown routes", async () => {
  assert.equal((await call("GET", "/")).status, 200);
  assert.equal((await call("GET", "/health")).status, 200);
  assert.equal(
    (await call("GET", "/ready")).status,
    503,
    "readiness is false without a database connection",
  );
  assert.equal((await call("GET", "/api/nope")).status, 404);
});

test("security headers are set (helmet)", async () => {
  const res = await call("GET", "/");
  assert.ok(res.headers.get("x-content-type-options"));
  assert.equal(res.headers.get("x-powered-by"), null);
});

test("protected routes reject missing / bad / unsigned tokens", async () => {
  for (const [method, path] of [
    ["GET", "/api/appointments"],
    ["GET", "/api/users"],
    ["GET", "/api/services"],
    ["GET", "/api/users/profile"],
  ]) {
    assert.equal(
      (await call(method, path)).status,
      401,
      `${method} ${path} without token`,
    );
    const bad = await call(method, path, { token: "garbage" });
    assert.equal(bad.status, 401, `${method} ${path} bad token`);
    assert.equal(
      (await bad.json()).forceLogout,
      true,
      "client is told to clear its session",
    );
  }

  const none = jwt.sign({ id: "507f1f77bcf86cd799439011", role: "admin" }, "", {
    algorithm: "none",
  });
  assert.equal((await call("GET", "/api/users", { token: none })).status, 401);

  const wrongAlg = jwt.sign(
    { id: "507f1f77bcf86cd799439011", role: "admin" },
    process.env.JWT_SECRET,
    { algorithm: "HS512" },
  );
  assert.equal(
    (await call("GET", "/api/users", { token: wrongAlg })).status,
    401,
  );
});

test("register validation", async () => {
  const good = {
    username: "validuser1",
    name: "Jane Doe",
    email: "jane@example.com",
    password: "Str0ng!Pass",
  };

  const cases = [
    [{ ...good, username: "short" }, /Username/],
    [{ ...good, email: "not-an-email" }, /email/i],
    [{ ...good, password: "weakpass" }, /Password/],
    [{ ...good, name: "" }, /name/i],
    [{ ...good, role: "admin", password: "x" }, /Password/],
  ];
  for (const [body, pattern] of cases) {
    const res = await call("POST", "/api/auth/register", { body });
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, pattern);
  }
});

test("NoSQL operator injection is rejected before reaching the database", async () => {
  const login = await call("POST", "/api/auth/login", {
    body: { identifier: { $gt: "" }, password: { $gt: "" } },
  });
  assert.equal(login.status, 400);

  const forgot = await call("POST", "/api/auth/forgot-password", {
    body: { email: { $ne: null } },
  });
  assert.equal(forgot.status, 400);

  const reset = await call("POST", "/api/auth/reset-password", {
    body: { email: "a@b.co", otp: { $ne: null }, newPassword: "Str0ng!Pass" },
  });
  assert.equal(reset.status, 400);
});

test("reset-password now requires an OTP (cannot reset with email alone)", async () => {
  const res = await call("POST", "/api/auth/reset-password", {
    body: { email: "victim@example.com", newPassword: "Str0ng!Pass" },
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).message, /OTP/);
});

test("OTP must be exactly 6 digits", async () => {
  const res = await call("POST", "/api/auth/verify-otp", {
    body: { identifier: "someone1", otp: "12ab56" },
  });
  assert.equal(res.status, 400);
});

test("malformed JSON returns 400, not 500", async () => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ not json",
  });
  assert.equal(res.status, 400);
});

test("legacy DOCX detection rejects a generic ZIP package", () => {
  const zip = Buffer.from("PK\x03\x04random/archive.txt");
  const docx = Buffer.from(
    "PK\x03\x04[Content_Types].xml\0_rels/.rels\0word/document.xml",
  );
  assert.equal(isDocx(zip), false);
  assert.equal(isDocx(docx), true);
});
