import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTACT_MESSAGE,
  PASSWORD_MESSAGE,
  PHONE_REGEX,
  USERNAME_MESSAGE,
  isEmailOrPhone,
  validateAccountFields,
} from "../src/utils/validation.js";

test("account validation accepts a valid matching account", () => {
  assert.equal(
    validateAccountFields({
      username: "patient01",
      password: "Strong!Pass1",
      confirmPassword: "Strong!Pass1",
    }),
    null,
  );
});

test("account validation reports username, password and confirmation failures", () => {
  assert.equal(
    validateAccountFields({
      username: "short",
      password: "Strong!Pass1",
      confirmPassword: "Strong!Pass1",
    }),
    USERNAME_MESSAGE,
  );
  assert.equal(
    validateAccountFields({
      username: "patient01",
      password: "weakpass",
      confirmPassword: "weakpass",
    }),
    PASSWORD_MESSAGE,
  );
  assert.equal(
    validateAccountFields({
      username: "patient01",
      password: "Strong!Pass1",
      confirmPassword: "Strong!Pass2",
    }),
    "Passwords do not match.",
  );
});

test("contact validation accepts supported email and phone forms", () => {
  for (const contact of [
    "clinic@example.com",
    "09770493211",
    "+63-977-0493211",
  ]) {
    assert.equal(isEmailOrPhone(contact), true, contact);
  }
  assert.equal(PHONE_REGEX.test("09770493211"), true);
  assert.equal(PHONE_REGEX.test("8709768"), true);
});

test("contact validation rejects malformed values", () => {
  for (const contact of ["", "not-an-email", "123", "name @example.com"]) {
    assert.equal(isEmailOrPhone(contact), false, `${CONTACT_MESSAGE}: ${contact}`);
  }
});