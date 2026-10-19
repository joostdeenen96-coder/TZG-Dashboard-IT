import assert from "node:assert/strict";
import test from "node:test";
import { isDatabaseUnavailable, unavailableMessage } from "./httpErrors.js";

test("isDatabaseUnavailable dekt pool- en netwerkfouten", () => {
  assert.equal(isDatabaseUnavailable({ code: "ECONNREFUSED" }), true);
  assert.equal(isDatabaseUnavailable({ code: "ETIMEDOUT" }), true);
  assert.equal(isDatabaseUnavailable({ message: "could not connect to server" }), true);
  assert.equal(isDatabaseUnavailable({ code: "22P02", message: "invalid" }), false);
  assert.equal(unavailableMessage().includes("tijdelijk"), true);
});
