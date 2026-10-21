import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBelgiumSurcharge,
  calculateNetherlandsSurcharge,
  staffelRangeFor,
} from "./staffelEngine.js";

test("NL staffel boundary cases", () => {
  const cases: Array<[number, number]> = [
    [699.99, 0],
    [700.0, 0.05],
    [724.99, 0.05],
    [725.0, 0.1],
    [749.99, 0.1],
    [750.0, 0.15],
    [774.99, 0.15],
    [775.0, 0.2],
    [1275.0, 1.2],
    [1299.99, 1.2],
    [1300.0, 1.25],
  ];
  for (const [price, expected] of cases) {
    assert.equal(calculateNetherlandsSurcharge(price), expected, `NL ${price}`);
  }
});

test("BE staffel matches november fixture 1294.70 -> 0.96", () => {
  assert.equal(calculateBelgiumSurcharge(1294.7), 0.96);
  assert.equal(calculateBelgiumSurcharge(499.99), 0);
  assert.equal(calculateBelgiumSurcharge(500), 0.03);
  assert.equal(calculateBelgiumSurcharge(524.99), 0.03);
  assert.equal(calculateBelgiumSurcharge(525), 0.06);
});

test("staffelRangeFor NL/BE", () => {
  assert.deepEqual(staffelRangeFor("NL", 700), { from: 700, to: 724.99 });
  assert.deepEqual(staffelRangeFor("BE", 1294.7), { from: 1275, to: 1299.99 });
  assert.equal(staffelRangeFor("NL", 699.99), null);
});
