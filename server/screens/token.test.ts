import assert from "node:assert/strict";
import test from "node:test";
import { generateScreenToken, hashScreenToken, tokenHashesMatch } from "./token.js";

test("screen-token wordt alleen als hash bewaard", () => {
  const issued = generateScreenToken();
  assert.match(issued.token, /^tzg_[A-Za-z0-9_-]+$/);
  assert.equal(issued.tokenHash, hashScreenToken(issued.token));
  assert.equal(issued.tokenHash.length, 64);
  assert.equal(issued.tokenHash.includes(issued.token), false);
  assert.equal(tokenHashesMatch(issued.tokenHash, hashScreenToken(issued.token)), true);
  assert.equal(tokenHashesMatch(issued.tokenHash, hashScreenToken(`${issued.token}x`)), false);
});
