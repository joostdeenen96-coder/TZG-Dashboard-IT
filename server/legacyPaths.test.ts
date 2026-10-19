import assert from "node:assert/strict";
import test from "node:test";
import { legacyDashboardSlug } from "./legacyPaths.js";

test("legacy routes planning en ict blijven gekoppeld", () => {
  assert.equal(legacyDashboardSlug("/"), "planning");
  assert.equal(legacyDashboardSlug("/ict"), "ict");
  assert.equal(legacyDashboardSlug("/display/planning"), "planning");
  assert.equal(legacyDashboardSlug("/display/ict"), "ict");
  assert.equal(legacyDashboardSlug("/display/anders"), null);
});
